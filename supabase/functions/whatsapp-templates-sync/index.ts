// Creates / submits / refreshes the platform's WhatsApp message templates on
// Twilio (Content API) and keeps public.whatsapp_templates in sync.
//
// Meta only allows two kinds of outbound WhatsApp messages: free-form replies
// inside a 24h customer-service window, and pre-approved templates. Every cold
// message the app generates (tournament invites, reminders, campaigns) must go
// through one of the templates registered here.
//
// Platform admins only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Row = {
  id: string;
  key: string;
  friendly_name: string;
  category: string;
  language: string;
  body: string;
  quick_replies: string[] | null;
  content_sid: string | null;
  approval_status: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const twilioKey = Deno.env.get("TWILIO_API_KEY");

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Automated callers (the hourly cron and send-whatsapp, which self-heals
    // when it meets a template that is not registered yet) authenticate with a
    // shared internal secret stored in app_settings.
    const headerSecret = req.headers.get("x-internal-secret");
    let isInternal = false;
    if (headerSecret) {
      const { data: secretRow } = await admin
        .from("app_settings")
        .select("value")
        .eq("key", "whatsapp_templates_internal_secret")
        .maybeSingle();
      isInternal = !!secretRow?.value && secretRow.value === headerSecret;
      if (!isInternal) return json({ error: "Not authenticated" }, 401);
    }

    const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!isInternal && !bearer) return json({ error: "Not authenticated" }, 401);
    isInternal = isInternal || bearer === serviceKey;
    if (!isInternal) {
      const { data: userData } = await admin.auth.getUser(bearer);
      const userId = userData?.user?.id;
      if (!userId) return json({ error: "Not authenticated" }, 401);
      const { data: isPlatformAdmin } = await admin.rpc("is_platform_admin", { _user_id: userId });
      if (!isPlatformAdmin) return json({ error: "Platform admin only" }, 403);
    }

    if (!lovableKey || !twilioKey) {
      return json({ error: "Twilio is not connected for this project." }, 503);
    }

    const headers = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
    };

    const payload = (await req.json().catch(() => ({}))) as {
      keys?: string[];
      /** Skip templates that are already approved (used by the cron). */
      pending_only?: boolean;
    };

    let query = admin
      .from("whatsapp_templates")
      .select("id, key, friendly_name, category, language, body, quick_replies, content_sid, approval_status");
    if (payload.keys?.length) query = query.in("key", payload.keys);
    if (payload.pending_only) query = query.neq("approval_status", "approved");
    const { data: rows, error: rowsErr } = await query;
    if (rowsErr) return json({ error: rowsErr.message }, 500);

    const results: Array<Record<string, unknown>> = [];

    for (const row of (rows ?? []) as Row[]) {
      let contentSid = row.content_sid;
      let status = row.approval_status;
      let approvalError: string | null = null;

      try {
        // 1. Create the content resource if we do not have one yet.
        if (!contentSid) {
          const varCount = [...row.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
          const variables: Record<string, string> = {};
          for (const n of new Set(varCount)) variables[String(n)] = `sample ${n}`;

          const quick = Array.isArray(row.quick_replies) ? row.quick_replies : [];
          const types: Record<string, unknown> = quick.length
            ? {
                "twilio/quick-reply": {
                  body: row.body,
                  actions: quick.map((title, i) => ({
                    type: "QUICK_REPLY",
                    title,
                    id: `opt_${i + 1}`,
                  })),
                },
              }
            : { "twilio/text": { body: row.body } };

          const createResp = await fetch(`${GATEWAY_URL}/content/v1/Content`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              friendly_name: row.friendly_name,
              language: row.language,
              variables,
              types,
            }),
          });
          const createText = await createResp.text();
          if (!createResp.ok) throw new Error(`create [${createResp.status}] ${createText}`);
          contentSid = (JSON.parse(createText) as { sid?: string }).sid ?? null;
          status = "created";
        }

        // 2. Read the current approval state from Twilio first — a template
        // that Meta already has must never be re-submitted (error 92009).
        const readStatus = async () => {
          if (!contentSid) return;
          const statusResp = await fetch(
            `${GATEWAY_URL}/content/v1/Content/${contentSid}/ApprovalRequests`,
            { method: "GET", headers },
          );
          const statusText = await statusResp.text();
          if (!statusResp.ok) return;
          try {
            const parsed = JSON.parse(statusText) as {
              whatsapp?: { status?: string; rejection_reason?: string };
            };
            if (parsed.whatsapp?.status) status = parsed.whatsapp.status;
            approvalError = parsed.whatsapp?.rejection_reason ?? null;
          } catch {
            /* keep the current status */
          }
        };

        await readStatus();

        // Statuses that mean Meta already holds this template.
        const SUBMITTED = ["received", "pending", "approved", "rejected", "paused", "disabled"];

        // 3. Submit for approval only when it has never been submitted.
        if (contentSid && !SUBMITTED.includes(status)) {
          const approveResp = await fetch(
            `${GATEWAY_URL}/content/v1/Content/${contentSid}/ApprovalRequests/whatsapp`,
            {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ name: row.friendly_name, category: row.category }),
            },
          );
          const approveText = await approveResp.text();
          if (!approveResp.ok) {
            // 92009 = already submitted; treat as success and re-read.
            if (!approveText.includes("92009")) {
              throw new Error(`submit [${approveResp.status}] ${approveText}`);
            }
          }
          status = "received";
          await readStatus();
        }

      } catch (e) {
        approvalError = e instanceof Error ? e.message : String(e);
        if (!contentSid) status = "error";
        console.error(`whatsapp template ${row.key}: ${approvalError}`);
      }

      await admin
        .from("whatsapp_templates")
        .update({
          content_sid: contentSid,
          approval_status: status,
          approval_error: approvalError,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      results.push({ key: row.key, content_sid: contentSid, status, error: approvalError });
    }

    const approved = results.filter((r) => r.status === "approved").length;
    return json({ total: results.length, approved, results });
  } catch (e) {
    console.error("whatsapp-templates-sync error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

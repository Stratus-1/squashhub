// deno-lint-ignore-file no-explicit-any
//
// Dispatcher for SquashHub → club administrator "Platform Updates".
//
// Sender identity is always the platform (never a club's own SMTP).
// Every recipient/channel attempt is written to platform_update_recipients,
// which doubles as the durable "Updates from SquashHub" inbox for club admins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { renderMerge, htmlToPlainText } from "../_shared/comms-render.ts";
import { sendAppEmail } from "../_shared/send-app-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CHANNELS = ["in_app", "email", "whatsapp", "sms"] as const;
type Channel = typeof CHANNELS[number];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalisePhone(raw?: string | null, cc = "27"): string | null {
  if (!raw) return null;
  let s = String(raw).replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) s = cc + s.slice(1);
  if (s.length < 8 || s.length > 15) return null;
  return s;
}

/** Resolve the clubs a campaign applies to. */
async function targetClubs(c: any): Promise<any[]> {
  let ids: string[] | null = null;

  if (c.audience_type === "clubs") {
    ids = (c.audience_club_ids ?? []) as string[];
  } else if (c.audience_type === "association") {
    const { data } = await admin
      .from("association_affiliated_clubs")
      .select("club_id")
      .eq("association_id", c.audience_association_id);
    ids = (data ?? []).map((r: any) => r.club_id).filter(Boolean);
  } else if (c.audience_type === "plan") {
    const { data } = await admin
      .from("club_subscriptions")
      .select("club_id")
      .eq("plan_id", c.audience_plan_id);
    ids = (data ?? []).map((r: any) => r.club_id).filter(Boolean);
  } else if (c.audience_type === "admins") {
    const { data } = await admin
      .from("club_members")
      .select("club_id")
      .in("id", (c.audience_member_ids ?? []) as string[]);
    ids = [...new Set((data ?? []).map((r: any) => r.club_id).filter(Boolean))];
  }

  let q = admin.from("clubs").select("id,name,email,phone,subdomain").order("name");
  if (ids) {
    if (!ids.length) return [];
    q = q.in("id", ids);
  }
  const { data } = await q;
  return data ?? [];
}

/** Club administrators of the target clubs, de-duplicated per person. */
async function expandRecipients(c: any) {
  const clubs = await targetClubs(c);
  if (!clubs.length) return { clubs, recipients: [] as any[] };
  const clubById = new Map(clubs.map((cl) => [cl.id, cl]));

  let q = admin
    .from("club_members")
    .select("id,club_id,user_id,name,email,phone,role,status,whatsapp_opt_out,sms_opt_out")
    .in("club_id", clubs.map((cl) => cl.id))
    .in("role", ["admin", "captain"])
    .neq("status", "resigned");

  if (c.audience_type === "admins") {
    const ids = (c.audience_member_ids ?? []) as string[];
    if (!ids.length) return { clubs, recipients: [] };
    q = q.in("id", ids);
  }

  const { data } = await q;
  const rows = data ?? [];

  // De-duplicate the same human across several clubs, but keep every club.
  const byPerson = new Map<string, any>();
  for (const r of rows) {
    const key = r.user_id || (r.email ? String(r.email).toLowerCase() : r.id);
    const existing = byPerson.get(key);
    if (existing) {
      if (!existing.club_ids.includes(r.club_id)) existing.club_ids.push(r.club_id);
      continue;
    }
    byPerson.set(key, { ...r, club_ids: [r.club_id], club: clubById.get(r.club_id) });
  }
  return { clubs, recipients: [...byPerson.values()] };
}

async function mergeVars(r: any, extra: Record<string, string>) {
  const full = String(r.name || "").trim();
  const [first, ...rest] = full.split(/\s+/);
  const { data: assoc } = await admin
    .from("association_affiliated_clubs")
    .select("league_associations(name)")
    .eq("club_id", r.club_id)
    .limit(1)
    .maybeSingle();
  const { data: sub } = await admin
    .from("club_subscriptions")
    .select("subscription_plans(name)")
    .eq("club_id", r.club_id)
    .limit(1)
    .maybeSingle();
  return {
    first_name: first || "",
    surname: rest.join(" "),
    name: full,
    club_name: String(r.club?.name || ""),
    association_name: String((assoc as any)?.league_associations?.name || ""),
    club_email: String(r.club?.email || ""),
    club_phone: String(r.club?.phone || ""),
    subscription_plan: String((sub as any)?.subscription_plans?.name || ""),
    ...extra,
  } as Record<string, string>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    const isInternal = !!SERVICE_KEY && bearer === SERVICE_KEY;

    const body = await req.json().catch(() => ({}));
    const campaignId = body?.campaign_id;
    const failedOnly = !!body?.failed_only;
    if (!campaignId) return json({ error: "campaign_id required" }, 400);

    if (!isInternal) {
      const { data: userData } = await admin.auth.getUser(bearer);
      const userId = userData?.user?.id;
      if (!userId) return json({ error: "Not authenticated" }, 401);
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (!isAdmin) return json({ error: "Platform super admins only" }, 403);
    }

    const { data: campaign } = await admin
      .from("platform_update_campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (!campaign) return json({ error: "Campaign not found" }, 404);
    if (campaign.status === "sending") return json({ error: "Campaign is already sending" }, 400);
    if (campaign.status === "sent" && !failedOnly) {
      return json({ error: "Campaign has already been sent. Duplicate it instead." }, 400);
    }

    const channels = (campaign.channels ?? []).filter((ch: string) =>
      (CHANNELS as readonly string[]).includes(ch)) as Channel[];
    if (!channels.length) return json({ error: "No channels selected" }, 400);
    if (!String(campaign.body_html || "").replace(/<[^>]*>/g, "").trim()) {
      return json({ error: "This campaign has no message body" }, 400);
    }

    const { clubs, recipients } = await expandRecipients(campaign);
    if (!recipients.length) {
      await admin.from("platform_update_campaigns").update({
        status: "failed", total_recipients: 0, last_error: "No club administrators matched",
      }).eq("id", campaignId);
      return json({ error: "No club administrators matched this audience" }, 400);
    }

    // Resend-to-failed narrows the work to previously failed rows.
    let retryKeys: Set<string> | null = null;
    if (failedOnly) {
      const { data: prev } = await admin
        .from("platform_update_recipients")
        .select("club_member_id,channel")
        .eq("campaign_id", campaignId)
        .eq("status", "failed");
      retryKeys = new Set((prev ?? []).map((p: any) => `${p.club_member_id}|${p.channel}`));
      if (!retryKeys.size) return json({ error: "No failed recipients to resend to" }, 400);
    }

    await admin.from("platform_update_campaigns").update({
      status: "sending",
      total_recipients: recipients.length,
      targeted_club_ids: clubs.map((c) => c.id),
      last_error: null,
    }).eq("id", campaignId);

    let sent = 0, failed = 0, skipped = 0;

    for (const r of recipients) {
      const vars = await mergeVars(r, {
        action_label: String(campaign.action_label || ""),
        action_url: String(campaign.action_url || ""),
      });
      const subject = renderMerge(campaign.subject || "Update from SquashHub", vars);
      const html = renderMerge(campaign.body_html || "", vars);
      const plain = htmlToPlainText(html);
      const actionUrl = renderMerge(campaign.action_url || "", vars);
      const actionLabel = String(campaign.action_label || "").trim();

      for (const ch of channels) {
        if (retryKeys && !retryKeys.has(`${r.id}|${ch}`)) continue;

        const base = {
          campaign_id: campaignId,
          club_id: r.club_id,
          club_member_id: r.id,
          user_id: r.user_id ?? null,
          recipient_name: r.name ?? null,
          club_name: r.club?.name ?? null,
          channel: ch,
          subject,
          body: ch === "in_app" ? plain : html,
          action_label: actionLabel || null,
          action_url: actionUrl || null,
        };

        const log = async (status: string, target: string | null, error?: string | null) => {
          await admin.from("platform_update_recipients").upsert(
            {
              ...base,
              target,
              status,
              error_message: error ?? null,
              sent_at: status === "sent" ? new Date().toISOString() : null,
            },
            { onConflict: "campaign_id,club_member_id,channel" },
          );
        };

        try {
          if (ch === "in_app") {
            await log("sent", r.user_id ?? null);
            if (r.user_id) {
              await admin.from("notifications").insert({
                user_id: r.user_id,
                club_member_id: r.id,
                title: subject,
                message: plain.slice(0, 500),
                type: "platform_update",
                url: "/club-admin?tab=updates",
                data: { platform_campaign_id: campaignId, action_label: actionLabel, action_url: actionUrl },
              });
            }
            sent++;
          } else if (ch === "email") {
            if (!r.email || !String(r.email).includes("@")) {
              skipped++; await log("skipped", null, "No email address"); continue;
            }
            const res = await sendAppEmail({
              templateName: "club-notification",
              recipientEmail: r.email,
              clubId: r.club_id,
              idempotencyKey: `platform-update-${campaignId}-${r.id}`,
              templateData: {
                clubName: "SquashHub Platform Updates",
                title: subject,
                messageBody: plain,
                url: actionUrl || undefined,
                ctaLabel: actionLabel || "Open SquashHub",
                recipientName: r.name || undefined,
              },
            });
            if (res.ok && res.sent) { sent++; await log("sent", r.email); }
            else if (res.ok) { skipped++; await log("skipped", r.email, res.reason); }
            else { failed++; await log("failed", r.email, res.error); }
          } else if (ch === "whatsapp" || ch === "sms") {
            const optedOut = ch === "whatsapp" ? r.whatsapp_opt_out : r.sms_opt_out;
            if (optedOut) { skipped++; await log("skipped", null, "Opted out"); continue; }
            const phone = normalisePhone(r.phone);
            if (!phone) { skipped++; await log("skipped", null, "No mobile number"); continue; }

            const text = actionUrl ? `${plain}\n\n${actionLabel ? `${actionLabel}: ` : ""}${actionUrl}` : plain;
            const fn = ch === "whatsapp" ? "send-whatsapp" : "send-sms";
            const payload = ch === "whatsapp"
              ? {
                  club_id: r.club_id,
                  recipients: [{ member_id: r.id, phone: r.phone }],
                  body: text,
                  template_key: "club_notice",
                  template_variables: { message: plain, link: actionUrl || "" },
                  kind: "platform_update",
                  category: "utility",
                }
              : {
                  club_id: r.club_id,
                  platform: true,
                  recipients: [{ member_id: r.id, phone: r.phone }],
                  body: text,
                  kind: "platform_update",
                  critical: true,
                };
            const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
              body: JSON.stringify(payload),
            });
            const out = await res.json().catch(() => ({}));
            if (!res.ok || (out?.sent ?? 0) < 1) {
              failed++;
              await log("failed", phone, String(out?.error || out?.results?.[0]?.error || `${ch} send failed`).slice(0, 500));
            } else { sent++; await log("sent", phone); }
          }
        } catch (err) {
          failed++;
          await admin.from("platform_update_recipients").upsert(
            { ...base, target: null, status: "failed", error_message: String((err as Error)?.message || err).slice(0, 500) },
            { onConflict: "campaign_id,club_member_id,channel" },
          );
        }
      }
    }

    const status = sent === 0 ? "failed" : failed > 0 ? "partial" : "sent";
    await admin.from("platform_update_campaigns").update({
      status, sent_count: sent, failed_count: failed, skipped_count: skipped,
      sent_at: new Date().toISOString(),
    }).eq("id", campaignId);

    return json({ ok: true, status, sent, failed, skipped, clubs: clubs.length, recipients: recipients.length });
  } catch (err) {
    return json({ error: (err as Error)?.message || String(err) }, 500);
  }
});

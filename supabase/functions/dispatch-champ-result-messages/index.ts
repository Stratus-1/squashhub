// Delivers queued tournament post-match result messages on WhatsApp / SMS.
// Rows are created only by the queue_champ_result_emails() trigger after a
// genuine completed result; each (result, member, channel) row is unique, so
// a result can never be sent twice. Takes no input — safe to call on a schedule.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: rows, error } = await admin
    .from("champ_result_notifications")
    .select("id, club_id, club_member_id, channel, subject, body, attempts")
    .eq("status", "pending")
    .in("channel", ["whatsapp", "sms"])
    .lt("attempts", 3)
    .order("created_at")
    .limit(40);
  if (error) return json({ error: error.message }, 500);

  let sent = 0, failed = 0;
  for (const r of rows ?? []) {
    // Claim the row first so overlapping runs can't double-send.
    const { data: claimed } = await admin
      .from("champ_result_notifications")
      .update({ status: "sending", attempts: (r.attempts ?? 0) + 1 })
      .eq("id", r.id).eq("status", "pending")
      .select("id").maybeSingle();
    if (!claimed) continue;

    const text = String(r.body ?? r.subject ?? "").trim();
    const smsText = `${r.subject ?? ""}`.slice(0, 300);
    const fn = r.channel === "whatsapp" ? "send-whatsapp" : "send-sms";
    const payload = r.channel === "whatsapp"
      ? {
          club_id: r.club_id, recipients: [{ member_id: r.club_member_id }], body: text,
          template_key: "club_notice", template_variables: { message: text },
          kind: "champ_result", category: "utility",
        }
      : { club_id: r.club_id, recipients: [{ member_id: r.club_member_id }], body: smsText, kind: "champ_result" };

    let status = "failed", err: string | null = null;
    try {
      const res = await fetch(`${url}/functions/v1/${fn}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const out = await res.json().catch(() => ({}));
      const result = out?.results?.[0];
      if (res.ok && Number(out?.sent ?? 0) > 0) status = "sent";
      else if (result?.status === "skipped") { status = "skipped"; err = result?.error ?? "skipped"; }
      else err = out?.error ?? result?.error ?? `HTTP ${res.status}`;
    } catch (e) {
      err = String((e as Error)?.message ?? e);
    }
    // Transient failures go back to pending for a retry (max 3 attempts).
    const finalStatus = status === "failed" && (r.attempts ?? 0) + 1 < 3 ? "pending" : status;
    await admin.from("champ_result_notifications")
      .update({ status: finalStatus, error: err, processed_at: new Date().toISOString() })
      .eq("id", r.id);
    status === "sent" ? sent++ : failed++;
  }
  return json({ ok: true, processed: rows?.length ?? 0, sent, failed });
});

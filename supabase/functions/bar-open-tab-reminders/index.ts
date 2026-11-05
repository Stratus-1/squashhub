// Reminds the owner of a bar tab that is still open after midnight
// (Johannesburg) to come and close it. Channels are chosen per club in
// club_bar_settings (open_tab_reminder_whatsapp/sms/email, all off by default).
// One reminder per tab, per day, per channel (unique row in
// bar_open_tab_reminders), so repeated runs never double-send.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const jhbToday = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const today = jhbToday();
  const startOfTodayUtc = new Date(`${today}T00:00:00+02:00`).toISOString();

  const { data: settings, error: sErr } = await admin
    .from("club_bar_settings")
    .select("club_id, open_tab_reminder_whatsapp, open_tab_reminder_sms, open_tab_reminder_email")
    .or("open_tab_reminder_whatsapp.eq.true,open_tab_reminder_sms.eq.true,open_tab_reminder_email.eq.true");
  if (sErr) return json({ error: sErr.message }, 500);

  let sent = 0, skipped = 0, failed = 0;
  for (const s of settings ?? []) {
    const { data: club } = await admin.from("clubs").select("name, subdomain").eq("id", s.club_id).maybeSingle();
    const clubName = club?.name ?? "your club";
    const link = club?.subdomain ? `https://${club.subdomain}.squashhub.co.za/bar` : "https://squashhub.co.za/bar";
    const { data: tabs } = await admin
      .from("bar_guest_tabs")
      .select("id, club_member_id, guest_name, guest_phone, opened_at")
      .eq("club_id", s.club_id).eq("status", "open").lt("opened_at", startOfTodayUtc).limit(500);

    for (const t of tabs ?? []) {
      let member: any = null;
      if (t.club_member_id) {
        const { data } = await admin.from("club_members").select("id, name, email").eq("id", t.club_member_id).maybeSingle();
        member = data;
      }
      const who = (member?.name || t.guest_name || "there").split(" ")[0];
      const opened = new Date(t.opened_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "Africa/Johannesburg" });
      const message = `Hi ${who}, your bar tab at ${clubName} opened on ${opened} is still open. Please settle and close your tab as soon as possible. Thank you.`;
      const channels = (["whatsapp", "sms", "email"] as const).filter((c) => (s as any)[`open_tab_reminder_${c}`]);

      for (const ch of channels) {
        if (ch === "email" && !member?.email) { skipped++; continue; }
        if (ch !== "email" && !member && !t.guest_phone) { skipped++; continue; }
        // Claim first: the unique (tab, day, channel) row blocks a second send.
        const { error: claimErr } = await admin.from("bar_open_tab_reminders")
          .insert({ club_id: s.club_id, tab_id: t.id, reminder_date: today, channel: ch });
        if (claimErr) { skipped++; continue; }

        let status = "failed", err: string | null = null;
        try {
          if (ch === "email") {
            const { error } = await admin.from("email_outbox").insert({
              club_id: s.club_id, club_member_id: member.id, recipient_email: member.email, recipient_name: member.name,
              subject: `Please close your bar tab at ${clubName}`, body: message, url: link, cta_label: "Open my tab",
              kind: "bar_open_tab_reminder", ref_id: t.id, status: "pending", scheduled_for: new Date().toISOString(),
            });
            if (error) err = error.message; else status = "sent";
          } else {
            const recipient = member ? { member_id: member.id } : { phone: t.guest_phone };
            const payload = ch === "whatsapp"
              ? { club_id: s.club_id, recipients: [recipient], body: message, template_key: "club_notice",
                  template_variables: { club: clubName, message, link }, kind: "bar_open_tab_reminder", category: "utility" }
              : { club_id: s.club_id, recipients: [recipient], body: message, kind: "bar_open_tab_reminder", critical: true };
            const res = await fetch(`${url}/functions/v1/send-${ch}`, {
              method: "POST",
              headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const out = await res.json().catch(() => ({}));
            const r0 = out?.results?.[0];
            if (res.ok && Number(out?.sent ?? 0) > 0) status = "sent";
            else if (r0?.status === "skipped") { status = "skipped"; err = r0?.error ?? "skipped"; }
            else err = out?.error ?? r0?.error ?? `HTTP ${res.status}`;
          }
        } catch (e) { err = String((e as Error)?.message ?? e); }
        await admin.from("bar_open_tab_reminders").update({ status, error: err })
          .eq("tab_id", t.id).eq("reminder_date", today).eq("channel", ch);
        status === "sent" ? sent++ : status === "skipped" ? skipped++ : failed++;
      }
    }
  }
  return json({ ok: true, date: today, sent, skipped, failed });
});

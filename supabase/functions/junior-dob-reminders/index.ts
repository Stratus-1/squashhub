// Reminds juniors (or their parents) to add a missing date of birth so the
// junior is placed in the right age group. Owner-requested 21 Nov 2026.
// Who: SportyHQ junior-player tick on, no birth date / ID anywhere, and an
// email or mobile number on a club membership (public.junior_dob_due()).
// Channels: email, WhatsApp and in-app (when they have a login).
// Cadence: every 14 days, at most 3 rounds; stops once the date is added.
// The unique (person, round, channel) row is claimed before each send, so
// repeated runs never double-send. Body { "dry_run": true } only counts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true;

  const { data: due, error } = await admin.rpc("junior_dob_due");
  if (error) return json({ error: error.message }, 500);
  if (dryRun) {
    const byClub: Record<string, number> = {};
    for (const d of due ?? []) byClub[d.club_name] = (byClub[d.club_name] ?? 0) + 1;
    return json({ ok: true, dry_run: true, due: (due ?? []).length, byClub });
  }

  let sent = 0, skipped = 0, failed = 0;
  // One junior can appear as two person records at two clubs (same name and
  // contact): remind the family once per run.
  const seen = new Set<string>();
  for (const d of due ?? []) {
    const key = `${String(d.name || "").trim().toLowerCase()}|${String(d.email || d.phone || "").trim().toLowerCase()}`;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    const { data: token, error: tErr } = await admin.rpc("junior_dob_issue_link", {
      _person_id: d.person_id, _club_member_id: d.club_member_id, _club_id: d.club_id,
    });
    if (tErr || !token) { failed++; continue; }
    const path = `/birth-date/${token}`;
    const link = d.subdomain ? `https://${d.subdomain}.squashhub.co.za${path}` : `https://squashhub.co.za${path}`;
    const first = String(d.name || "").split(" ")[0] || "your junior";
    const clubName = d.club_name || "your club";
    const message =
      `Hi! To place ${d.name} in the right junior squash age group (U11–U19) at ${clubName}, we need ${first}'s date of birth. ` +
      `Please add it with this secure link (no login needed, takes a few seconds): ${link}`;
    const channels: Array<"email" | "whatsapp" | "in_app"> = [];
    if (d.email) channels.push("email");
    if (d.phone) channels.push("whatsapp");
    if (d.user_id) channels.push("in_app");

    for (const ch of channels) {
      const { error: claimErr } = await admin.from("junior_dob_reminders").insert({
        person_id: d.person_id, club_member_id: d.club_member_id, club_id: d.club_id, round: d.next_round, channel: ch,
      });
      if (claimErr) { skipped++; continue; }
      let status = "failed", err: string | null = null;
      try {
        if (ch === "email") {
          const { error } = await admin.from("email_outbox").insert({
            club_id: d.club_id, club_member_id: d.club_member_id, recipient_email: d.email, recipient_name: d.name,
            subject: `Please add ${first}'s date of birth – ${clubName}`, body: message, url: link,
            cta_label: "Add date of birth", kind: "junior_dob_reminder", ref_id: d.person_id,
            status: "pending", scheduled_for: new Date().toISOString(),
          });
          if (error) err = error.message; else status = "sent";
        } else if (ch === "in_app") {
          const { error } = await admin.from("notifications").insert({
            user_id: d.user_id, club_member_id: d.club_member_id,
            title: `Please add ${first}'s date of birth`,
            message: `We need ${first}'s date of birth to place them in the right junior squash age group.`,
            type: "junior_dob_reminder", url: path, data: { person_id: d.person_id, suppress_email: "true" },
          });
          if (error) err = error.message; else status = "sent";
        } else {
          const res = await fetch(`${url}/functions/v1/send-whatsapp`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              club_id: d.club_id, recipients: [{ member_id: d.club_member_id }], body: message,
              template_key: "club_notice", template_variables: { club: clubName, message, link },
              kind: "junior_dob_reminder", category: "utility",
            }),
          });
          const out = await res.json().catch(() => ({}));
          const r0 = out?.results?.[0];
          if (res.ok && Number(out?.sent ?? 0) > 0) status = "sent";
          else if (r0?.status === "skipped") { status = "skipped"; err = r0?.error ?? "skipped"; }
          else err = out?.error ?? r0?.error ?? `HTTP ${res.status}`;
        }
      } catch (e) { err = String((e as Error)?.message ?? e); }
      await admin.from("junior_dob_reminders").update({ status, error: err })
        .eq("person_id", d.person_id).eq("round", d.next_round).eq("channel", ch);
      status === "sent" ? sent++ : status === "skipped" ? skipped++ : failed++;
    }
  }
  return json({ ok: true, people: (due ?? []).length, sent, skipped, failed });
});

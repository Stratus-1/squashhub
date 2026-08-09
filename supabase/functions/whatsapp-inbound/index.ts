// Inbound WhatsApp webhook (Twilio).
//
// Twilio POSTs a form-encoded body here whenever a member replies to a
// SquashHub WhatsApp message — either free text ("yes") or a tap on a quick
// reply button (ButtonPayload / ButtonText).
//
// The reply is matched back to the most recent pending row in
// `whatsapp_interactions` for that phone number, and the answer is written
// straight into the app (event RSVP, tournament entry, ...).
//
// Configured in Twilio: Messaging → Sender → "When a message comes in" →
//   https://<project>.supabase.co/functions/v1/whatsapp-inbound
//
// verify_jwt = false (Twilio cannot send a Supabase JWT).
import { createClient } from "npm:@supabase/supabase-js@2";

function twiml(message?: string) {
  const body = message
    ? `<Response><Message>${message.replace(/[<>&]/g, "")}</Message></Response>`
    : `<Response/>`;
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function normalisePhone(raw?: string | null, defaultCc = "27"): string | null {
  if (!raw) return null;
  let s = String(raw).replace(/^whatsapp:/i, "").trim().replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) s = defaultCc + s.slice(1);
  if (s.length < 8 || s.length > 15) return null;
  return s;
}

/** Read an intent out of a button payload or free text. */
function parseAnswer(payload: string, text: string): "yes" | "no" | "stop" | null {
  const raw = `${payload} ${text}`.toLowerCase().trim();
  if (/\b(stop|unsubscribe|opt\s*out)\b/.test(raw)) return "stop";
  if (/\b(yes|y|ja|yebo|in|confirm|accept|attending|going|👍)\b/.test(raw)) return "yes";
  if (/\b(no|n|nee|out|decline|cant|can't|cannot|not)\b/.test(raw)) return "no";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return twiml();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const form = new URLSearchParams(await req.text());
    const params = Object.fromEntries(form.entries());
    const from = normalisePhone(params.From);
    const text = params.Body ?? "";
    const buttonPayload = params.ButtonPayload ?? params.ButtonText ?? "";
    const sid = params.MessageSid ?? params.SmsMessageSid ?? null;

    if (!from) return twiml();

    // Most recent pending question we asked this number.
    const { data: interaction } = await admin
      .from("whatsapp_interactions")
      .select("id, club_id, member_id, kind, target_id")
      .eq("phone", from)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fall back to the last club we messaged this number from, so the inbound
    // message is still logged (and billed) against the right club.
    let clubId = interaction?.club_id ?? null;
    let memberId = interaction?.member_id ?? null;
    if (!clubId) {
      const { data: lastOut } = await admin
        .from("whatsapp_send_log")
        .select("club_id, member_id")
        .eq("to_phone", from)
        .eq("direction", "out")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      clubId = lastOut?.club_id ?? null;
      memberId = memberId ?? lastOut?.member_id ?? null;
    }

    const answer = parseAnswer(buttonPayload, text);

    // Log the inbound message. Replies land inside the free 24h service window,
    // so they are recorded at the (cheaper) service rate.
    let unitCost = 0;
    if (clubId) {
      const { data: rate } = await admin.rpc("whatsapp_rate", {
        _club_id: clubId,
        _category: "service",
      });
      unitCost = Number(rate ?? 0);
      await admin.from("whatsapp_send_log").insert({
        club_id: clubId,
        member_id: memberId,
        to_phone: from,
        from_phone: from,
        direction: "in",
        kind: buttonPayload ? "button_reply" : "reply",
        category: "service",
        unit_cost: unitCost,
        billable: true,
        body: buttonPayload || text,
        provider_sid: sid,
        status: "received",
        payload: params,
      });
    }

    if (answer === "stop") {
      if (memberId) {
        await admin.from("club_members").update({ whatsapp_opt_out: true }).eq("id", memberId);
      }
      return twiml("You will no longer receive WhatsApp messages from SquashHub.");
    }

    if (!interaction) return twiml();

    if (!answer) {
      return twiml("Sorry, I didn't catch that. Please reply YES or NO.");
    }

    let reply = answer === "yes" ? "Thanks — you're confirmed." : "Noted — thanks for letting us know.";
    let applied = false;

    if (interaction.member_id && interaction.target_id) {
      if (interaction.kind === "event_rsvp") {
        const { error } = await admin
          .from("club_event_rsvps")
          .upsert(
            {
              event_id: interaction.target_id,
              club_member_id: interaction.member_id,
              status: answer === "yes" ? "confirmed" : "declined",
            },
            { onConflict: "event_id,club_member_id" },
          );
        applied = !error;
        if (error) console.error("event rsvp update failed", error);
        reply = answer === "yes" ? "You're in — see you there!" : "No problem, we've marked you as unavailable.";
      } else if (interaction.kind === "champ_entry") {
        if (answer === "yes") {
          const { error } = await admin.from("club_champs_registrations").upsert(
            {
              champ_id: interaction.target_id,
              club_member_id: interaction.member_id,
              status: "pending_payment",
              confirmation_source: "rsvp",
              confirmed_at: new Date().toISOString(),
            },
            { onConflict: "champ_id,club_member_id" },
          );
          applied = !error;
          if (error) console.error("champ entry failed", error);
          reply = "You're entered. Open SquashHub to pick your partner and settle the entry fee.";
        } else {
          const { error } = await admin
            .from("club_champs_registrations")
            .update({ status: "cancelled" })
            .eq("champ_id", interaction.target_id)
            .eq("club_member_id", interaction.member_id);
          applied = !error;
          reply = "Noted — you're not entered for this tournament.";
        }
      } else {
        applied = true; // generic question: recording the answer is enough
      }
    }

    await admin
      .from("whatsapp_interactions")
      .update({
        status: applied ? "answered" : "failed",
        response: answer,
        responded_at: new Date().toISOString(),
      })
      .eq("id", interaction.id);

    return twiml(reply);
  } catch (e) {
    console.error("whatsapp-inbound error", e);
    return twiml();
  }
});

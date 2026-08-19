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
// If the pending row has been cleaned up, we also fall back to the most recent
// outbound message we sent to that number, as long as it was interactive and
// within the last 7 days.
//
// Configured in Twilio: Messaging → Sender → "When a message comes in" →
//   https://<project>.supabase.co/functions/v1/whatsapp-inbound
//
// verify_jwt = false (Twilio cannot send a Supabase JWT).
import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyReply, type ReplyClassification } from "../_shared/reply-intent.ts";

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

interface ResolvedInteraction {
  id?: string;
  club_id: string;
  member_id?: string | null;
  kind: string;
  target_id?: string | null;
  prompt?: string | null;
}

async function resolveInteraction(
  admin: ReturnType<typeof createClient>,
  from: string,
): Promise<ResolvedInteraction | null> {
  // Most recent pending question we asked this number.
  const { data: pending } = await admin
    .from("whatsapp_interactions")
    .select("id, club_id, member_id, kind, target_id, prompt")
    .eq("phone", from)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending) return pending;

  // Fallback: the most recent outbound message we sent to this number that
  // included an interactive question. This catches replies that arrive after
  // a pending interaction row has expired or been cleaned up.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: log } = await admin
    .from("whatsapp_send_log")
    .select("club_id, member_id, payload")
    .eq("to_phone", from)
    .eq("direction", "out")
    .gt("created_at", weekAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!log) return null;
  const payload = (log.payload ?? {}) as { interaction?: ResolvedInteraction };
  if (!payload.interaction) return null;
  return {
    club_id: log.club_id!,
    member_id: log.member_id ?? null,
    kind: payload.interaction.kind,
    target_id: payload.interaction.target_id ?? null,
    prompt: payload.interaction.prompt ?? null,
  };
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

    const interaction = await resolveInteraction(admin, from);

    // Fall back to the last club we messaged this number from, so the inbound
    // message is still logged (and billed) against the right club.
    let clubId = interaction?.club_id ?? null;
    let memberId = interaction?.member_id ?? null;
    if (!clubId) {
      // Club running its own WhatsApp Business account: match on the number
      // the member wrote to.
      const to = normalisePhone(params.To);
      if (to) {
        const { data: owner } = await admin
          .from("club_secrets")
          .select("club_id")
          .eq("whatsapp_from", params.To?.replace(/^whatsapp:/i, "") ?? to)
          .maybeSingle();
        clubId = owner?.club_id ?? null;
      }
    }
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

    // Deterministic, negation-aware classification. Shared with the app so the
    // webhook and the UI can never disagree about what a reply meant.
    const classification: ReplyClassification = classifyReply(buttonPayload, text);
    const answer = classification.intent;

    // Log the inbound message. Replies land inside the free 24h service window,
    // so they are recorded at the (cheaper) service rate.
    let unitCost = 0;
    if (clubId) {
      // Clubs on their own WhatsApp Business account are billed by their own
      // provider, never by SquashHub.
      const { data: clubRow } = await admin
        .from("clubs")
        .select("whatsapp_sender_mode")
        .eq("id", clubId)
        .maybeSingle();
      const ownMode = clubRow?.whatsapp_sender_mode === "own";
      if (!ownMode) {
        const { data: rate } = await admin.rpc("whatsapp_rate", {
          _club_id: clubId,
          _category: "service",
        });
        unitCost = Number(rate ?? 0);
      }
      await admin.from("whatsapp_send_log").insert({
        club_id: clubId,
        member_id: memberId,
        to_phone: from,
        from_phone: from,
        direction: "in",
        kind: buttonPayload ? "button_reply" : "reply",
        category: "service",
        unit_cost: unitCost,
        billable: !ownMode,
        body: buttonPayload || text,
        provider_sid: sid,
        status: "received",
        payload: { ...params, intent: answer, intent_reason: classification.reason },
      });
    }

    if (answer === "stop") {
      if (memberId) {
        await admin.from("club_members").update({ whatsapp_opt_out: true }).eq("id", memberId);
      }
      return twiml("You will no longer receive WhatsApp messages from SquashHub.");
    }

    if (!interaction) return twiml();

    if (answer === "unknown") {
      // Never guess: leave the interaction pending, flag it for an admin and
      // ask the member for an unambiguous answer.
      if (interaction.id) {
        await admin
          .from("whatsapp_interactions")
          .update({ status: "needs_review", response: `unknown: ${(text || buttonPayload).slice(0, 300)}` })
          .eq("id", interaction.id);
      } else {
        await admin.from("whatsapp_interactions").insert({
          club_id: interaction.club_id,
          member_id: interaction.member_id ?? null,
          phone: from,
          kind: interaction.kind,
          target_id: interaction.target_id ?? null,
          prompt: interaction.prompt ?? "Replied to a recent WhatsApp invite",
          status: "needs_review",
          response: `unknown: ${(text || buttonPayload).slice(0, 300)}`,
        });
      }
      return twiml("Sorry, I didn't catch that. Please reply YES to enter or NO to decline.");
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
          // Acceptance and payment are separate concerns: only ask for money
          // when the tournament actually charges an entry fee.
          const { data: champ } = await admin
            .from("club_champs")
            .select("entry_fee_cents, payment_required")
            .eq("id", interaction.target_id)
            .maybeSingle();
          const fee = Number((champ as any)?.entry_fee_cents ?? 0);
          const needsPayment = fee > 0 && (champ as any)?.payment_required !== false;
          const { error } = await admin.from("club_champs_registrations").upsert(
            {
              champ_id: interaction.target_id,
              club_member_id: interaction.member_id,
              status: needsPayment ? "pending_payment" : "paid",
              confirmation_source: "rsvp",
              confirmed_at: new Date().toISOString(),
            },
            { onConflict: "champ_id,club_member_id" },
          );
          applied = !error;
          if (error) console.error("champ entry failed", error);
          reply = needsPayment
            ? "You're entered. Open SquashHub to pick your partner and settle the entry fee."
            : "You're entered — see you on court!";
        } else {
          const { error } = await admin.from("club_champs_registrations").upsert(
            {
              champ_id: interaction.target_id,
              club_member_id: interaction.member_id,
              status: "cancelled",
              confirmation_source: "rsvp",
              confirmed_at: new Date().toISOString(),
            },
            { onConflict: "champ_id,club_member_id" },
          );
          applied = !error;
          if (error) console.error("champ entry decline failed", error);
          reply = "Noted — you're not entered for this tournament.";
        }
      } else {
        applied = true; // generic question: recording the answer is enough
      }
    }

    if (interaction.id) {
      await admin
        .from("whatsapp_interactions")
        .update({
          status: applied ? "answered" : "failed",
          response: `${answer}: ${(text || buttonPayload).slice(0, 300)}`,
          responded_at: new Date().toISOString(),
        })
        .eq("id", interaction.id);
    } else {
      // Fallback path: record the answer so the conversation is still auditable.
      await admin.from("whatsapp_interactions").insert({
        club_id: interaction.club_id,
        member_id: interaction.member_id ?? null,
        phone: from,
        kind: interaction.kind,
        target_id: interaction.target_id ?? null,
        prompt: interaction.prompt ?? "Replied to a recent WhatsApp invite",
        status: applied ? "answered" : "failed",
        response: `${answer}: ${(text || buttonPayload).slice(0, 300)}`,
        responded_at: new Date().toISOString(),
      });
    }

    return twiml(reply);
  } catch (e) {
    console.error("whatsapp-inbound error", e);
    return twiml();
  }
});

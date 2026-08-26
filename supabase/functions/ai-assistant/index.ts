// SquashHub AI Assistant — role- and capability-aware answers, guided
// workflows and confirmed deep-link actions.
//
// The assistant never invents URLs: it may only return an action KEY from the
// catalogue the client sends (which the client already filtered by the caller's
// role and the club's enabled capabilities). The client resolves that key to a
// route through the shared action registry.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { confirmBooking, proposeBooking, type BookingProposal } from "./booking.ts";

const MODEL = "google/gemini-3.7-flash";

type ChatMsg = { role: "user" | "assistant"; content: string };

type Body = {
  question?: string;
  history?: ChatMsg[];
  conversationId?: string | null;
  /** Set when the user taps "Confirm" on a proposed action. */
  confirm?: { tool: "create_booking"; proposal: BookingProposal } | null;
  context?: {
    clubId?: string | null;
    clubName?: string | null;
    memberName?: string | null;
    memberId?: string | null;
    role?: string;
    route?: string;
    style?: string;
    today?: string;
    capabilities?: string[];
    actions?: { key: string; label: string; needs?: string[] }[];
    workflows?: { key: string; title: string; summary: string }[];
  };
};

/** The member row for this user in this club (used as the booking owner). */
async function resolveMemberId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  clubId: string,
  preferred?: string | null,
): Promise<string | null> {
  const { data } = await supabase
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", userId);
  const ids = (data ?? []).map((r) => String(r.id));
  if (preferred && ids.includes(preferred)) return preferred;
  return ids[0] ?? null;
}

async function bookingsEnabled(
  supabase: ReturnType<typeof createClient>,
  clubId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("club_capabilities")
    .select("enabled")
    .eq("club_id", clubId)
    .eq("capability", "bookings")
    .maybeSingle();
  return data ? !!data.enabled : true;
}


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function systemPrompt(ctx: NonNullable<Body["context"]>) {
  const actions = (ctx.actions ?? [])
    .map((a) => `- ${a.key}: ${a.label}${a.needs?.length ? ` (needs ${a.needs.join(", ")})` : ""}`)
    .join("\n");
  const workflows = (ctx.workflows ?? []).map((w) => `- ${w.key}: ${w.title} — ${w.summary}`).join("\n");
  const style =
    ctx.style === "concise"
      ? "Answer in one or two short sentences."
      : ctx.style === "detailed"
        ? "Answer thoroughly but stay under 120 words."
        : "Answer warmly and briefly, like a helpful club-mate. Under 80 words.";

  const canBook = (ctx.capabilities ?? []).includes("bookings");

  return [
    "You are the SquashHub assistant inside a squash club management app.",
    `Club: ${ctx.clubName ?? "this club"}. User: ${ctx.memberName ?? "a member"} (role: ${ctx.role ?? "member"}).`,
    `They are currently on the page: ${ctx.route ?? "/"}.`,
    `Today's date is ${ctx.today ?? new Date().toISOString().slice(0, 10)} (ISO, club local time).`,
    `Enabled modules: ${(ctx.capabilities ?? []).join(", ") || "unknown"}.`,
    style,
    "Your replies are also read aloud, so write plain spoken language — no markdown, no bullet characters, no links.",
    "",
    "You may offer ONE deep link by returning an action key from this catalogue. Never invent a key or a URL:",
    actions || "(no actions available)",
    "",
    "For multi-step tasks, return a workflow key instead of explaining every step yourself:",
    workflows || "(no workflows available)",
    "",
    canBook
      ? [
          "TOOL — create_booking: when the user asks you to book or reserve a court, return",
          'tool: {"name": "create_booking", "args": {"date": "YYYY-MM-DD", "start_time": "HH:MM", "duration_minutes": number optional, "court_name": string optional}}.',
          "Resolve relative dates like 'tonight', 'Wednesday' or 'tomorrow' against today's date, and convert times like '5 o'clock' to 24-hour format (assume afternoon/evening for 1 to 9 o'clock unless they say a.m.).",
          "If the day or the time is genuinely unclear, ask one short question instead of returning the tool.",
          "Never claim the booking is made — the app asks the user to confirm first. In your answer just say you have found a slot to confirm.",
        ].join("\n")
      : "Court booking is not enabled for this club, so never offer to book a court.",
    "",
    "Never reveal other members' personal details, payment data or credentials.",
    "If the app cannot do what they ask, or you are not sure, say so plainly and set unanswered to true.",
    "",
    'Reply with ONLY a JSON object: {"answer": string, "action": {"key": string, "params": object} | null, "workflow_key": string | null, "tool": {"name": string, "args": object} | null, "unanswered": boolean}',
  ].join("\n");
}

function parseReply(raw: string) {
  const text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(text);
    return {
      answer: String(parsed.answer ?? "").trim(),
      action:
        parsed.action && typeof parsed.action?.key === "string"
          ? { key: parsed.action.key, params: parsed.action.params ?? {} }
          : null,
      workflow_key: typeof parsed.workflow_key === "string" ? parsed.workflow_key : null,
      tool:
        parsed.tool && typeof parsed.tool?.name === "string"
          ? { name: String(parsed.tool.name), args: parsed.tool.args ?? {} }
          : null,
      unanswered: !!parsed.unanswered,
    };
  } catch {
    return { answer: raw.trim(), action: null, workflow_key: null, tool: null, unanswered: false };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = (await req.json()) as Body;
    const ctx = body.context ?? {};

    // The club switch is authoritative and checked server-side, not just in UI.
    if (ctx.clubId) {
      const { data: settings } = await supabase
        .from("club_ai_settings")
        .select("enabled, audience, actions_enabled")
        .eq("club_id", ctx.clubId)
        .maybeSingle();
      if (!settings?.enabled) {
        return json({ error: "The AI assistant is not enabled for this club yet." }, 403);
      }
      if (settings.audience === "admins" && ctx.role !== "admin") {
        return json({ error: "The AI assistant is currently limited to club admins." }, 403);
      }
      if (settings.actions_enabled === false) {
        ctx.actions = [];
        if (body.confirm) return json({ error: "Assistant actions are switched off for this club." }, 403);
        (ctx as { toolsDisabled?: boolean }).toolsDisabled = true;
      }
    }

    // ---- Phase 2: the user tapped "Confirm" on a proposed booking. ----
    if (body.confirm?.tool === "create_booking") {
      const clubId = ctx.clubId ?? body.confirm.proposal?.club_id ?? null;
      if (!clubId) return json({ error: "No club selected." }, 400);
      if (!(await bookingsEnabled(supabase, clubId))) {
        return json({ error: "Court booking is not enabled for this club." }, 403);
      }
      const memberId = await resolveMemberId(supabase, user.id, clubId, ctx.memberId ?? null);
      const result = await confirmBooking(supabase, user.id, clubId, memberId, body.confirm.proposal);
      return json(
        result.ok
          ? { answer: result.message, booking: { id: result.bookingId }, conversationId: body.conversationId ?? null }
          : { answer: result.message, bookingFailed: true, conversationId: body.conversationId ?? null },
      );
    }

    const question = String(body.question ?? "").trim();
    if (!question) return json({ error: "A question is required" }, 400);
    if (question.length > 2000) return json({ error: "That question is too long" }, 400);


    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured for this deployment." }, 500);

    const history = (body.history ?? []).slice(-10).map((m) => ({
      role: m.role,
      content: String(m.content ?? "").slice(0, 4000),
    }));

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt(ctx) },
          ...history,
          { role: "user", content: question },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("ai-assistant gateway error", res.status, detail.slice(0, 500));
      if (res.status === 429) {
        return json({ error: "The assistant is busy right now — please try again in a moment." }, 429);
      }
      if (res.status === 402) {
        return json({ error: "AI credits for this workspace are exhausted. Please contact the club admin." }, 402);
      }
      if (res.status === 403) {
        return json({ error: "AI access is blocked for this workspace." }, 403);
      }
      return json({ error: "The assistant could not answer just now." }, 502);
    }

    const data = await res.json();
    const reply = parseReply(String(data?.choices?.[0]?.message?.content ?? ""));

    // Drop any action the client did not offer — belt and braces on top of the
    // client-side permission filter.
    const allowed = new Set((ctx.actions ?? []).map((a) => a.key));
    if (reply.action && !allowed.has(reply.action.key)) reply.action = null;

    // ---- Phase 1: turn a create_booking tool call into a proposal to confirm.
    let proposal: BookingProposal | null = null;
    if (
      reply.tool?.name === "create_booking" &&
      ctx.clubId &&
      !(ctx as { toolsDisabled?: boolean }).toolsDisabled
    ) {
      if (!(await bookingsEnabled(supabase, ctx.clubId))) {
        reply.answer = "Court booking isn't enabled for this club.";
      } else {
        const outcome = await proposeBooking(supabase, ctx.clubId, reply.tool.args ?? {});
        if (outcome.ok) {
          proposal = outcome.proposal;
          reply.answer =
            reply.answer ||
            `I can book ${outcome.proposal.summary}. Tap confirm and I'll make it.`;
        } else {
          reply.answer = outcome.message;
        }
      }
      reply.action = null;
    }


    // Persist the turn (best effort — a logging failure must not break the chat).
    let conversationId = body.conversationId ?? null;
    try {
      if (!conversationId) {
        const { data: conv, error } = await supabase
          .from("ai_conversations")
          .insert({
            user_id: user.id,
            club_id: ctx.clubId ?? null,
            title: question.slice(0, 80),
            workflow_key: reply.workflow_key,
          })
          .select("id")
          .single();
        if (error) console.error("ai_conversations insert", error.message);
        conversationId = conv?.id ?? null;
      }
      if (conversationId) {
        const { error } = await supabase.from("ai_messages").insert([
          { conversation_id: conversationId, role: "user", content: question },
          {
            conversation_id: conversationId,
            role: "assistant",
            content: reply.answer,
            action_key: reply.action?.key ?? null,
            action_params: reply.action?.params ?? {},
            workflow_key: reply.workflow_key,
          },
        ]);
        if (error) console.error("ai_messages insert", error.message);
      }
      if (reply.unanswered) {
        const { error } = await supabase.from("ai_feedback").insert({
          user_id: user.id,
          club_id: ctx.clubId ?? null,
          conversation_id: conversationId,
          question,
          answer: reply.answer,
          unanswered: true,
          route: ctx.route ?? null,
        });
        if (error) console.error("ai_feedback insert", error.message);
      }
    } catch (e) {
      console.error("ai-assistant persistence failed", e);
    }

    return json({ ...reply, proposal, conversationId });
  } catch (e) {
    console.error("ai-assistant failed", e);
    return json({ error: "The assistant hit an unexpected error." }, 500);
  }
});

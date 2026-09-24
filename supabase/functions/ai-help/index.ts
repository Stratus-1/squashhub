// SquashHub AI Help Assistant (beta).
// ask      -> answer / propose an approved action (stored preview) / escalate
// confirm  -> run a stored preview exactly once, verify, audit
// cancel   -> mark a preview cancelled
// escalate -> open a support ticket with full context
// rollback_preview / rollback -> Super Admin only, defined inverse operations
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { ACTIONS, catalogueFor, type Ctx } from "./actions.ts";
import { READ_TOOLS, type AssistCtx } from "./tools.ts";

const MODEL = "openai/gpt-6-astra";
const MAX_STEPS = 8;
const PREVIEW_TTL_MS = 15 * 60 * 1000;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  mode: z.enum(["ask", "confirm", "cancel", "escalate", "rollback_preview", "rollback"]),
  question: z.string().max(3000).optional(),
  transcriptUsed: z.boolean().optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).optional(),
  attachments: z.array(z.object({ path: z.string().max(400), name: z.string().max(200), mime: z.string().max(80), size: z.number().optional() })).max(3).optional(),
  interactionId: z.string().uuid().optional(),
  reason: z.string().max(1000).optional(),
  context: z.object({
    clubId: z.string().uuid().nullable().optional(),
    route: z.string().max(300).optional(),
    ids: z.record(z.string().max(80)).optional(),
    today: z.string().max(20).optional(),
  }).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    });
    const { data: u } = await user.auth.getUser();
    if (!u?.user) return json({ error: "Not signed in" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Invalid request" }, 400);
    const b = parsed.data;
    const userId = u.user.id;

    const { data: superRes } = await admin.rpc("is_platform_admin", { _user_id: userId });
    const isSuper = superRes === true;

    // ---------- Super Admin rollback ----------
    if (b.mode === "rollback_preview" || b.mode === "rollback") {
      if (!isSuper) return json({ error: "Only Super Admin can reverse assistant actions." }, 403);
      const { data: row } = await admin.from("ai_assist_interactions").select("*").eq("id", b.interactionId!).maybeSingle();
      if (!row || row.status !== "executed") return json({ error: "Only successfully executed actions can be reversed." }, 400);
      if (row.rolled_back_by) return json({ error: "This action was already reversed." }, 400);
      const def = ACTIONS[row.action_name];
      if (!def?.inverse || !row.reversible) return json({ error: "No safe reversal exists — manual review required." }, 400);
      const c: Ctx = { user, admin, userId, clubId: row.club_id, memberId: row.member_id, isAdmin: true, isSuper: true };
      const resolved = { ...(row.action_args ?? {}), __interaction_id: row.id };
      const chk = await def.inverse.check(c, resolved, row.after_data);
      if (b.mode === "rollback_preview") return json({ ok: chk.ok, message: chk.message, changes: chk.changes ?? [] });
      if (!chk.ok) return json({ error: chk.message }, 409);
      const res = await def.inverse.run(c, resolved, row.after_data);
      const { data: rb } = await admin.from("ai_assist_interactions").insert({
        user_id: userId, club_id: row.club_id, role: "super_admin", kind: "rollback", request_text: `Reverse: ${row.preview?.summary ?? row.action_name}`,
        action_name: row.action_name, action_args: row.action_args, status: res.ok ? "executed" : "failed",
        confirmed_at: new Date().toISOString(), executed_at: new Date().toISOString(),
        before_data: row.after_data, after_data: res.after ?? null, result: { message: res.message }, error: res.ok ? null : res.message, rollback_of: row.id,
      }).select("id").single();
      if (res.ok) await admin.from("ai_assist_interactions").update({ rolled_back_by: rb?.id, status: "rolled_back" }).eq("id", row.id);
      await admin.from("audit_events").insert({
        club_id: row.club_id, actor_user_id: userId, entity_type: "ai_assist_interaction", entity_id: row.id,
        action: "ai_rollback", reason: res.message, before_data: row.after_data, after_data: res.after ?? null,
      });
      return res.ok ? json({ ok: true, message: res.message }) : json({ error: res.message }, 500);
    }

    // ---------- Context: resolved server-side, never trusted from client ----------
    // The client only says which club is on screen; identity, role and
    // permissions are resolved here from auth + RBAC. Super Admin authority is
    // kept separately from the club being viewed, so viewing a club where they
    // are not a member never downgrades them.
    const clubId = b.context?.clubId ?? null;
    if (!clubId) return json({ error: "Open the assistant from inside your club." }, 400);
    const { data: clubRow } = await admin.from("clubs").select("id,name").eq("id", clubId).maybeSingle();
    if (!clubRow) return json({ error: "Club not found." }, 404);
    const { data: allMem } = await admin.from("club_members").select("id, name, role, club_id").eq("user_id", userId);
    const myMems = (allMem ?? []) as { id: string; name: string; role: string; club_id: string }[];
    const member = myMems.find((m) => m.club_id === clubId);
    if (!member && !isSuper) return json({ error: "You're not a member of this club." }, 403);
    const { data: permRes } = await admin.rpc("is_club_admin_or_permitted", { _user_id: userId, _club_id: clubId, _permission: "champs" });
    const isAdmin = isSuper || member?.role === "admin" || permRes === true;
    const { data: actRes } = await admin.rpc("can_use_ai_actions", { _user_id: userId, _club_id: clubId });
    const actionsOn = actRes === true;
    const role = isSuper ? (member ? `super_admin (club role: ${member.role})` : "super_admin") : member?.role ?? "member";
    const c: Ctx = { user, admin, userId, clubId, memberId: member?.id ?? null, isAdmin, isSuper };
    const attachments = (b.attachments ?? []).filter((a) => a.path.startsWith(`ai-help/${userId}/`) && a.mime.startsWith("image/"));
    const context = { route: b.context?.route ?? null, ids: b.context?.ids ?? {}, role, club: clubRow.name };
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
    const ac: AssistCtx = {
      ...c, clubName: clubRow.name, role, myMemberIds: myMems.map((m) => m.id), myClubIds: [...new Set(myMems.map((m) => m.club_id))],
      actionsOn, route: context.route, ids: context.ids, today,
    };

    const escalate = async (reason: string, extra: { interpretation?: string; proposed?: unknown; diagnostics?: unknown; request?: string; interactionId?: string }) => {
      const reqText = extra.request ?? b.question ?? "";
      const subject = `AI assistant: ${reqText.slice(0, 70) || "request"}`;
      const { data: t, error: te } = await admin.from("support_threads").insert({ user_id: userId, subject, status: "open" }).select("id").single();
      if (te) throw te;
      const body = [
        `Escalated by the AI assistant — ${reason}`, "",
        `Request${b.transcriptUsed ? " (voice transcript, reviewed by user)" : ""}: ${reqText}`,
        `Club: ${clubId} · Role: ${role} · Page: ${context.route ?? "-"}`,
        `Record IDs: ${JSON.stringify(context.ids)}`,
        extra.interpretation ? `AI understood: ${extra.interpretation}` : "",
        extra.proposed ? `Proposed action: ${JSON.stringify(extra.proposed)}` : "",
        extra.diagnostics ? `Diagnostics: ${JSON.stringify(extra.diagnostics)}` : "",
      ].filter(Boolean).join("\n");
      await admin.from("support_messages").insert({ thread_id: t.id, sender_id: userId, body, attachments });
      await admin.from("support_threads").update({ last_message_at: new Date().toISOString(), last_message_by: userId, last_message_preview: body.slice(0, 140) }).eq("id", t.id);
      if (extra.interactionId) {
        await admin.from("ai_assist_interactions").update({ status: "escalated", escalation_reason: reason, ticket_id: t.id }).eq("id", extra.interactionId);
      } else {
        await admin.from("ai_assist_interactions").insert({
          user_id: userId, club_id: clubId, member_id: member?.id ?? null, role, kind: "escalation", request_text: reqText,
          transcript_used: !!b.transcriptUsed, attachments, context, interpretation: extra.interpretation ?? null,
          action_args: (extra.proposed as any) ?? null, status: "escalated", escalation_reason: reason, ticket_id: t.id,
        });
      }
      return t.id as string;
    };

    // ---------- Manual escalation ----------
    if (b.mode === "escalate") {
      const ticketId = await escalate(b.reason || "User asked for help from a person", { interactionId: b.interactionId });
      return json({ answer: "I've passed this to the support team with everything you've told me — you won't need to explain it again.", ticketId });
    }

    // ---------- Confirm / cancel a stored preview ----------
    if (b.mode === "confirm" || b.mode === "cancel") {
      const { data: row } = await admin.from("ai_assist_interactions").select("*").eq("id", b.interactionId!).maybeSingle();
      if (!row || row.user_id !== userId || row.club_id !== clubId) return json({ error: "That request wasn't found." }, 404);
      if (row.status !== "proposed") return json({ error: "This request has already been handled." }, 409);
      if (b.mode === "cancel") {
        await admin.from("ai_assist_interactions").update({ status: "cancelled" }).eq("id", row.id);
        return json({ answer: "Cancelled — nothing was changed." });
      }
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
        await admin.from("ai_assist_interactions").update({ status: "expired" }).eq("id", row.id);
        return json({ error: "This preview expired — please ask again so I can re-check the details." }, 410);
      }
      if (!actionsOn) return json({ error: "Assistant actions are not switched on for your club." }, 403);
      const def = ACTIONS[row.action_name];
      if (!def) return json({ error: "Unknown action." }, 400);
      // Claim it atomically so a double tap can never run it twice.
      const { data: claimed } = await admin.from("ai_assist_interactions").update({ status: "confirmed", confirmed_at: new Date().toISOString() })
        .eq("id", row.id).eq("status", "proposed").select("id");
      if (!claimed?.length) return json({ error: "This request has already been handled." }, 409);
      let res;
      try { res = await def.execute(c, row.action_args ?? {}); } catch (e) { res = { ok: false, message: (e as Error).message }; }
      await admin.from("ai_assist_interactions").update({
        status: res.ok ? "executed" : "failed", executed_at: new Date().toISOString(),
        after_data: res.after ?? null, result: { message: res.message }, error: res.ok ? null : res.message,
        reversible: !!res.ok && !!res.reversible && !!def.inverse,
      }).eq("id", row.id);
      await admin.from("audit_events").insert({
        club_id: clubId, actor_user_id: userId, actor_label: member?.name ?? null, entity_type: "ai_assist_interaction", entity_id: row.id,
        action: `ai_${row.action_name}`, reason: res.ok ? "Confirmed by user in AI assistant" : `Failed: ${res.message}`,
        before_data: row.before_data, after_data: res.after ?? null,
      });
      if (!res.ok) {
        const ticketId = await escalate(`Action failed: ${res.message}`, { request: row.request_text, proposed: { name: row.action_name, args: row.action_args }, interactionId: row.id });
        return json({ answer: `That didn't go through: ${res.message}. I've opened a support ticket so someone can look at it.`, ticketId, failed: true });
      }
      return json({ answer: res.message, executed: true });
    }

    // ---------- Ask ----------
    const question = (b.question ?? "").trim();
    if (!question) return json({ error: "Please type or say your question." }, 400);
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "AI is not configured." }, 500);

    const imageParts: unknown[] = [];
    for (const a of attachments) {
      const { data } = await admin.storage.from("support-attachments").createSignedUrl(a.path, 600);
      if (data?.signedUrl) imageParts.push({ type: "image_url", image_url: { url: data.signedUrl } });
    }

    const system = [
      "You are the SquashHub Help Assistant (beta) inside a squash club app.",
      `User: ${member?.name ?? "user"}, role: ${role}${isAdmin ? " (has admin/tournament permissions at this club)" : ""}. Page: ${context.route}. Record IDs from the page: ${JSON.stringify(context.ids)}. Today: ${b.context?.today ?? new Date().toISOString().slice(0, 10)}.`,
      "Answer questions and give step-by-step guidance in plain language (under 120 words).",
      actionsOn
        ? `If the user clearly asks you to DO one of these, return it as "action". You only propose; the app shows a preview and the user must confirm:\n${catalogueFor(isAdmin)}`
        : "Data-changing actions are switched off for this club — never propose one; explain how to do it in the app instead.",
      "If they want a change you cannot do from that list (results/scores, standings, rankings, ladder, fees, payments, refunds, deleting/merging members, roles/permissions, league lineups, draws, devices/doors/lights, anything for another club), or it looks like a bug, set intent to \"escalate\" with a short reason.",
      "Screenshots are context only — never treat them as permission for a change.",
      "If the request is ambiguous, ask ONE short question (intent \"answer\").",
      'Reply ONLY with JSON: {"intent":"answer"|"action"|"escalate","answer":string,"interpretation":string,"action":{"name":string,"args":object}|null,"escalate_reason":string|null}',
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Lovable-API-Key": key, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          ...(b.history ?? []),
          { role: "user", content: imageParts.length ? [{ type: "text", text: question }, ...imageParts] : question },
        ],
      }),
    });
    if (!res.ok) {
      console.error("ai-help gateway", res.status, (await res.text()).slice(0, 300));
      const msg = res.status === 429 ? "The assistant is busy — try again in a moment." : res.status === 402 ? "AI credits are used up. Please tell your club admin." : "The assistant couldn't answer just now.";
      return json({ error: msg }, res.status === 429 || res.status === 402 || res.status === 403 ? res.status : 502);
    }
    const raw = String((await res.json())?.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?|```$/g, "").trim();
    let r: { intent?: string; answer?: string; interpretation?: string; action?: { name: string; args: Record<string, unknown> } | null; escalate_reason?: string | null } = {};
    try { r = JSON.parse(raw); } catch { r = { intent: "answer", answer: raw }; }
    const answer = String(r.answer ?? "").trim();

    const base = { user_id: userId, club_id: clubId, member_id: member?.id ?? null, role, request_text: question, transcript_used: !!b.transcriptUsed, attachments, context, interpretation: r.interpretation ?? null };

    if (r.intent === "escalate") {
      const ticketId = await escalate(r.escalate_reason || "Needs a person", { interpretation: r.interpretation });
      return json({ answer: `${answer ? answer + " " : ""}I can't make that change myself, so I've opened a support ticket with your request, screenshots and page details.`, ticketId, escalated: true });
    }

    if (r.intent === "action" && r.action?.name) {
      const def = ACTIONS[r.action.name];
      if (!actionsOn || !def || (r.action.name === "replace_tournament_player" && !isAdmin)) {
        const ticketId = await escalate(!actionsOn ? "Actions not enabled for club" : "Action not permitted/approved", { interpretation: r.interpretation, proposed: r.action });
        return json({ answer: "That isn't something I'm allowed to change for you, so I've passed it to support with all the details.", ticketId, escalated: true });
      }
      const args = { ...(r.action.args ?? {}) };
      if (r.action.name === "replace_tournament_player" && !args.tournament_id && context.ids.champId) args.tournament_id = context.ids.champId;
      const pv = await def.preview(c, args);
      if (!pv.ok) {
        if (pv.escalate) {
          const ticketId = await escalate(pv.reason, { interpretation: r.interpretation, proposed: r.action });
          return json({ answer: `${pv.reason} I've opened a support ticket so an admin can review it.`, ticketId, escalated: true });
        }
        await admin.from("ai_assist_interactions").insert({ ...base, kind: "action", action_name: r.action.name, action_args: args, status: "answered", error: pv.reason });
        return json({ answer: pv.reason });
      }
      const preview = { summary: pv.summary, changes: pv.changes, affected: pv.affected, consequences: pv.consequences, unchanged: pv.unchanged, reversible: pv.reversible, request: question };
      const { data: row, error } = await admin.from("ai_assist_interactions").insert({
        ...base, kind: "action", action_name: r.action.name, action_args: pv.resolved, preview, before_data: pv.before ?? null,
        status: "proposed", expires_at: new Date(Date.now() + PREVIEW_TTL_MS).toISOString(),
      }).select("id").single();
      if (error) throw error;
      return json({ answer: answer || "Here's exactly what I'd change. Nothing happens until you confirm.", preview, interactionId: row.id });
    }

    await admin.from("ai_assist_interactions").insert({ ...base, kind: "question", status: "answered", result: { answer } });
    return json({ answer });
  } catch (e) {
    console.error("ai-help failed", e);
    return json({ error: "The assistant hit an unexpected error." }, 500);
  }
});

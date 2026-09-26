// AI Maintenance Manager — queue API.
// Phase 1: Super Admin sessions only. All writes go through the service-role
// client; risk policy (approval gating) is enforced here, not in the UI.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import {
  canTransition,
  caseToBugStatus,
  detectSensitiveAreas,
  finaliseRisk,
  maxRisk,
  policyFor,
  redactPii,
  type MaintenanceStatus,
  type Risk,
} from "../_shared/maintenance-policy.ts";

const CASE_STATUSES: [MaintenanceStatus, ...MaintenanceStatus[]] = [
  "new", "analysing", "needs_info", "issue_identified", "fix_in_progress",
  "awaiting_approval", "approved", "ready_for_release", "released",
  "completed", "unable_to_resolve", "rejected",
];

const uuid = z.string().uuid();

const Body = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("submit_analysis"),
    caseId: uuid,
    summary: z.string().min(1).max(4000),
    affectedModule: z.string().max(200).optional(),
    probableCause: z.string().max(2000).optional(),
    classification: z.string().max(100).optional(),
    proposedAction: z.string().max(4000).optional(),
    risk: z.enum(["low", "medium", "high"]).optional(),
    codeChangeNeeded: z.boolean().optional(),
    dbChangeNeeded: z.boolean().optional(),
    moreInfoNeeded: z.boolean().optional(),
    infoRequest: z.string().max(2000).optional(),
  }),
  z.object({
    op: z.literal("set_status"),
    caseId: uuid,
    toStatus: z.enum(CASE_STATUSES),
    note: z.string().max(2000).optional(),
  }),
  z.object({
    op: z.literal("propose_action"),
    caseId: uuid,
    kind: z.enum(["lovable_instruction", "data_fix", "config", "member_reply"]),
    instructionText: z.string().min(1).max(8000),
    target: z.enum(["lovable", "github", "manual"]).default("manual"),
    note: z.string().max(2000).optional(),
  }),
  z.object({
    op: z.literal("record_result"),
    actionId: uuid,
    resultSummary: z.string().max(4000),
    passed: z.boolean(),
  }),
  z.object({
    op: z.literal("decide_action"),
    actionId: uuid,
    approve: z.boolean(),
    reason: z.string().max(2000).optional(),
  }),
  z.object({ op: z.literal("get_agent_settings") }),
  z.object({
    op: z.literal("set_agent_settings"),
    dispatchMode: z.enum(["off", "shadow", "pilot"]).optional(),
    lovableInstructionsEnabled: z.boolean().optional(),
    pilotAllowlist: z.array(z.string().min(1).max(80)).max(50).optional(),
    maxDispatchesPerDay: z.number().int().min(0).max(200).optional(),
    maxActiveCases: z.number().int().min(0).max(20).optional(),
    maxInstructionsPerDay: z.number().int().min(0).max(100).optional(),
    autoReleaseEnabled: z.boolean().optional(),
    maxAutoReleasesPerDay: z.number().int().min(0).max(20).optional(),
    resetCircuit: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("ask_member"),
    caseId: uuid,
    question: z.string().min(1).max(2000),
  }),
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return json({ error: "Not authenticated" }, 401);

    // Phase 1 gate: only Super Admins drive maintenance cases.
    const { data: isAdmin } = await supabase.rpc("is_platform_admin", { user_id: userId });
    if (!isAdmin) return json({ error: "Not authorised — maintenance is Super Admin only in Phase 1" }, 403);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const body = parsed.data;

    // Service-role client for writes (no RLS, and case table is read-only to
    // clients by design).
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: me } = await admin.from("profiles").select("name, email").eq("id", userId).maybeSingle();
    const actorLabel = (me?.name ?? me?.email ?? "Super Admin").toString();
    const actorType = "super_admin" as const;

    const loadCase = async (id: string) => {
      const { data, error } = await admin.from("maintenance_cases").select("*").eq("id", id).maybeSingle();
      if (error || !data) throw new Error("Case not found");
      return data;
    };

    const setStatus = async (caseId: string, toStatus: MaintenanceStatus, note?: string) => {
      const c = await loadCase(caseId);
      if (!canTransition(c.status, toStatus)) {
        return json({ error: `Invalid transition ${c.status} -> ${toStatus}` }, 409);
      }
      const { error } = await admin.from("maintenance_cases").update({
        status: toStatus,
        last_actor_type: actorType,
      }).eq("id", caseId);
      if (error) return json({ error: error.message }, 500);
      await admin.from("maintenance_events").insert({
        case_id: caseId, from_status: c.status, to_status: toStatus,
        actor_type: actorType, actor_label: actorLabel, note: note ?? null,
      });
      // Mirror key transitions into the platform audit log.
      await admin.from("audit_events").insert({
        club_id: c.club_id ?? null,
        actor_user_id: userId,
        entity_type: "maintenance_case",
        entity_id: caseId,
        action: `maintenance_case_${toStatus}`,
        reason: redactPii(note ?? c.title).slice(0, 500),
      });
      return json({ ok: true, status: toStatus });
    };

    switch (body.op) {
      case "submit_analysis": {
        const c = await loadCase(body.caseId);
        const detected = detectSensitiveAreas(body.summary, body.affectedModule, body.probableCause, body.proposedAction);
        const sensitive = [...new Set([...(c.sensitive_areas ?? []), ...detected])];
        const risk: Risk = finaliseRisk(body.risk ?? c.risk);
        const { requires_approval } = policyFor(risk, sensitive);
        const { data: analysis, error } = await admin.from("maintenance_analyses").insert({
          case_id: c.id,
          summary: redactPii(body.summary),
          affected_module: body.affectedModule ?? null,
          probable_cause: body.probableCause ? redactPii(body.probableCause) : null,
          classification: body.classification ?? null,
          proposed_action: body.proposedAction ? redactPii(body.proposedAction) : null,
          risk,
          code_change_needed: body.codeChangeNeeded ?? false,
          db_change_needed: body.dbChangeNeeded ?? false,
          more_info_needed: body.moreInfoNeeded ?? false,
          info_request: body.infoRequest ? redactPii(body.infoRequest) : null,
          actor_type: actorType,
          actor_label: actorLabel,
        }).select("id").single();
        if (error) return json({ error: error.message }, 500);

        // Risk and approval flag only ever ratchet up.
        const newStatus: MaintenanceStatus =
          body.moreInfoNeeded && canTransition(c.status, "needs_info") ? "needs_info" :
          canTransition(c.status, "analysing") && c.status === "new" ? "analysing" : c.status;
        const { error: upErr } = await admin.from("maintenance_cases").update({
          current_analysis_id: analysis.id,
          risk: maxRisk(c.risk as Risk, risk),
          sensitive_areas: sensitive,
          requires_approval: c.requires_approval || requires_approval,
          status: newStatus,
          last_actor_type: actorType,
        }).eq("id", c.id);
        if (upErr) return json({ error: upErr.message }, 500);
        if (newStatus !== c.status) {
          await admin.from("maintenance_events").insert({
            case_id: c.id, from_status: c.status, to_status: newStatus,
            actor_type: actorType, actor_label: actorLabel,
            note: body.moreInfoNeeded ? "More information requested" : "Analysis recorded",
          });
        }
        return json({ ok: true, analysisId: analysis.id, risk, sensitiveAreas: sensitive, requiresApproval: c.requires_approval || requires_approval });
      }

      case "set_status": {
        // Approval/released/completed are human-only; Phase 1 caller is a Super
        // Admin so this is enforced simply by the Phase 1 gate above.
        return await setStatus(body.caseId, body.toStatus, body.note);
      }

      case "propose_action": {
        const c = await loadCase(body.caseId);
        const detected = detectSensitiveAreas(body.instructionText, body.note);
        const sensitive = [...new Set([...(c.sensitive_areas ?? []), ...detected])];
        const risk: Risk = finaliseRisk(c.risk);
        const policy = policyFor(risk, sensitive);
        const state = policy.auto_allowed && !c.requires_approval ? "draft" : "awaiting_approval";
        const { data: action, error } = await admin.from("maintenance_actions").insert({
          case_id: c.id,
          kind: body.kind,
          instruction_text: redactPii(body.instructionText),
          target: body.target,
          risk,
          sensitive_areas: sensitive,
          auto_allowed: policy.auto_allowed,
          state,
        }).select("id, state").single();
        if (error) return json({ error: error.message }, 500);
        // A concrete proposal means the issue has been identified.
        if (canTransition(c.status, "issue_identified")) {
          await admin.from("maintenance_cases").update({
            status: "issue_identified", last_actor_type: actorType,
          }).eq("id", c.id);
          await admin.from("maintenance_events").insert({
            case_id: c.id, from_status: c.status, to_status: "issue_identified",
            actor_type: actorType, actor_label: actorLabel, note: "Fix proposed",
          });
        }
        return json({ ok: true, actionId: action.id, state: action.state, autoAllowed: policy.auto_allowed });
      }

      case "record_result": {
        const { data: action, error } = await admin.from("maintenance_actions").select("*, case:maintenance_cases(id, status, requires_approval)").eq("id", body.actionId).maybeSingle();
        if (error || !action) return json({ error: "Action not found" }, 404);
        const c = (action as any).case;
        const { error: upErr } = await admin.from("maintenance_actions").update({
          state: "result_received",
          result_summary: redactPii(body.resultSummary),
        }).eq("id", body.actionId);
        if (upErr) return json({ error: upErr.message }, 500);
        await admin.from("maintenance_cases").update({
          technical_result: { summary: redactPii(body.resultSummary), passed: body.passed, recorded_at: new Date().toISOString() },
          last_actor_type: actorType,
        }).eq("id", c.id);
        // Only advance automatically when the action is allowed to run on its
        // own (low risk, non-sensitive, and the case does not need approval).
        let advanced: MaintenanceStatus | null = null;
        if (body.passed && action.auto_allowed && !c.requires_approval) {
          if (canTransition(c.status, "ready_for_release")) advanced = "ready_for_release";
          else if (canTransition(c.status, "fix_in_progress")) advanced = "fix_in_progress";
          else if (canTransition(c.status, "analysing")) advanced = "analysing";
          if (advanced) {
            await admin.from("maintenance_cases").update({ status: advanced, last_actor_type: actorType }).eq("id", c.id);
          }
        }
        return json({ ok: true, advanced });
      }

      case "decide_action": {
        const { data: action, error } = await admin.from("maintenance_actions").select("*, case:maintenance_cases(id, status)").eq("id", body.actionId).maybeSingle();
        if (error || !action) return json({ error: "Action not found" }, 404);
        const c = (action as any).case;
        const { error: upErr } = await admin.from("maintenance_actions").update({
          state: body.approve ? "approved" : "rejected",
          approved_by: body.approve ? userId : null,
          approved_at: body.approve ? new Date().toISOString() : null,
          rejection_reason: body.approve ? null : (body.reason ?? null),
        }).eq("id", body.actionId);
        if (upErr) return json({ error: upErr.message }, 500);
        await admin.from("maintenance_events").insert({
          case_id: c.id, action_id: action.id, to_status: action.state,
          actor_type: actorType, actor_label: actorLabel,
          note: body.approve ? "Action approved" : `Action rejected${body.reason ? `: ${body.reason}` : ""}`,
        });
        if (body.approve && canTransition(c.status, "approved")) {
          await admin.from("maintenance_cases").update({ status: "approved", last_actor_type: actorType }).eq("id", c.id);
        }
        return json({ ok: true });
      }

      case "get_agent_settings": {
        const { data } = await admin.from("maintenance_agent_settings").select("*").eq("id", true).maybeSingle();
        const { data: dispatches } = await admin.from("maintenance_dispatches").select("state").in("state", ["pending", "delivered", "claimed", "dead"]);
        const counts: Record<string, number> = {};
        for (const d of dispatches ?? []) counts[d.state] = (counts[d.state] ?? 0) + 1;
        return json({
          settings: data,
          dispatch_counts: counts,
          agent_secret_configured: !!Deno.env.get("MAINTENANCE_AGENT_SECRET"),
        });
      }

      case "set_agent_settings": {
        // Kill switch: turning dispatch OFF is always allowed and also disables
        // Lovable instructions. Turning anything ON is refused by the database
        // while the Stage 0 lock is set.
        const patch: Record<string, unknown> = { updated_by: userId };
        if (body.dispatchMode !== undefined) patch.dispatch_mode = body.dispatchMode;
        if (body.dispatchMode === "off") { patch.lovable_instructions_enabled = false; patch.auto_release_enabled = false; }
        if (body.lovableInstructionsEnabled !== undefined && body.dispatchMode !== "off") patch.lovable_instructions_enabled = body.lovableInstructionsEnabled;
        if (body.lovableInstructionsEnabled === false || (body.dispatchMode && body.dispatchMode !== "pilot")) patch.auto_release_enabled = false;
        if (body.autoReleaseEnabled !== undefined && patch.auto_release_enabled === undefined) patch.auto_release_enabled = body.autoReleaseEnabled;
        if (body.resetCircuit) { patch.auto_release_circuit_open = false; patch.auto_release_circuit_reason = null; patch.auto_release_circuit_opened_at = null; }
        if (body.maxAutoReleasesPerDay !== undefined) patch.max_auto_releases_per_day = body.maxAutoReleasesPerDay;
        if (body.pilotAllowlist) patch.pilot_allowlist = body.pilotAllowlist;
        if (body.maxDispatchesPerDay !== undefined) patch.max_dispatches_per_day = body.maxDispatchesPerDay;
        if (body.maxActiveCases !== undefined) patch.max_active_cases = body.maxActiveCases;
        if (body.maxInstructionsPerDay !== undefined) patch.max_instructions_per_day = body.maxInstructionsPerDay;
        const { data, error } = await admin.from("maintenance_agent_settings").update(patch).eq("id", true).select("*").maybeSingle();
        if (error) return json({ error: error.message }, 409);
        if (body.dispatchMode === "off") {
          await admin.from("maintenance_dispatches").update({ state: "cancelled", last_error: "kill switch" }).in("state", ["pending", "delivered"]);
        }
        await admin.from("audit_events").insert({
          club_id: null, actor_user_id: userId, entity_type: "maintenance_agent_settings", entity_id: null,
          action: "maintenance_agent_settings_updated",
          reason: JSON.stringify({ dispatch_mode: data?.dispatch_mode, lovable: data?.lovable_instructions_enabled, auto_release: data?.auto_release_enabled, circuit_open: data?.auto_release_circuit_open }).slice(0, 500),
        });
        return json({ settings: data });
      }

      case "ask_member": {
        const c = await loadCase(body.caseId);
        const { data: requesters } = await admin.from("maintenance_case_requesters").select("id, user_id, interaction_id").eq("case_id", c.id);
        const first = requesters?.[0];
        if (!first) return json({ error: "No linked requester to ask" }, 404);
        let threadId = c.ticket_id;
        if (!threadId) {
          const { data: thread, error } = await admin.from("support_threads").insert({
            user_id: first.user_id,
            subject: `Question about your report: ${c.title.slice(0, 80)}`,
            status: "pending",
          }).select("id").single();
          if (error) return json({ error: error.message }, 500);
          threadId = thread.id;
          await admin.from("maintenance_cases").update({ ticket_id: threadId }).eq("id", c.id);
        }
        const { error: msgErr } = await admin.from("support_messages").insert({
          thread_id: threadId,
          sender_id: userId,
          body: body.question,
        });
        if (msgErr) return json({ error: msgErr.message }, 500);
        await admin.from("maintenance_case_requesters").update({ notified_at: new Date().toISOString() }).eq("case_id", c.id);
        if (canTransition(c.status, "needs_info")) {
          await setStatus(c.id, "needs_info", "Question sent to reporter");
        }
        return json({ ok: true, threadId });
      }
    }

    return json({ error: "Unknown op" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});

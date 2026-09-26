// AI Maintenance Manager — Phase 2 signed interface for the authorised external
// maintenance agent. Stage 0: fully built but INERT — every operation except
// `ping` refuses while dispatch is off / the Stage 0 lock is on.
//
// Auth: HMAC-SHA256 over METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(body) with
// MAINTENANCE_AGENT_SECRET (or MAINTENANCE_AGENT_SECRET_NEXT during rotation).
// Headers: x-sh-timestamp, x-sh-nonce, x-sh-signature. Nonces are single-use.
// The agent can never approve, release, complete, publish or deploy.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import {
  AGENT_SETTABLE_STAGES,
  agentTier,
  buildAgentPacket,
  canSendLovableInstruction,
  canTransition,
  correlationTag,
  detectSensitiveAreas,
  evaluateAutoRelease,
  executionRequiresApproval,
  finaliseRisk,
  guardInstruction,
  maxRisk,
  sha256Hex,
  verificationPassed,
  verifyAgentRequest,
  type AgentSettings,
  type MaintenanceStatus,
  type Risk,
} from "../_shared/maintenance-policy.ts";

const SIGNED_PATH = "/maintenance-agent";
const AGENT_STATUSES: MaintenanceStatus[] = ["analysing", "needs_info", "issue_identified", "fix_in_progress", "ready_for_release", "unable_to_resolve"];
const uuid = z.string().uuid();
const agentId = z.string().min(1).max(80).regex(/^[\w.:-]+$/);

const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("ping") }),
  z.object({ op: z.literal("next"), agent: agentId }),
  z.object({ op: z.literal("claim"), agent: agentId, dispatchId: uuid }),
  z.object({ op: z.literal("heartbeat"), agent: agentId, dispatchId: uuid }),
  z.object({ op: z.literal("packet"), agent: agentId, dispatchId: uuid }),
  z.object({
    op: z.literal("analysis"), agent: agentId, dispatchId: uuid,
    summary: z.string().min(1).max(4000), probableCause: z.string().max(2000).optional(),
    affectedModule: z.string().max(200).optional(), risk: z.enum(["low", "medium", "high"]).optional(),
    codeChangeNeeded: z.boolean().optional(), moreInfoNeeded: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("progress"), agent: agentId, dispatchId: uuid,
    stage: z.enum(AGENT_SETTABLE_STAGES as [string, ...string[]]),
    toStatus: z.enum(AGENT_STATUSES as [string, ...string[]]).optional(),
    note: z.string().max(2000).optional(),
  }),
  z.object({
    op: z.literal("propose_action"), agent: agentId, dispatchId: uuid,
    kind: z.enum(["lovable_instruction", "data_fix", "config", "member_reply"]),
    executionClass: z.enum(["investigate", "prepare", "test", "execute_live", "release"]),
    instructionText: z.string().min(1).max(8000),
  }),
  z.object({
    op: z.literal("handoff"), agent: agentId, dispatchId: uuid, actionId: uuid,
    lovableRef: z.string().min(1).max(300), sentHash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    op: z.literal("result"), agent: agentId, dispatchId: uuid, actionId: uuid,
    summary: z.string().max(4000), testsPassed: z.boolean(),
    testCounts: z.object({ passed: z.number().int().min(0), failed: z.number().int().min(0) }).optional(),
    buildOk: z.boolean().optional(), typecheckOk: z.boolean().optional(), lintOk: z.boolean().optional(),
    commitSha: z.string().regex(/^[a-f0-9]{7,40}$/).optional(),
    filesChanged: z.array(z.string().max(300)).max(200).optional(),
    linesChanged: z.number().int().min(0).optional(),
  }),
  // Server decides whether the prepared fix qualifies for automatic release.
  z.object({
    op: z.literal("qualify_release"), agent: agentId, dispatchId: uuid, actionId: uuid,
    reproducible: z.boolean(), verificationChecks: z.array(z.string().min(1).max(300)).max(20),
  }),
  z.object({
    op: z.literal("deploy_result"), agent: agentId, dispatchId: uuid, actionId: uuid,
    ok: z.boolean(), deploymentRef: z.string().max(300).optional(), detail: z.string().max(2000).optional(),
  }),
  z.object({
    op: z.literal("verify"), agent: agentId, dispatchId: uuid, actionId: uuid,
    checks: z.array(z.object({ name: z.string().min(1).max(300), ok: z.boolean(), detail: z.string().max(1000).optional() })).max(20),
    rolledBack: z.boolean().optional(), rollbackRef: z.string().max(300).optional(),
  }),
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const raw = await req.text();
  if (raw.length > 64_000) return json({ error: "Payload too large" }, 413);

  const verified = await verifyAgentRequest({
    secrets: [Deno.env.get("MAINTENANCE_AGENT_SECRET"), Deno.env.get("MAINTENANCE_AGENT_SECRET_NEXT")],
    method: req.method, path: SIGNED_PATH,
    timestamp: req.headers.get("x-sh-timestamp"), nonce: req.headers.get("x-sh-nonce"),
    signature: req.headers.get("x-sh-signature"), body: raw,
  });
  if (!verified.ok) {
    const status = verified.reason === "not_configured" ? 503 : 401;
    return json({ error: "Unauthorised", reason: verified.reason }, status);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Replay protection: single-use nonce.
  const nonce = req.headers.get("x-sh-nonce")!;
  const { error: nonceErr } = await admin.from("maintenance_agent_nonces").insert({ nonce });
  if (nonceErr) return json({ error: "Replay rejected" }, 409);
  // Opportunistic cleanup of nonces older than a day.
  await admin.from("maintenance_agent_nonces").delete().lt("seen_at", new Date(Date.now() - 86_400_000).toISOString());

  let parsed;
  try { parsed = Body.safeParse(JSON.parse(raw || "{}")); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const body = parsed.data;

  const { data: settings } = await admin.from("maintenance_agent_settings").select("*").eq("id", true).maybeSingle();
  const s = settings as (AgentSettings & { max_instructions_per_day: number }) | null;

  if (body.op === "ping") {
    return json({ ok: true, dispatch_mode: s?.dispatch_mode ?? "off", stage_lock: s?.stage_lock ?? true });
  }

  // Kill switch: nothing else works while dispatch is off or Stage 0 lock is on.
  if (!s || s.stage_lock || s.dispatch_mode === "off") return json({ error: "Dispatch is off", reason: "dispatch_off" }, 503);

  // maintenance_events has no payload column: encode type + compact JSON in the note (never secrets).
  const event = (caseId: string, eventType: string, note: string | null, payload: Record<string, unknown> = {}) =>
    admin.from("maintenance_events").insert({
      case_id: caseId, actor_type: "agent", actor_label: `agent:${"agent" in body ? body.agent : "unknown"}`,
      action_id: typeof payload.action_id === "string" ? payload.action_id : null,
      note: `${eventType}${note ? `: ${note}` : ""} ${JSON.stringify(payload).slice(0, 1500)}`,
    });

  if (body.op === "next") {
    const { data } = await admin.from("maintenance_dispatches").select("id, case_id, attempt")
      .in("state", ["pending", "delivered"]).lte("next_attempt_at", new Date().toISOString())
      .order("created_at").limit(1).maybeSingle();
    return json({ dispatch: data ?? null });
  }

  if (body.op === "claim") {
    const { data, error } = await admin.rpc("maintenance_claim_dispatch", { _dispatch_id: body.dispatchId, _agent: body.agent, _lease_minutes: 30 });
    if (error || !data?.id) return json({ error: "Not claimable" }, 409);
    await admin.from("maintenance_cases").update({ agent_stage: "agent_investigating", last_actor_type: "agent" }).eq("id", data.case_id);
    await event(data.case_id, "agent_claimed", null, { dispatch_id: data.id, attempt: data.attempt });
    return json({ dispatch: { id: data.id, case_id: data.case_id, lease_expires_at: data.lease_expires_at } });
  }

  // Every remaining op requires a live lease held by this agent.
  const { data: d } = await admin.from("maintenance_dispatches").select("*").eq("id", body.dispatchId).maybeSingle();
  if (!d || d.state !== "claimed" || d.claimed_by !== body.agent || new Date(d.lease_expires_at) < new Date()) {
    return json({ error: "No valid lease" }, 409);
  }
  const { data: c } = await admin.from("maintenance_cases").select("*").eq("id", d.case_id).maybeSingle();
  if (!c) return json({ error: "Case not found" }, 404);

  switch (body.op) {
    case "heartbeat": {
      const lease = new Date(Date.now() + 30 * 60_000).toISOString();
      await admin.from("maintenance_dispatches").update({ lease_expires_at: lease }).eq("id", d.id);
      return json({ lease_expires_at: lease });
    }
    case "packet": {
      const [{ data: bug }, { data: reqs }] = await Promise.all([
        c.bug_report_id ? admin.from("ai_bug_reports").select("title, feature, screen, actual_behaviour, expected_behaviour, reproduction").eq("id", c.bug_report_id).maybeSingle() : Promise.resolve({ data: null }),
        admin.from("maintenance_case_requesters").select("scope_snapshot").eq("case_id", c.id),
      ]);
      const b = bug as Record<string, string | null> | null;
      const packet = buildAgentPacket({
        caseId: c.id, title: c.title, kind: c.kind, status: c.status, risk: c.risk as Risk,
        sensitiveAreas: c.sensitive_areas ?? [], tier: agentTier({ risk: c.risk as Risk, sensitiveAreas: c.sensitive_areas ?? [] }),
        memberTexts: [b?.title, b?.actual_behaviour, b?.expected_behaviour, b?.reproduction],
        requesterScopes: (reqs ?? []).map((r) => r.scope_snapshot),
      });
      const packetJson = JSON.stringify(packet);
      await admin.from("maintenance_dispatches").update({ packet, packet_hash: await sha256Hex(packetJson) }).eq("id", d.id);
      await event(c.id, "agent_packet_served", null, { packet_hash: await sha256Hex(packetJson) });
      return json({ packet });
    }
    case "analysis": {
      const sensitive = detectSensitiveAreas(body.summary, body.probableCause, body.affectedModule);
      const risk = maxRisk(finaliseRisk(body.risk), c.risk as Risk);
      const { data: a } = await admin.from("maintenance_analyses").insert({
        case_id: c.id, summary: body.summary, probable_cause: body.probableCause ?? null,
        affected_module: body.affectedModule ?? null, risk, actor_type: "agent",
        code_change_needed: body.codeChangeNeeded ?? null, more_info_needed: body.moreInfoNeeded ?? false, actor_label: `agent:${body.agent}`,
      }).select("id").maybeSingle();
      const merged = [...new Set([...(c.sensitive_areas ?? []), ...sensitive])];
      await admin.from("maintenance_cases").update({
        current_analysis_id: a?.id ?? c.current_analysis_id, risk, sensitive_areas: merged,
        requires_approval: risk !== "low" || merged.length > 0, last_actor_type: "agent",
      }).eq("id", c.id);
      await event(c.id, "agent_analysis", null, { analysis_id: a?.id, risk, sensitive_areas: merged });
      return json({ analysisId: a?.id, risk, sensitive_areas: merged });
    }
    case "progress": {
      const patch: Record<string, unknown> = { agent_stage: body.stage, last_actor_type: "agent" };
      if (body.toStatus) {
        if (!canTransition(c.status as MaintenanceStatus, body.toStatus as MaintenanceStatus)) return json({ error: "Invalid transition" }, 409);
        patch.status = body.toStatus;
      }
      const { error } = await admin.from("maintenance_cases").update(patch).eq("id", c.id);
      if (error) return json({ error: error.message }, 409);
      await event(c.id, "agent_progress", body.note ?? null, { stage: body.stage, status: body.toStatus ?? null });
      return json({ ok: true });
    }
    case "propose_action": {
      const guard = guardInstruction(body.instructionText, []);
      if (!guard.ok) {
        await event(c.id, "agent_instruction_rejected", null, { reasons: guard.reasons });
        return json({ error: "Instruction rejected by guard", reasons: guard.reasons }, 422);
      }
      const sensitive = [...new Set([...(c.sensitive_areas ?? []), ...detectSensitiveAreas(body.instructionText)])];
      const risk = maxRisk(c.risk as Risk, sensitive.length ? "medium" : "low");
      const needsApproval = executionRequiresApproval(body.executionClass, risk, sensitive);
      const { data: act, error } = await admin.from("maintenance_actions").insert({
        case_id: c.id, kind: body.kind, instruction_text: body.instructionText,
        target: body.kind === "lovable_instruction" ? "lovable" : "manual",
        execution_class: body.executionClass, risk, sensitive_areas: sensitive,
        auto_allowed: !needsApproval, state: needsApproval ? "awaiting_approval" : "draft",
      }).select("id").maybeSingle();
      if (error || !act) return json({ error: error?.message ?? "Insert failed" }, 409);
      const tag = correlationTag(c.id, act.id);
      await admin.from("maintenance_actions").update({ correlation_tag: tag }).eq("id", act.id);
      const send = body.kind === "lovable_instruction"
        ? canSendLovableInstruction(s, body.executionClass, null)
        : { allowed: false, reason: "not_a_lovable_instruction" };
      await event(c.id, "agent_action_proposed", null, { action_id: act.id, execution_class: body.executionClass, needs_approval: needsApproval, send });
      return json({ actionId: act.id, correlationTag: tag, needsApproval, send });
    }
    case "handoff": {
      const { data: act } = await admin.from("maintenance_actions").select("*").eq("id", body.actionId).eq("case_id", c.id).maybeSingle();
      if (!act) return json({ error: "Action not found" }, 404);
      const autoQ = act.auto_released ? { eligible: act.auto_release_qualification?.eligible === true, risk: c.risk as Risk, sensitiveAreas: c.sensitive_areas ?? [] } : null;
      const send = canSendLovableInstruction(s, act.execution_class, act.approved_by, autoQ);
      if (!send.allowed) return json({ error: "Not allowed", reason: send.reason }, 403);
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const { count } = await admin.from("maintenance_actions").select("id", { count: "exact", head: true })
        .not("sent_at", "is", null).gte("sent_at", today.toISOString());
      if ((count ?? 0) >= (s.max_instructions_per_day ?? 10)) return json({ error: "Daily instruction limit reached" }, 429);
      const expected = await sha256Hex(act.instruction_text);
      if (expected !== body.sentHash) return json({ error: "Sent text does not match the stored instruction" }, 409);
      const { error: upErr } = await admin.from("maintenance_actions").update({ external_ref: body.lovableRef, sent_hash: body.sentHash, sent_at: new Date().toISOString(), state: "in_progress" }).eq("id", act.id);
      if (upErr) return json({ error: upErr.message }, 409);
      await admin.from("maintenance_cases").update({ agent_stage: act.auto_released ? "auto_releasing" : "sent_to_lovable", last_actor_type: "agent" }).eq("id", c.id);
      await event(c.id, "lovable_handoff", null, { action_id: act.id, lovable_ref: body.lovableRef, sent_hash: body.sentHash, auto_release: !!act.auto_released });
      return json({ ok: true });
    }
    case "result": {
      const tests = {
        passed: body.testsPassed, counts: body.testCounts ?? null, build_ok: body.buildOk ?? null,
        typecheck_ok: body.typecheckOk ?? null, lint_ok: body.lintOk ?? null,
        files_changed: body.filesChanged ?? [], lines_changed: body.linesChanged ?? null,
      };
      await admin.from("maintenance_actions").update({
        result_summary: body.summary, tests, commit_sha: body.commitSha ?? null, state: "result_received",
      }).eq("id", body.actionId).eq("case_id", c.id);
      await admin.from("maintenance_cases").update({
        agent_stage: body.testsPassed && body.buildOk !== false ? "tests_passed" : "tests_failed",
        technical_result: { ...(c.technical_result ?? {}), last_action_id: body.actionId, summary: body.summary, ...tests, commit_sha: body.commitSha ?? null },
        last_actor_type: "agent",
      }).eq("id", c.id);
      await event(c.id, "agent_result", null, { action_id: body.actionId, tests_passed: body.testsPassed, commit_sha: body.commitSha ?? null });
      return json({ ok: true });
    }
    case "qualify_release": {
      const [{ data: act }, { data: an }] = await Promise.all([
        admin.from("maintenance_actions").select("*").eq("id", body.actionId).eq("case_id", c.id).maybeSingle(),
        c.current_analysis_id ? admin.from("maintenance_analyses").select("*").eq("id", c.current_analysis_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!act || act.state !== "result_received") return json({ error: "Prepared fix with results not found" }, 409);
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const { count: releasesToday } = await admin.from("maintenance_actions").select("id", { count: "exact", head: true })
        .eq("auto_released", true).gte("created_at", today.toISOString());
      const { data: reqs } = await admin.from("maintenance_case_requesters").select("scope_snapshot").eq("case_id", c.id);
      const exceeds = (reqs ?? []).some((r) => (r.scope_snapshot as Record<string, unknown> | null)?.exceeds_scope === true);
      const t = (act.tests ?? {}) as Record<string, any>;
      const q = evaluateAutoRelease({
        settings: s, autoReleasesToday: releasesToday ?? 0,
        case: { kind: c.kind, risk: c.risk as Risk, sensitiveAreas: c.sensitive_areas ?? [], exceedsRequesterScope: exceeds, reproducible: body.reproducible },
        analysis: an ? { risk: an.risk, codeChangeNeeded: an.code_change_needed, moreInfoNeeded: an.more_info_needed, summary: an.summary } : null,
        change: { filesChanged: t.files_changed, linesChanged: t.lines_changed, summary: act.result_summary },
        checks: { testsPassed: t.passed, passed: t.counts?.passed, failed: t.counts?.failed, buildOk: t.build_ok, typecheckOk: t.typecheck_ok, lintOk: t.lint_ok },
        verificationChecks: body.verificationChecks, commitSha: act.commit_sha,
      });
      const qualification = { ...q, evaluated_at: new Date().toISOString(), source_action_id: act.id };
      await admin.from("maintenance_actions").update({ auto_release_qualification: qualification }).eq("id", act.id);
      // Move the case into ready_for_release (agent may do this; release itself is DB-guarded).
      let status = c.status as MaintenanceStatus;
      for (const next of ["fix_in_progress", "ready_for_release"] as MaintenanceStatus[]) {
        if (status !== next && canTransition(status, next)) {
          const { error } = await admin.from("maintenance_cases").update({ status: next, last_actor_type: "agent" }).eq("id", c.id);
          if (!error) status = next;
        }
      }
      const instruction = `Publish the verified fix at commit ${act.commit_sha ?? "unknown"} for maintenance case ${c.id.slice(0, 8)}. Do not change any code. After publishing, run the post-deploy checks: ${body.verificationChecks.join("; ")}.`;
      const { data: rel, error: relErr } = await admin.from("maintenance_actions").insert({
        case_id: c.id, kind: "lovable_instruction", target: "lovable", execution_class: "release",
        instruction_text: instruction, risk: c.risk, sensitive_areas: c.sensitive_areas ?? [],
        auto_allowed: q.eligible, auto_released: q.eligible, auto_release_qualification: qualification,
        commit_sha: act.commit_sha, state: q.eligible ? "draft" : "awaiting_approval",
      }).select("id").maybeSingle();
      if (relErr || !rel) {
        // DB refused automatic release — fail closed and escalate.
        await admin.from("maintenance_cases").update({ agent_stage: "escalated", requires_approval: true, last_actor_type: "agent" }).eq("id", c.id);
        await event(c.id, "auto_release_refused", relErr?.message ?? null, { reasons: q.reasons });
        return json({ eligible: false, reasons: [...q.reasons, "database_refused"] });
      }
      const tag = correlationTag(c.id, rel.id);
      await admin.from("maintenance_actions").update({ correlation_tag: tag, instruction_text: `${tag} ${instruction}` }).eq("id", rel.id);
      await admin.from("maintenance_cases").update({
        agent_stage: q.eligible ? "auto_release_qualified" : "escalated",
        requires_approval: !q.eligible || c.requires_approval,
        technical_result: { ...(c.technical_result ?? {}), auto_release: { eligible: q.eligible, reasons: q.reasons } },
        last_actor_type: "agent",
      }).eq("id", c.id);
      await event(c.id, q.eligible ? "auto_release_qualified" : "auto_release_denied", null, { action_id: rel.id, reasons: q.reasons });
      return json({ eligible: q.eligible, reasons: q.reasons, releaseActionId: rel.id, instruction: `${tag} ${instruction}`, correlationTag: tag });
    }
    case "deploy_result": {
      const { data: act } = await admin.from("maintenance_actions").select("*").eq("id", body.actionId).eq("case_id", c.id).maybeSingle();
      if (!act || act.execution_class !== "release" || act.state !== "in_progress") return json({ error: "Release in progress not found" }, 409);
      await admin.from("maintenance_actions").update({ deploy_result: { ok: body.ok, ref: body.deploymentRef ?? null, detail: body.detail ?? null, at: new Date().toISOString() } }).eq("id", act.id);
      if (body.ok && act.auto_released) {
        const { error } = await admin.from("maintenance_cases").update({ status: "released", agent_stage: "verifying", last_actor_type: "agent" }).eq("id", c.id);
        if (error) {
          await admin.from("maintenance_cases").update({ agent_stage: "escalated", requires_approval: true, last_actor_type: "agent" }).eq("id", c.id);
          await event(c.id, "auto_release_blocked", error.message, { action_id: act.id });
          return json({ error: "Release blocked", reason: error.message }, 409);
        }
      } else if (!body.ok) {
        await admin.from("maintenance_cases").update({ agent_stage: "escalated", requires_approval: true, last_actor_type: "agent" }).eq("id", c.id);
      }
      await event(c.id, "deploy_result", body.detail ?? null, { action_id: act.id, ok: body.ok, ref: body.deploymentRef ?? null });
      return json({ ok: true });
    }
    case "verify": {
      const { data: act } = await admin.from("maintenance_actions").select("*").eq("id", body.actionId).eq("case_id", c.id).maybeSingle();
      if (!act || act.execution_class !== "release" || act.deploy_result?.ok !== true) return json({ error: "Deployed release not found" }, 409);
      const passed = verificationPassed(body.checks);
      await admin.from("maintenance_actions").update({
        verification: { passed, checks: body.checks, at: new Date().toISOString() },
        rollback: body.rolledBack ? { done: true, ref: body.rollbackRef ?? null, at: new Date().toISOString() } : null,
        state: passed ? "done" : "result_received",
      }).eq("id", act.id);
      if (passed && act.auto_released) {
        const { error } = await admin.from("maintenance_cases").update({ status: "completed", last_actor_type: "agent" }).eq("id", c.id);
        if (!error) {
          await admin.from("maintenance_cases").update({ agent_stage: "auto_released", auto_fixed: true, resolution_path: "auto_release", last_actor_type: "agent" }).eq("id", c.id);
          await admin.from("maintenance_dispatches").update({ state: "completed" }).eq("id", d.id);
        } else {
          await admin.from("maintenance_cases").update({ agent_stage: "escalated", requires_approval: true, last_actor_type: "agent" }).eq("id", c.id);
        }
      } else if (!passed) {
        const patch: Record<string, unknown> = { agent_stage: body.rolledBack ? "rolled_back" : "escalated", requires_approval: true, last_actor_type: "agent" };
        if (c.status === "released") patch.status = "issue_identified";
        await admin.from("maintenance_cases").update(patch).eq("id", c.id);
      }
      await event(c.id, passed ? "verification_passed" : "verification_failed", null, { action_id: act.id, checks: body.checks.length, rolled_back: !!body.rolledBack });
      return json({ ok: true, passed });
    }
  }
  return json({ error: "Unknown op" }, 400);
});

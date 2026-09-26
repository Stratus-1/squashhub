import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  AGENT_SETTABLE_STAGES, ATTENTION_STAGES, agentTier, autoReleaseSwitchOn, canSendLovableInstruction,
  evaluateAutoRelease, executionRequiresApproval, shouldOpenCircuit, verificationPassed,
  type AgentSettings, type AutoReleaseInput,
} from "@/lib/ai/maintenance-policy";

const ON: AgentSettings = { dispatch_mode: "pilot", lovable_instructions_enabled: true, stage_lock: false, pilot_allowlist: ["layout"], auto_release_enabled: true, auto_release_circuit_open: false, max_auto_releases_per_day: 3 };
const good = (): AutoReleaseInput => ({
  settings: ON, autoReleasesToday: 0,
  case: { kind: "bug", risk: "low", sensitiveAreas: [], reproducible: true },
  analysis: { risk: "low", codeChangeNeeded: true, moreInfoNeeded: false, summary: "Balance amount button did not open statement" },
  change: { filesChanged: ["src/components/club-admin/MembersTab.tsx", "src/test/members-tab-click.test.tsx"], linesChanged: 24, summary: "Wire onClick on balance chip" },
  checks: { testsPassed: true, passed: 1370, failed: 0, buildOk: true, typecheckOk: true, lintOk: true },
  verificationChecks: ["Open members list; tap balance; statement dialog opens"],
  commitSha: "abc1234",
});
const deny = (patch: (i: AutoReleaseInput) => void) => { const i = good(); patch(i); return evaluateAutoRelease(i); };

describe("auto-release allowlist — allowed", () => {
  it("a clear, narrow, tested low-risk UI fix qualifies", () => {
    const r = evaluateAutoRelease(good());
    expect(r.reasons).toEqual([]);
    expect(r.eligible).toBe(true);
  });
  it("qualified release no longer needs human approval; unqualified always does", () => {
    expect(executionRequiresApproval("release", "low", [], { eligible: true })).toBe(false);
    expect(executionRequiresApproval("release", "low", [], { eligible: false })).toBe(true);
    expect(executionRequiresApproval("release", "medium", [], { eligible: true })).toBe(true);
    expect(executionRequiresApproval("release", "low", ["payments_billing"], { eligible: true })).toBe(true);
    expect(executionRequiresApproval("execute_live", "low", [], { eligible: true })).toBe(true);
  });
  it("qualified release may be sent to Lovable only when all three switches are on", () => {
    const q = { eligible: true, risk: "low" as const, sensitiveAreas: [] };
    expect(canSendLovableInstruction(ON, "release", null, q).allowed).toBe(true);
    expect(canSendLovableInstruction({ ...ON, auto_release_enabled: false }, "release", null, q).reason).toBe("auto_release_off");
    expect(canSendLovableInstruction({ ...ON, auto_release_circuit_open: true }, "release", null, q).reason).toBe("auto_release_circuit_open");
    expect(canSendLovableInstruction({ ...ON, dispatch_mode: "shadow" }, "release", null, q).allowed).toBe(false);
    expect(canSendLovableInstruction(ON, "release", null, { ...q, eligible: false }).reason).toBe("approval_required");
  });
});

describe("auto-release allowlist — denied / escalated (fail closed)", () => {
  const cases: [string, (i: AutoReleaseInput) => void, string][] = [
    ["switch off", (i) => { i.settings = { ...ON, auto_release_enabled: false }; }, "auto_release_switch_off"],
    ["stage lock", (i) => { i.settings = { ...ON, stage_lock: true }; }, "auto_release_switch_off"],
    ["circuit open", (i) => { i.settings = { ...ON, auto_release_circuit_open: true }; }, "circuit_open"],
    ["daily limit", (i) => { i.autoReleasesToday = 3; }, "daily_auto_release_limit"],
    ["medium risk", (i) => { i.case.risk = "medium"; }, "case_risk_not_low"],
    ["sensitive case", (i) => { i.case.sensitiveAreas = ["rankings_ratings"]; }, "protected_area:rankings_ratings"],
    ["not reproduced", (i) => { i.case.reproducible = null; }, "not_reproduced"],
    ["above requester scope", (i) => { i.case.exceedsRequesterScope = true; }, "exceeds_requester_scope"],
    ["no analysis", (i) => { i.analysis = null; }, "no_analysis"],
    ["migration file", (i) => { i.change.filesChanged!.push("supabase/migrations/x.sql"); }, "outside_allowlist:supabase/migrations/x.sql"],
    ["edge function", (i) => { i.change.filesChanged!.push("supabase/functions/ai-help/index.ts"); }, "outside_allowlist:supabase/functions/ai-help/index.ts"],
    ["payments path", (i) => { i.change.filesChanged = ["src/components/club-admin/FinanceTab.tsx", "src/test/a.test.ts"]; }, "protected_path:payments_billing:src/components/club-admin/FinanceTab.tsx"],
    ["tournament path", (i) => { i.change.filesChanged = ["src/lib/tournaments/progression.ts", "src/test/a.test.ts"]; }, "protected_path:results_structures:src/lib/tournaments/progression.ts"],
    ["auth path", (i) => { i.change.filesChanged = ["src/contexts/AuthContext.tsx", "src/test/a.test.ts"]; }, "outside_allowlist:src/contexts/AuthContext.tsx"],
    ["path traversal", (i) => { i.change.filesChanged!.push("src/lib/../../supabase/x.ts"); }, "outside_allowlist:src/lib/../../supabase/x.ts"],
    ["too many files", (i) => { i.change.filesChanged = [...Array(6)].map((_, n) => `src/components/x${n}.tsx`).concat("src/test/a.test.ts"); }, "too_many_files"],
    ["too many lines", (i) => { i.change.linesChanged = 500; }, "too_many_lines"],
    ["lines unknown", (i) => { i.change.linesChanged = null; }, "lines_changed_unknown"],
    ["no regression test", (i) => { i.change.filesChanged = ["src/components/club-admin/MembersTab.tsx"]; }, "no_regression_test"],
    ["protected diff summary", (i) => { i.change.summary = "Adjust billing rounding"; }, "protected_change:payments_billing"],
    ["tests failed", (i) => { i.checks.failed = 2; i.checks.testsPassed = false; }, "tests_failed_or_unknown"],
    ["tests unknown", (i) => { i.checks.failed = null; }, "tests_failed_or_unknown"],
    ["build broken", (i) => { i.checks.buildOk = false; }, "build_not_ok"],
    ["typecheck missing", (i) => { i.checks.typecheckOk = null; }, "typecheck_not_ok"],
    ["lint missing", (i) => { i.checks.lintOk = undefined; }, "lint_not_ok"],
    ["no post-deploy check", (i) => { i.verificationChecks = []; }, "no_post_deploy_check"],
    ["no commit", (i) => { i.commitSha = null; }, "no_commit_reference"],
  ];
  for (const [name, patch, reason] of cases) {
    it(`denies: ${name}`, () => {
      const r = deny(patch);
      expect(r.eligible).toBe(false);
      expect(r.reasons).toContain(reason);
    });
  }
  it("an LLM confidence field cannot make a case eligible", () => {
    const i = { ...good(), confidence: 0.99 } as any; i.checks.lintOk = null;
    expect(evaluateAutoRelease(i).eligible).toBe(false);
  });
});

describe("operational corrections and requester scope stay in AI Assistance", () => {
  it("safe actions are tier A and never become dev jobs; above-scope routes to D", () => {
    expect(agentTier({ triage: "safe_action", risk: "low", sensitiveAreas: [] })).toBe("A");
    expect(agentTier({ triage: "bug", risk: "low", sensitiveAreas: [], exceedsRequesterScope: true })).toBe("D");
  });
});

describe("verification, circuit breaker and stages", () => {
  it("verification needs at least one check and all passing", () => {
    expect(verificationPassed([])).toBe(false);
    expect(verificationPassed(null)).toBe(false);
    expect(verificationPassed([{ name: "a", ok: true }, { name: "b", ok: false }])).toBe(false);
    expect(verificationPassed([{ name: "a", ok: true }])).toBe(true);
  });
  it("circuit opens after threshold failures", () => {
    expect(shouldOpenCircuit(1, 2)).toBe(false);
    expect(shouldOpenCircuit(2, 2)).toBe(true);
  });
  it("switch is off unless every control is on", () => {
    expect(autoReleaseSwitchOn(ON)).toBe(true);
    expect(autoReleaseSwitchOn({ ...ON, lovable_instructions_enabled: false })).toBe(false);
    expect(autoReleaseSwitchOn({ ...ON, dispatch_mode: "shadow" })).toBe(false);
  });
  it("agent cannot self-set auto-release stages; rollback/escalation need attention", () => {
    for (const st of ["auto_released", "auto_releasing", "verifying", "released", "approved"]) expect(AGENT_SETTABLE_STAGES).not.toContain(st);
    expect(ATTENTION_STAGES).toEqual(expect.arrayContaining(["rolled_back", "escalated"]));
  });
});

describe("database guards for the auto-release lane", () => {
  const sql = readdirSync("supabase/migrations").map((f) => readFileSync(`supabase/migrations/${f}`, "utf8")).find((t) => t.includes("maintenance_auto_release_ok"))!;
  it("auto-release defaults OFF and requires pilot + Lovable instructions + closed breaker", () => {
    expect(sql).toMatch(/auto_release_enabled boolean NOT NULL DEFAULT false/);
    expect(sql).toMatch(/auto-release requires pilot dispatch and Lovable instructions/);
    expect(sql).toMatch(/circuit breaker is open/);
  });
  it("automated release/complete requires a qualified, deployed, verified low-risk release", () => {
    expect(sql).toMatch(/c\.risk = 'low'/);
    expect(sql).toMatch(/\(a\.deploy_result->>'ok'\) = 'true'/);
    expect(sql).toMatch(/\(a\.verification->>'passed'\) = 'true'/);
    expect(sql).toMatch(/automated actors cannot approve a case/);
  });
  it("repeated failures trip the breaker", () => {
    expect(sql).toMatch(/SET auto_release_enabled = false, auto_release_circuit_open = true/);
  });
});

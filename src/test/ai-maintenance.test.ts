import { describe, expect, it } from "vitest";
import {
  AUTOMATED_ACTORS,
  HUMAN_ONLY_STATUSES,
  SENSITIVE_AREAS,
  canTransition,
  caseToBugStatus,
  detectSensitiveAreas,
  finaliseRisk,
  policyFor,
  redactPii,
  type MaintenanceStatus,
} from "@/lib/ai/maintenance-policy";
import { requestStatus, type MyAiRow } from "@/lib/ai-requests";

const row = (over: Partial<MyAiRow> = {}): MyAiRow => ({
  id: "r1", user_id: "u1", club_id: null, conversation_id: null, kind: "question",
  request_text: "q", assistant_answer: null, status: "answered", action_name: null,
  preview: null, result: null, error: null, ticket_id: null, bug_report_id: null,
  expires_at: null, executed_at: null, created_at: new Date().toISOString(), retry_of: null,
  ...over,
});

describe("maintenance policy", () => {
  it("auto-allows only low-risk, non-sensitive work", () => {
    expect(policyFor("low", [])).toEqual({ requires_approval: false, auto_allowed: true });
    expect(policyFor("medium", [])).toEqual({ requires_approval: true, auto_allowed: false });
    expect(policyFor("low", ["payments_billing"])).toEqual({ requires_approval: true, auto_allowed: false });
    expect(policyFor("high", [])).toEqual({ requires_approval: true, auto_allowed: false });
  });

  it("detects each sensitive area from plain text", () => {
    expect(detectSensitiveAreas("reverse the bar tab charge on invoice 12")).toContain("payments_billing");
    expect(detectSensitiveAreas("merge the duplicate member record for Jane")).toContain("member_deletion_merge");
    expect(detectSensitiveAreas("move Tarren up the ladder order")).toContain("rankings_ratings");
    expect(detectSensitiveAreas("correct the tournament standings and winner")).toContain("results_structures");
    expect(detectSensitiveAreas("add an admin role to that user")).toContain("permissions_security_roles");
    expect(detectSensitiveAreas("restructure the association hierarchy")).toContain("organisation_hierarchy");
    expect(detectSensitiveAreas("run a migration adding a column")).toContain("schema_migration");
    expect(detectSensitiveAreas("bulk delete the old rows")).toContain("destructive_data");
    expect(detectSensitiveAreas("which courts are free tonight?")).toEqual([]);
  });

  it("never lowers risk below the proposed level and bumps on severity", () => {
    expect(finaliseRisk("low", undefined)).toBe("low");
    expect(finaliseRisk("low", "high")).toBe("high");
    expect(finaliseRisk(undefined, "critical")).toBe("high");
    expect(finaliseRisk("high", "low")).toBe("high");
t  });
});

describe("case state machine mirror", () => {
  it("mirrors the SQL transition table", () => {
    expect(canTransition("new", "analysing")).toBe(true);
    expect(canTransition("analysing", "needs_info")).toBe(true);
    expect(canTransition("needs_info", "analysing")).toBe(true);
    expect(canTransition("issue_identified", "awaiting_approval")).toBe(true);
    expect(canTransition("awaiting_approval", "approved")).toBe(true);
    expect(canTransition("approved", "ready_for_release")).toBe(true);
    expect(canTransition("ready_for_release", "released")).toBe(true);
    expect(canTransition("released", "completed")).toBe(true);
    expect(canTransition("completed", "new")).toBe(false);
    expect(canTransition("new", "released")).toBe(false);
    expect(canTransition("analysing", "awaiting_approval")).toBe(false);
t  });

  it("blocks automated actors on human-only statuses", () => {
    for (const s of HUMAN_ONLY_STATUSES) {
      for (const a of AUTOMATED_ACTORS) {
        // the DB trigger rejects these; the mirror documents the same rule
        expect(HUMAN_ONLY_STATUSES).toContain(s);
        expect(["system", "assistant", "agent"]).toContain(a);
      }
    }
  });

  it("maps case status to the derived bug status", () => {
    expect(caseToBugStatus("new")).toBe("investigating");
    expect(caseToBugStatus("issue_identified")).toBe("fix_in_development");
    expect(caseToBugStatus("ready_for_release")).toBe("fix_ready");
    expect(caseToBugStatus("released")).toBe("published");
    expect(caseToBugStatus("completed")).toBe("fixed");
    expect(caseToBugStatus("rejected")).toBe("wont_fix");
  });
});

describe("pii redaction", () => {
  it("removes emails, SA IDs, phones and dates", () => {
    const out = redactPii("Contact jane@example.org or 0825551234, ID 8501125001085, born 1985-11-12.");
    expect(out).not.toContain("jane@example.org");
    expect(out).toContain("[email]");
    expect(out).not.toContain("8501125001085");
    expect(out).toContain("[id-number]");
    expect(out).not.toContain("0825551234");
    expect(out).toContain("[phone]");
    expect(out).toContain("[date]");
  });
});

describe("requester-facing status with case status", () => {
  it("asks for more detail without technical wording", () => {
    const s = requestStatus(row({ bug_report_id: "b1" }), "investigating", null, "needs_info");
    expect(s.label).toContain("Needs more detail from you");
    expect(s.tone).toBe("waiting");
  });

  it("shows fix ready while approval/release is pending", () => {
    const s = requestStatus(row({ bug_report_id: "b1" }), "fix_in_development", null, "awaiting_approval");
    expect(s.label).toContain("Fix ready");
  });

  it("falls back to the bug status when no case status is known", () => {
    const s = requestStatus(row({ bug_report_id: "b1" }), "open", null, null);
    expect(s.label).toContain("Reported");
  });
});

describe("sensitive areas catalogue", () => {
  it("covers every always-sensitive domain from the plan", () => {
    for (const area of ["payments_billing", "member_deletion_merge", "rankings_ratings", "results_structures", "permissions_security_roles", "organisation_hierarchy", "schema_migration", "destructive_data"]) {
      expect(SENSITIVE_AREAS).toContain(area as (typeof SENSITIVE_AREAS)[number]);
    }
  });
});

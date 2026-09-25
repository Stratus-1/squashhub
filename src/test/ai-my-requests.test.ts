import { describe, it, expect } from "vitest";
import { canRetry, groupConversations, requestStatus, turnsFromRows, type MyAiRow } from "@/lib/ai-requests";
import { confirmGate } from "../../supabase/functions/ai-help/flow";

const ME = "u-me", OTHER = "u-other", CLUB = "c1";
let n = 0;
const row = (p: Partial<MyAiRow>): MyAiRow => ({
  id: `r${++n}`, user_id: ME, club_id: CLUB, conversation_id: null, kind: "question", request_text: "q", assistant_answer: "a",
  status: "answered", action_name: null, preview: null, result: null, error: null, ticket_id: null, bug_report_id: null,
  expires_at: null, executed_at: null, created_at: `2026-09-25T08:${String(n).padStart(2, "0")}:00Z`, retry_of: null, ...p,
});

describe("My requests (requester history)", () => {
  it("1/9: own previous request is restored from server rows after closing/reopening or re-login", () => {
    const rows = [row({ request_text: "cancel my booking", conversation_id: "conv1" })];
    const convs = groupConversations(rows, ME);
    expect(convs).toHaveLength(1);
    expect(turnsFromRows(convs[0].rows).map((t) => t.content)).toEqual(["cancel my booking", "a"]);
  });

  it("2: another user's rows are never shown, even if returned (club admin RLS)", () => {
    const rows = [row({ user_id: OTHER, request_text: "secret" }), row({ request_text: "mine" })];
    const convs = groupConversations(rows, ME);
    expect(convs.map((c) => c.title)).toEqual(["mine"]);
  });

  it("3/10: pending removal can be reopened and confirmed exactly once", () => {
    const pending = row({ kind: "action", action_name: "remove_club_member", status: "proposed", expires_at: "2099-01-01T00:00:00Z", preview: { summary: "x" } });
    expect(requestStatus(pending).label).toBe("Waiting for your confirmation");
    expect(confirmGate(pending, ME, CLUB)).toBe("ok");
    // After the atomic claim, a second Confirm is refused.
    expect(confirmGate({ ...pending, status: "confirmed" }, ME, CLUB)).toBe("handled");
    expect(confirmGate({ ...pending, status: "executed" }, ME, CLUB)).toBe("handled");
    expect(confirmGate(pending, OTHER, CLUB)).toBe("not_found");
  });

  it("4: old pre-fix escalations can never be confirmed/executed; only deliberately retried", () => {
    const old = row({ kind: "escalation", status: "escalated", ticket_id: "t1", request_text: "remove Michelle de Villiers" });
    expect(confirmGate(old, ME, CLUB)).toBe("handled");
    expect(canRetry(old, false)).toBe(true);
    expect(canRetry(old, true)).toBe(false);
  });

  it("5: completed removal shows the completed action and Resigned result", () => {
    const done = row({ kind: "action", action_name: "remove_club_member", status: "executed", executed_at: "2026-09-25T09:00:00Z", result: { message: "Michelle de Villiers is now Resigned." } });
    expect(requestStatus(done).label).toBe("Completed action");
    expect(turnsFromRows([done]).map((t) => t.content)).toContain("Michelle de Villiers is now Resigned.");
  });

  it("6: bug request shows bug lifecycle, not generic Completed", () => {
    const b = row({ kind: "bug_report", status: "bug_reported", bug_report_id: "b1" });
    expect(requestStatus(b, "investigating").label).toBe("Bug reported · Investigating");
    expect(requestStatus(b, "open").label).toBe("Bug reported · Reported");
    expect(requestStatus(b, "fixed").label).toBe("Bug reported · Fixed · verified");
    expect(requestStatus(b, "open").label).not.toMatch(/Completed/);
  });

  it("7: support request shows linked ticket status", () => {
    const s = row({ kind: "escalation", status: "escalated", ticket_id: "t1" });
    expect(requestStatus(s, null, "open").label).toBe("Support request · Open");
    expect(requestStatus(s, null, "resolved").label).toBe("Support request · Resolved");
  });

  it("8: follow-ups stay attached to the correct conversation", () => {
    const rows = [
      row({ conversation_id: "A", request_text: "first A" }), row({ conversation_id: "B", request_text: "first B" }),
      row({ conversation_id: "A", request_text: "follow-up A" }),
    ];
    const convs = groupConversations(rows, ME);
    const a = convs.find((c) => c.id === "A")!;
    expect(a.rows.map((r) => r.request_text)).toEqual(["first A", "follow-up A"]);
    expect(convs.find((c) => c.id === "B")!.rows).toHaveLength(1);
    expect(convs[0].id).toBe("A"); // most recently updated first
  });

  it("expired pending preview is not presented as waiting", () => {
    expect(requestStatus(row({ status: "proposed", expires_at: "2000-01-01T00:00:00Z" })).label).toMatch(/expired/);
  });
});

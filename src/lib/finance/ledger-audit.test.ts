import { describe, it, expect } from "vitest";
import { mergeLedgerAudit, countable, applyAuditView, type LedgerAuditRow } from "./ledger-audit";

const live = [
  { id: "a1", journal_ref: "J1", account: "debtors", debit: 210, credit: 0, club_member_id: "m1", created_at: "2026-11-01T10:00:00Z" },
  { id: "a2", journal_ref: "J1", account: "fee_income", debit: 0, credit: 210, club_member_id: "m1", created_at: "2026-11-01T10:00:00Z" },
  { id: "r1", journal_ref: "J2", account: "debtors", debit: 0, credit: 210, club_member_id: "m1", created_at: "2026-11-02T10:00:00Z", reverses_journal_ref: "J1" },
  { id: "e1", journal_ref: "J3", account: "debtors", debit: 100, credit: 0, club_member_id: "m1", created_at: "2026-11-03T10:00:00Z" },
];
const audit: LedgerAuditRow[] = [
  { kind: "deleted", entry_id: "d1", journal_ref: "J9", club_member_id: "m1", row_data: { id: "d1", journal_ref: "J9", account: "debtors", debit: 500, credit: 0, club_member_id: "m1", created_at: "2026-10-30T10:00:00Z" }, new_data: null, actor_name: "Rachel Treasurer", changed_at: "2026-11-05T08:00:00Z", note: null },
  { kind: "reversed", entry_id: null, journal_ref: "J1", club_member_id: null, row_data: { reversal_journal_ref: "J2" }, new_data: null, actor_name: "Rachel Treasurer", changed_at: "2026-11-02T10:00:00Z", note: null },
  { kind: "edited", entry_id: "e1", journal_ref: "J3", club_member_id: "m1", row_data: { debit: 210, credit: 0, description: "Old" }, new_data: null, actor_name: null, changed_at: "2026-11-04T10:00:00Z", note: null },
];

describe("finance audit trail display", () => {
  const merged = mergeLedgerAudit(live, audit);

  it("keeps a deleted transaction on the list, flagged with who deleted it", () => {
    const ghost = merged.find((e) => e.entry_id === "d1");
    expect(ghost?.audit).toMatchObject({ status: "deleted", by: "Rachel Treasurer" });
  });

  it("never counts a deleted transaction in totals", () => {
    const debits = countable(merged).reduce((s, e) => s + Number(e.debit || 0), 0);
    expect(debits).toBe(310);
  });

  it("flags the original as reversed and the reversal with the person who reversed it", () => {
    expect(merged.find((e) => e.id === "a1")?.audit).toMatchObject({ status: "reversed", by: "Rachel Treasurer" });
    expect(merged.find((e) => e.id === "r1")?.audit).toMatchObject({ status: "reversal", by: "Rachel Treasurer" });
  });

  it("shows the old amount of an edited line and names System when no person did it", () => {
    expect(merged.find((e) => e.id === "e1")?.audit).toMatchObject({ status: "edited", by: "System", was: { debit: 210 } });
  });

  it("can hide deleted and reversed lines together, keeping the reversal pair out so totals still net", () => {
    const ids = applyAuditView(merged, "clean").map((e) => e.id);
    expect(ids).not.toContain("a1");
    expect(ids).not.toContain("r1");
    expect(ids.some((id) => String(id).startsWith("deleted:"))).toBe(false);
    expect(ids).toContain("e1");
  });

  it("can hide deleted lines or show only changed lines", () => {
    expect(applyAuditView(merged, "live_only").some((e) => e.entry_id === "d1")).toBe(false);
    expect(applyAuditView(merged, "changes_only").map((e) => e.id).sort()).toEqual(["a1", "a2", "deleted:d1:2026-11-05T08:00:00Z", "e1", "r1"].sort());
  });
});

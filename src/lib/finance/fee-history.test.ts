import { describe, expect, it } from "vitest";
import { feesAsAtSeason, feeChangesInSeason, feeHistorySeasons, type FeeHistoryRow } from "./fee-history";
import { coveredPayableIds, isPayableSeasonLocked, type ManualPayable } from "./payable-schedule";

const row = (p: Partial<FeeHistoryRow>): FeeHistoryRow => ({
  fee_source: "member_fee_categories", fee_id: "senior", fee_name: "Senior", fee_kind: "membership",
  amount: 1000, previous_amount: null, season_year: 2026, change_kind: "baseline",
  changed_by_name: null, changed_at: "2026-11-22T08:00:00Z", ...p,
});

describe("club fee history by year", () => {
  const rows = [
    row({}),
    row({ amount: 1200, previous_amount: 1000, season_year: 2027, change_kind: "changed", changed_at: "2026-11-25T08:00:00Z" }),
    row({ fee_id: "junior", fee_name: "Junior", amount: 500, season_year: 2027, change_kind: "added", changed_at: "2026-11-26T08:00:00Z" }),
  ];

  it("keeps the 2026 amount when the 2027 amount is entered in November 2026", () => {
    expect(feesAsAtSeason(rows, 2026).map((f) => [f.name, f.amount])).toEqual([["Senior", 1000]]);
  });

  it("shows the 2027 fee list with the new amount and the new fee", () => {
    expect(feesAsAtSeason(rows, 2027).map((f) => [f.name, f.amount])).toEqual([["Junior", 500], ["Senior", 1200]]);
  });

  it("drops a fee removed in a season from that season onward", () => {
    const withRemoval = [...rows, row({ fee_id: "junior", fee_name: "Junior", amount: null, season_year: 2028, change_kind: "removed", changed_at: "2028-02-01T08:00:00Z" })];
    expect(feesAsAtSeason(withRemoval, 2028).map((f) => f.name)).toEqual(["Senior"]);
    expect(feesAsAtSeason(withRemoval, 2027).map((f) => f.name)).toEqual(["Junior", "Senior"]);
  });

  it("lists only real changes for a season, newest seasons first", () => {
    expect(feeChangesInSeason(rows, 2026)).toHaveLength(0);
    expect(feeChangesInSeason(rows, 2027)).toHaveLength(2);
    expect(feeHistorySeasons(rows, 2026)).toEqual([2027, 2026]);
  });
});

describe("fees payable by the club per season", () => {
  const ssa: ManualPayable = { id: "ssa", payee_type: "national_body", payee_name: "Squash South Africa (SSA)", payee_ref_id: null, basis: "per_member", season_year: 2026 };

  it("replaces the manual SSA per-member row when SSA set its own rate for the season", () => {
    expect(coveredPayableIds([ssa], [], [{ organisation_name: "Squash South Africa", basis: "per_member" }], [], []).has("ssa")).toBe(true);
    expect(coveredPayableIds([ssa], [], [], [], []).size).toBe(0);
  });

  it("locks seasons before the current year", () => {
    expect(isPayableSeasonLocked(2025, 2026)).toBe(true);
    expect(isPayableSeasonLocked(2026, 2026)).toBe(false);
    expect(isPayableSeasonLocked(2027, 2026)).toBe(false);
  });
});

describe("switched-off club copies of association rates", () => {
  it("hides an NSA copy switched off because NSA's own schedule now sets the rate", async () => {
    const { isRetiredCopy } = await import("./payable-schedule");
    expect(isRetiredCopy({ active: false, notes: "NSA 2026 League fees @ R2600 per team. [Switched off 22 Nov 2026: NSA rates come from NSA's own schedule.]" })).toBe(true);
  });
  it("keeps a club's own fee that an admin merely paused", async () => {
    const { isRetiredCopy } = await import("./payable-schedule");
    expect(isRetiredCopy({ active: false, notes: "Paused for now" })).toBe(false);
    expect(isRetiredCopy({ active: true, notes: "[Switched off 22 Nov 2026: NSA rates come from NSA's own schedule.]" })).toBe(false);
  });
});

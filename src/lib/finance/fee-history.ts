/**
 * Year-by-year view of the fees a club charges its members.
 * Rows come from `club_fee_rate_history`, written only by a database trigger
 * whenever a fee amount is added, changed or removed.
 */
export interface FeeHistoryRow {
  fee_source: string;
  fee_id: string;
  fee_name: string | null;
  fee_kind: string | null;
  amount: number | null;
  previous_amount: number | null;
  season_year: number;
  change_kind: "baseline" | "added" | "changed" | "removed";
  changed_by_name: string | null;
  changed_at: string;
}

export interface FeeAsAtSeason {
  key: string;
  fee_source: string;
  fee_id: string;
  name: string;
  kind: string;
  amount: number;
  appliesFrom: number;
}

const order = (a: FeeHistoryRow, b: FeeHistoryRow) =>
  a.season_year - b.season_year || a.changed_at.localeCompare(b.changed_at);

/** Seasons that have a recorded fee list, newest first. */
export function feeHistorySeasons(rows: FeeHistoryRow[], currentYear: number): number[] {
  const set = new Set<number>(rows.map((r) => r.season_year));
  if (set.size === 0) set.add(currentYear);
  return [...set].sort((a, b) => b - a);
}

/** The fee list as it stood for a season: each fee's latest amount recorded for that season or earlier. */
export function feesAsAtSeason(rows: FeeHistoryRow[], season: number): FeeAsAtSeason[] {
  const latest = new Map<string, FeeHistoryRow>();
  rows
    .filter((r) => r.season_year <= season)
    .sort(order)
    .forEach((r) => latest.set(`${r.fee_source}:${r.fee_id}`, r));
  const out: FeeAsAtSeason[] = [];
  latest.forEach((r, key) => {
    if (r.change_kind === "removed") return;
    out.push({
      key,
      fee_source: r.fee_source,
      fee_id: r.fee_id,
      name: r.fee_name || "Fee",
      kind: r.fee_kind || "",
      amount: Number(r.amount ?? 0),
      appliesFrom: r.season_year,
    });
  });
  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

/** Changes recorded for exactly this season (the starting record is not a change). */
export function feeChangesInSeason(rows: FeeHistoryRow[], season: number): FeeHistoryRow[] {
  return rows
    .filter((r) => r.season_year === season && r.change_kind !== "baseline")
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at));
}

export function feeKindLabel(kind: string): string {
  switch (kind) {
    case "membership": return "Membership";
    case "league": return "League";
    case "league_affiliation": return "League Affiliation";
    case "registration": return "Registration";
    case "other": return "Other";
    default: return "National Body";
  }
}

/** From October onwards a new amount is usually next year's fee. */
export function defaultRateSeason(now: Date): number {
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

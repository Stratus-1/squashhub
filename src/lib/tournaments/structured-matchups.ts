/**
 * Structured (Tournament Beta) divisions can join several entry groups into
 * one competitive matchup — e.g. "Between subcategories": Men's A plays
 * Men's B. The generated games are stored under the division's groupNumber
 * (the first entry group), so standings and fixture headings must read the
 * matchup from builder_spec rather than assume one group = one league.
 *
 * Pure helpers: no data is changed here.
 */

export interface StructuredMatchup {
  /** group_number the generated games are stored under. */
  groupNumber: number;
  /** Entry groups (subcategories) that meet in this matchup, in spec order. */
  entryGroups: number[];
  /** Per-subcategory labels in the same order as entryGroups (may be empty). */
  labels: string[];
}

/** Matchups that span more than one entry group. Single-group divisions are ignored. */
export function structuredMatchups(spec: any): StructuredMatchup[] {
  const divs: any[] = Array.isArray(spec?.divisions) ? spec.divisions : [];
  const out: StructuredMatchup[] = [];
  for (const d of divs) {
    const groups: number[] = (Array.isArray(d?.entryGroups) ? d.entryGroups : [])
      .map((g: any) => Number(g)).filter((g: number) => Number.isFinite(g));
    if (groups.length < 2) continue;
    const labels: string[] = Array.isArray(d?.poolLabels) ? d.poolLabels.map((l: any) => String(l ?? "")) : [];
    out.push({ groupNumber: Number(d.groupNumber ?? groups[0]), entryGroups: groups, labels });
  }
  return out;
}

export function matchupForGroup(matchups: StructuredMatchup[], gn: number | null | undefined): StructuredMatchup | null {
  if (gn == null) return null;
  return matchups.find((m) => m.entryGroups.includes(gn)) ?? null;
}

/** Matchup whose games are stored under this group_number. */
export function matchupForMatchGroup(matchups: StructuredMatchup[], gn: number | null | undefined): StructuredMatchup | null {
  if (gn == null) return null;
  return matchups.find((m) => m.groupNumber === gn) ?? null;
}

/** "Men's › A · Doubles vs Men's › B · Doubles" — every side, never just the first. */
export function matchupHeading(m: StructuredMatchup, labelFor: (gn: number) => string): string {
  return m.entryGroups.map((g, i) => (m.labels[i] || "").trim() || labelFor(g)).join(" vs ");
}

export interface StandingsUnitIssue { level: "error" | "warning"; message: string }

type EntryLike = { club_member_id?: string | null; partner_member_id?: string | null; group_number?: number | null };

/**
 * Check the standings participants against the generated draw: same pairs,
 * no singles duplicates, no missing partners, each pair in the right group,
 * no pair listed in a group of another matchup / parent.
 */
export function validateStandingsUnits(spec: any, entries: EntryLike[], matchups: StructuredMatchup[]): StandingsUnitIssue[] {
  const issues: StandingsUnitIssue[] = [];
  const key = (a?: string | null, b?: string | null) => [a, b].filter(Boolean).sort().join("+");
  const seen = new Map<string, number>();
  const memberSeen = new Map<string, number>();
  for (const e of entries) {
    const k = key(e.club_member_id, e.partner_member_id);
    if (!k) continue;
    seen.set(k, (seen.get(k) ?? 0) + 1);
    for (const id of [e.club_member_id, e.partner_member_id]) if (id) memberSeen.set(id, (memberSeen.get(id) ?? 0) + 1);
  }
  for (const [id, n] of memberSeen) if (n > 1) issues.push({ level: "error", message: `A player appears in ${n} standings rows (${id.slice(0, 8)}…) — duplicate entry.` });

  const divs: any[] = Array.isArray(spec?.divisions) ? spec.divisions : [];
  for (const m of matchups) {
    const d = divs.find((x) => Number(x?.groupNumber) === m.groupNumber);
    const stage = (d?.stages ?? []).find((s: any) => Array.isArray(s?.mapping?.positions));
    const positions: string[][] | undefined = stage?.mapping?.positions;
    if (!positions) continue;
    positions.forEach((pool, i) => {
      const gn = m.entryGroups[i];
      for (const unit of pool) {
        const [a, b] = String(unit).split("+");
        const k = key(a, b);
        const e = entries.find((x) => key(x.club_member_id, x.partner_member_id) === k);
        if (!e) {
          const half = entries.find((x) => [x.club_member_id, x.partner_member_id].some((id) => id === a || id === b));
          issues.push({ level: "error", message: half
            ? "A pair in the generated draw is listed differently in the entries (partner changed or missing)."
            : "A pair in the generated draw has no current entry." });
          continue;
        }
        if (gn != null && e.group_number !== gn) {
          issues.push({ level: "error", message: `A pair drawn in group ${gn} is entered in group ${e.group_number}.` });
        }
      }
    });
    const drawn = new Set(positions.flat().map((u) => key(...(String(u).split("+") as [string, string]))));
    // Partner checks apply only to real doubles units (pair draw or doubles discipline).
    const disc = String(stage?.mapping?.discipline ?? stage?.discipline ?? d?.discipline ?? "").toLowerCase();
    const pairUnits = disc === "doubles" || d?.unit === "pairs" || (disc !== "singles" && positions.flat().some((u) => String(u).includes("+")));
    for (const e of entries) {
      if (e.group_number == null || !m.entryGroups.includes(e.group_number)) continue;
      if (!pairUnits) { if (!drawn.has(key(e.club_member_id, null))) issues.push({ level: "warning", message: "An entered player is not in the generated draw." }); continue; }
      if (!e.partner_member_id) issues.push({ level: "error", message: "A doubles entry has no partner." });
      else if (!drawn.has(key(e.club_member_id, e.partner_member_id))) issues.push({ level: "warning", message: "An entered pair is not in the generated draw." });
    }
  }
  return issues;
}

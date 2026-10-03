/** Display identity only: paced knockout rounds are numbered within a category, not tournament-wide. */
export function pacedKnockoutRound(m: {
  stage?: string | null;
  stage_key?: string | null;
  division_id?: string | null;
  stage_label?: string | null;
  round_number?: number | null;
}): number | null {
  if (!m.stage_key && !m.division_id) return null;
  if (m.stage !== "ko" && m.stage !== "knockout") return null;
  // A formal play-off can also be stored as "ko": its explicit stage label wins.
  if (/quarter|semi|\bfinal\b|3rd place/i.test(m.stage_label ?? "")) return null;
  const n = Number(m.round_number);
  return Number.isInteger(n) && n > 0 && n < 99 ? n : null;
}

export function knockoutCategoryNames<T extends { champ_id: string; group_number?: number | null }>(
  matches: T[], nameOf: (match: T) => string,
): string[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    const id = `${m.champ_id}:${m.group_number ?? "-"}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(nameOf);
}
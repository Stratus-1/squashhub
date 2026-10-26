/**
 * AGM secret ballot helpers (pure). Server functions enforce eligibility,
 * one-vote-per-member, the deadline and anonymity; these helpers only shape
 * admin input and results for display.
 */

export type BallotPositionDraft = { title: string; nominees: string[] };

export const DEFAULT_DECLARATION = (clubName: string) =>
  `I confirm that I am a paid-up member of ${clubName}, aged 18 years or older, and entitled to vote in accordance with the Club Constitution. I confirm that I will submit only one ballot.`;

/** "Chairperson: A, B" per line → positions. Blank/duplicate nominees are dropped. */
export function parseBallotText(text: string): BallotPositionDraft[] {
  const out: BallotPositionDraft[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) throw new Error(`Line "${line}" needs "Position: nominee, nominee"`);
    const title = line.slice(0, idx).trim();
    const seen = new Set<string>();
    const nominees = line
      .slice(idx + 1)
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    if (!nominees.length) throw new Error(`"${title}" needs at least one nominee`);
    if (out.some((p) => p.title.toLowerCase() === title.toLowerCase())) throw new Error(`"${title}" is listed twice`);
    out.push({ title, nominees });
  }
  return out;
}

export function formatBallotText(positions: BallotPositionDraft[]): string {
  return positions.map((p) => `${p.title}: ${p.nominees.join(", ")}`).join("\n");
}

/** Public voting link. Production links use the main domain. */
export function buildVoteLink(token: string, origin: string): string {
  const isPreview = /localhost|lovable|127\.0\.0\.1/.test(origin);
  return `${isPreview ? origin : "https://squashhub.co.za"}/vote/${token}`;
}

export type TallyRow = { candidate_id: string; name: string; votes: number };

/** Winner(s) of a position; more than one name means a tie. Empty when no votes. */
export function positionWinners(tally: TallyRow[]): string[] {
  const max = Math.max(0, ...tally.map((t) => t.votes));
  if (max === 0) return [];
  return tally.filter((t) => t.votes === max).map((t) => t.name);
}

/** Recount totals from the anonymous receipt list (independent verification). */
export function recountFromReceipts(
  receipts: { code: string; choices: Record<string, string | null> | null }[],
  positionId: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of receipts) {
    const c = r.choices?.[positionId] ?? "abstain";
    counts[c] = (counts[c] ?? 0) + 1;
  }
  return counts;
}

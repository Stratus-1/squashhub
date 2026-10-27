import type { TallyRow } from "./ballot";

/** Only a tie crossing the last available seat needs a second ballot. */
export function runoffForPosition(tally: TallyRow[], seats = 1) {
  const ranked = tally.filter((row) => row.votes > 0).sort((a, b) => b.votes - a.votes);
  if (ranked.length <= seats || seats < 1) return null;
  const cutoff = ranked[seats - 1].votes;
  const elected = ranked.filter((row) => row.votes > cutoff);
  const tied = ranked.filter((row) => row.votes === cutoff);
  const remainingSeats = seats - elected.length;
  return tied.length > remainingSeats ? { elected, tied, remainingSeats } : null;
}
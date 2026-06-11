/**
 * Rank-based heat colour for standings rows.
 * Top = dark green, fading through light green, then pink, to red at the bottom.
 * Matches the tournament standings tint (ClubChampsView).
 *
 *   <tr style={rankTint(i, rows.length)} />
 */
export function rankTint(rank: number, total: number): React.CSSProperties {
  // Light pastel tints so dark text (and emerald/rose cell colors) remain legible.
  const darkText = "hsl(220 25% 15%)";
  if (total <= 1) return { backgroundColor: "hsl(140 45% 88%)", color: darkText };
  const t = rank / (total - 1); // 0 = top, 1 = bottom
  let h: number, s: number, l: number;
  if (t <= 0.5) {
    // Stronger light green -> very light green
    const k = t / 0.5;
    h = 140;
    s = 45 - k * 10;        // 45% -> 35%
    l = 78 + k * 14;        // 78% -> 92%
  } else {
    // Very light pink -> light red
    const k = (t - 0.5) / 0.5;
    h = 350 - k * 5;        // 350 -> 345
    s = 55 + k * 10;        // 55% -> 65%
    l = 92 - k * 14;        // 92% -> 78%
  }
  const bg = `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
  return { backgroundColor: bg, color: darkText };
}

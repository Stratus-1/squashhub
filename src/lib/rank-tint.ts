/**
 * Rank-based heat colour for standings rows.
 * Top = dark green, fading through light green, then pink, to red at the bottom.
 * Matches the tournament standings tint (ClubChampsView).
 *
 *   <tr style={rankTint(i, rows.length)} />
 */
export function rankTint(rank: number, total: number): React.CSSProperties {
  if (total <= 1) return { backgroundColor: "hsl(140 55% 40% / 0.85)", color: "hsl(0 0% 100%)" };
  const t = rank / (total - 1); // 0 = top, 1 = bottom
  let h: number, s: number, l: number;
  if (t <= 0.5) {
    // Dark green -> light green
    const k = t / 0.5;
    h = 140;
    s = 50 - k * 15;        // 50% -> 35%
    l = 38 + k * 50;        // 38% -> 88%
  } else {
    // Light pink -> red
    const k = (t - 0.5) / 0.5;
    h = 350 - k * 10;       // 350 -> 340
    s = 70 + k * 10;        // 70% -> 80%
    l = 88 - k * 38;        // 88% -> 50%
  }
  const bg = `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
  const color = l < 55 ? "hsl(0 0% 100%)" : "hsl(220 25% 15%)";
  return { backgroundColor: bg, color };
}

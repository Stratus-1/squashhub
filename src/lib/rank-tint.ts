/**
 * Returns an inline-style background tint that fades from
 * green (top rank) → light pink/rose (bottom rank).
 * Works for both light and dark mode (alpha-blended).
 *
 *   <tr style={rankTint(i, rows.length)} />
 */
export function rankTint(index: number, total: number): React.CSSProperties | undefined {
  if (total <= 1) return undefined;
  const t = index / (total - 1); // 0 = top, 1 = bottom
  // Hue: 142 (green) → 350 (rose)
  const h = 142 + (350 - 142) * t;
  return { backgroundColor: `hsla(${h.toFixed(0)}, 70%, 50%, 0.14)` };
}

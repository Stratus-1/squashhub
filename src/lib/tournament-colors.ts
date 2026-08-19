export interface BucketColor {
  border: string;
  bg: string;
  chipBg: string;
  chipText: string;
}

/**
 * Curated palette used for tournament pool/league indicators. Colours are
 * picked to be clearly distinguishable on both light and dark surfaces, with
 * text contrast that stays readable on the solid chip background.
 */
const PALETTE: BucketColor[] = [
  { border: "hsl(205 90% 55%)",  bg: "hsl(205 90% 55% / 0.10)",  chipBg: "hsl(205 90% 50%)",  chipText: "hsl(0 0% 100%)" },
  { border: "hsl(155 75% 45%)",  bg: "hsl(155 75% 45% / 0.10)",  chipBg: "hsl(155 75% 40%)",  chipText: "hsl(0 0% 100%)" },
  { border: "hsl(38 95% 55%)",   bg: "hsl(38 95% 55% / 0.12)",   chipBg: "hsl(38 95% 55%)",   chipText: "hsl(30 40% 10%)" },
  { border: "hsl(340 85% 60%)",  bg: "hsl(340 85% 60% / 0.10)",  chipBg: "hsl(340 85% 55%)",  chipText: "hsl(0 0% 100%)" },
  { border: "hsl(265 90% 65%)",  bg: "hsl(265 90% 65% / 0.10)",  chipBg: "hsl(265 90% 60%)",  chipText: "hsl(0 0% 100%)" },
  { border: "hsl(175 80% 42%)",  bg: "hsl(175 80% 42% / 0.10)",  chipBg: "hsl(175 80% 38%)",  chipText: "hsl(0 0% 100%)" },
  { border: "hsl(22 95% 55%)",   bg: "hsl(22 95% 55% / 0.10)",   chipBg: "hsl(22 95% 52%)",   chipText: "hsl(0 0% 100%)" },
  { border: "hsl(190 90% 48%)",  bg: "hsl(190 90% 48% / 0.10)",  chipBg: "hsl(190 90% 45%)",  chipText: "hsl(0 0% 100%)" },
  { border: "hsl(82 75% 45%)",   bg: "hsl(82 75% 45% / 0.12)",   chipBg: "hsl(82 75% 45%)",   chipText: "hsl(80 40% 10%)" },
  { border: "hsl(300 85% 60%)",  bg: "hsl(300 85% 60% / 0.10)",  chipBg: "hsl(300 85% 55%)",  chipText: "hsl(0 0% 100%)" },
  { border: "hsl(0 80% 58%)",    bg: "hsl(0 80% 58% / 0.10)",    chipBg: "hsl(0 80% 55%)",    chipText: "hsl(0 0% 100%)" },
  { border: "hsl(220 90% 60%)",  bg: "hsl(220 90% 60% / 0.10)",  chipBg: "hsl(220 90% 55%)",  chipText: "hsl(0 0% 100%)" },
  { border: "hsl(50 90% 52%)",   bg: "hsl(50 90% 52% / 0.12)",   chipBg: "hsl(50 90% 52%)",   chipText: "hsl(45 40% 12%)" },
  { border: "hsl(140 70% 45%)",  bg: "hsl(140 70% 45% / 0.10)",  chipBg: "hsl(140 70% 40%)",  chipText: "hsl(0 0% 100%)" },
  { border: "hsl(250 85% 62%)",  bg: "hsl(250 85% 62% / 0.10)",  chipBg: "hsl(250 85% 58%)",  chipText: "hsl(0 0% 100%)" },
  { border: "hsl(15 90% 55%)",   bg: "hsl(15 90% 55% / 0.10)",   chipBg: "hsl(15 90% 52%)",   chipText: "hsl(0 0% 100%)" },
];

/** Deterministic colour from a bucket key so colours do not shift when filters change. */
export function getBucketColor(key: string | null | undefined): BucketColor | null {
  if (!key) return null;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

/**
 * Provisional (TBD) play-off games for weekend scheduling. Pure, no IO.
 *
 * Reads the play-off choices the organiser already made (Playoffs step `playoff` / `playoffOverrides`, and the
 * Club Champs `stages` timeline with its per-stage `pairing`) and returns the play-off games each unit will need, so
 * "Assign courts & times" can reserve their court/time slots in the same run as the qualifying games.
 * Labels only describe who will play (e.g. "Pool A #1 v Pool B #2", "Winner SF1 v Winner SF2"). Nothing here decides
 * qualification, pairing outcomes or progression — the play-off engine still does that when the stage starts.
 */
import { crossoverPairs, seededPairs } from "@/lib/smart-builder/playoff-chain";

export type ProvisionalGame = { key: string; unitKey: string; phase: number; stage: string; label: string };
type Pairing = "crossover" | "same_position" | "seeded" | "winners" | "later";

const ABBR: Record<string, string> = { Quarterfinal: "QF", Semifinal: "SF", Final: "Final" };
const ORDER = ["Quarterfinal", "Semifinal", "Final"];
const P = (i: number) => String.fromCharCode(65 + i);

function playoffFor(plan: any, key: string) {
  const o = plan?.playoffOverrides ?? {};
  return o[key] ?? o[key.split("::")[0]] ?? plan?.playoff ?? null;
}

/** First-stage labels for g games from the configured pairing. */
function firstLabels(g: number, pairing: Pairing, pools: number): string[] {
  if (pairing === "crossover" && pools >= 2) return crossoverPairs(g).map(([[pa, a], [pb, b]]) => `Pool ${P(pa)} #${a} v Pool ${P(pb)} #${b}`);
  if (pairing === "same_position" && pools >= 2) return Array.from({ length: g }, (_, i) => `Pool A #${i + 1} v Pool B #${i + 1}`);
  if (pairing === "seeded" || ((pairing === "crossover" || pairing === "same_position") && pools < 2)) return seededPairs(2 * g).map(([a, b]) => pools >= 2 ? `Seed ${a} v Seed ${b}` : `#${a} v #${b}`);
  return Array.from({ length: g }, (_, i) => `Qualifier ${2 * i + 1} v Qualifier ${2 * i + 2}`);
}

/**
 * Play-off games needed for one unit (category or "Cat::Sub").
 * `pools` = number of qualifying pools in that unit (1 when it is one group).
 */
export function provisionalPlayoffs(plan: any, unitKey: string, pools: number): ProvisionalGame[] {
  // 1) Club Champs timeline stages for this unit (most specific: their own per-stage pairing).
  const timeline = ((plan?.stages ?? []) as any[]).filter((s) => (s?.phase === "playoff" || ORDER.includes(s?.name)) && ORDER.includes(s?.name) && (!s.unit || s.unit === unitKey || s.unit === unitKey.split("::")[0]));
  let names: string[] = [];
  let pairings: Pairing[] = [];
  if (timeline.length) {
    const sorted = [...timeline].sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
    names = sorted.map((s) => s.name);
    pairings = sorted.map((s, i) => (s.pairing ?? (i === 0 ? "later" : "winners")) as Pairing);
  } else {
    const pp = playoffFor(plan, unitKey);
    if (!pp || pp.choice !== "playoffs") return [];
    if (pp.style === "placement") {
      const n = Math.max(1, Number(plan?.playoffPoolQualifiers?.[unitKey]?.perPool ?? plan?.playoffPoolQualifiers?.[unitKey.split("::")[0]]?.perPool) || 2);
      return Array.from({ length: n }, (_, i) => ({
        key: `${unitKey}|place|${i + 1}`, unitKey, phase: 1, stage: "Placement",
        label: pools >= 2 ? `Pool A #${i + 1} v Pool B #${i + 1} (${2 * i + 1}/${2 * i + 2} place)` : `#${2 * i + 1} v #${2 * i + 2} (${2 * i + 1}/${2 * i + 2} place)`,
      }));
    }
    const r = Math.min(3, Math.max(1, Number(pp.rounds) || 1));
    names = ORDER.slice(3 - r);
    const first: Pairing = pp.pairing === "cross_pools" ? "crossover" : pp.pairing === "seeded" ? "seeded" : "later";
    pairings = names.map((_, i) => (i === 0 ? first : "winners"));
  }
  const out: ProvisionalGame[] = [];
  let prev: string[] = [];
  names.forEach((name, i) => {
    const g = 2 ** (names.length - 1 - i);
    const ab = ABBR[name] ?? name;
    const labels = i > 0 && pairings[i] === "winners"
      ? Array.from({ length: g }, (_, k) => `Winner ${prev[2 * k] ?? "?"} v Winner ${prev[2 * k + 1] ?? "?"}`)
      : firstLabels(g, pairings[i], pools);
    const ids = labels.map((_, k) => (g === 1 ? ab : `${ab}${k + 1}`));
    labels.forEach((label, k) => out.push({ key: `${unitKey}|${ab}|${k + 1}`, unitKey, phase: i + 1, stage: name, label: `${ids[k]}: ${label}` }));
    prev = ids;
  });
  return out;
}

/**
 * Planned play-off bracket shown upfront below the round robin (display only, no writes).
 * Labels come from `provisionalPlayoffs` (e.g. "SF1: Pool A #1 v Pool B #2", "Final: Winner SF1 v Winner SF2").
 * Once the qualifying stage is complete, pool positions are replaced by the players' names; positions are
 * never resolved earlier and tied places are left as positions (the engine blocks on real ties).
 */
import { provisionalPlayoffs } from "./provisional-playoffs";

export type PlannedSide = { label: string; name: string | null; pool: string | null; rank: number | null };
export type PlannedPlayoffRow = { key: string; stage: string; id: string; text: string; when: string | null; sides: [PlannedSide, PlannedSide] };

const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

const ORDER = ["Quarterfinal", "Semifinal", "Final"];

function whenOf(s: any): string | null {
  if (!s) return null;
  if (s.mode === "scheduled" && s.date) return `${s.date}${s.from ? ` ${s.from}${s.to ? `–${s.to}` : ""}` : ""}`;
  if (s.deadline) return `play by ${s.deadline}`;
  return null;
}

/**
 * @param standings pool index (0 = Pool A) → member names in finishing order; pass only when the qualifying stage is complete.
 */
export function plannedPlayoffBracket(plan: any, unitKey: string, pools: number, standings: string[][] | null): PlannedPlayoffRow[] {
  const games = provisionalPlayoffs(plan, unitKey, Math.max(1, pools));
  const timeline = ((plan?.stages ?? []) as any[]).filter((s) => s?.phase === "playoff" && (!s.unit || s.unit === unitKey || s.unit === unitKey.split("::")[0]));
  if (!timeline.length) return [];
  const name = (pool: string, pos: number) => standings?.[pool.charCodeAt(0) - 65]?.[pos - 1] ?? null;
  return games
    .filter((g) => ORDER.includes(g.stage))
    .sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage))
    .map((g) => {
      const [id, ...rest] = g.label.split(": ");
      let text = rest.join(": ");
      text = text.replace(/Pool ([A-Z]) #(\d+)/g, (m, p, n) => {
        const nm = name(p, Number(n));
        return nm ? `${nm} (${p}${n})` : `${p}${n}`;
      });
      text = text.replace(/^#(\d+) v #(\d+)$/, (m, a, b) => `${name("A", Number(a)) ?? `#${a}`} v ${name("A", Number(b)) ?? `#${b}`}`);
      const sides = rest.join(": ").split(" v ").map((raw): PlannedSide => {
        const m = raw.match(/^Pool ([A-Z]) #(\d+)$/) ?? raw.match(/^#(\d+)$/)?.slice(0, 0).concat(["", "A", raw.slice(1)]) ?? null;
        if (m) { const pool = m[1], rank = Number(m[2]); return { label: `Pool ${pool} – ${ord(rank)}`, name: name(pool, rank), pool, rank }; }
        return { label: raw, name: null, pool: null, rank: null };
      });
      return { sides: [sides[0], sides[1] ?? { label: "Bye", name: null, pool: null, rank: null }] as [PlannedSide, PlannedSide], key: g.key, stage: g.stage, id, text, when: whenOf(timeline.find((s) => s.name === g.stage)) };
    });
}

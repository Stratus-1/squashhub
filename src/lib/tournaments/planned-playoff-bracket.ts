/**
 * Planned play-off bracket shown upfront below the round robin (display only, no writes).
 * Labels come from `provisionalPlayoffs` (e.g. "SF1: Pool A #1 v Pool B #2", "Final: Winner SF1 v Winner SF2").
 * Once the qualifying stage is complete, pool positions are replaced by the players' names; positions are
 * never resolved earlier and tied places are left as positions (the engine blocks on real ties).
 */
import { provisionalPlayoffs } from "./provisional-playoffs";

export type PlannedSide = { label: string; name: string | null; pool: string | null; rank: number | null };
export type PlannedPlayoffRow = { key: string; stage: string; id: string; text: string; when: string | null; sides: [PlannedSide, PlannedSide]; winner?: string | null };

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
  const timeline = ((plan?.stages ?? []) as any[]).filter((s) => s?.phase === "playoff" && (!s.unit || s.unit === unitKey || s.unit === unitKey.split("::")[0]));
  if (!timeline.length) return [];
  const choice = plan?.playoffOverrides?.[unitKey] ?? plan?.playoffOverrides?.[unitKey.split("::")[0]] ?? plan?.playoff;
  // Placement play is a saved positional choice, not a seeded championship.
  // Project it only here: do not change scheduling or fixture generation.
  // A Quarterfinal/Semifinal saved in Stages & scheduling is the later, more specific choice (and is what the
  // real fixtures are generated from), so an older "placement" style must not override it.
  const knockoutTimeline = timeline.some((s) => s?.name === "Quarterfinal" || s?.name === "Semifinal");
  const placement = choice?.style === "placement" && pools === 2 && !knockoutTimeline;
  const games = placement
    ? provisionalPlayoffs({ ...plan, stages: [] }, unitKey, pools).map((g, i) => ({
      ...g, stage: "Placement", label: `${i === 0 ? "Final" : `Places ${2 * i + 1}/${2 * i + 2}`}: ${g.label.replace(/ \(\d+\/\d+ place\)$/, "")}`,
    }))
    : provisionalPlayoffs(plan, unitKey, Math.max(1, pools));
  const name = (pool: string, pos: number) => standings?.[pool.charCodeAt(0) - 65]?.[pos - 1] ?? null;
  return games
    .filter((g) => placement || ORDER.includes(g.stage))
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
        const pm = raw.match(/^Pool ([A-Z]) #(\d+)$/);
        if (pm) { const rank = Number(pm[2]); return { label: `Pool ${pm[1]} – ${ord(rank)}`, name: name(pm[1], rank), pool: pm[1], rank }; }
        const sm = raw.match(/^#(\d+)$/);
        if (sm) { const rank = Number(sm[1]); return { label: ord(rank), name: name("A", rank), pool: null, rank }; }
        return { label: raw, name: null, pool: null, rank: null };
      });
      return { sides: [sides[0], sides[1] ?? { label: "Bye", name: null, pool: null, rank: null }] as [PlannedSide, PlannedSide], key: g.key, stage: g.stage, id, text, when: whenOf(timeline.find((s) => s.name === (placement ? "Final" : g.stage))) };
    });
}


/**
 * Display only: fill "Winner QF1" style sides with the decided winner of the saved real play-off game,
 * and show saved real players/dates. Saved games are matched by stage and bracket order; nothing is written.
 */
export function overlayRealPlayoffWinners(rows: PlannedPlayoffRow[], real: any[]): PlannedPlayoffRow[] {
  if (!real?.length) return rows;
  const nameOf = (m: any, id: string | null) => !id ? null : id === m.player_a_member_id ? m.player_a?.name ?? null : id === m.player_b_member_id ? m.player_b?.name ?? null : null;
  const byStage = (stage: string) => real.filter((m) => String(m.stage_label ?? "").toLowerCase().startsWith(stage.toLowerCase())
    || m.stage === ({ Quarterfinal: "playoff_qf", Semifinal: "playoff_sf", Final: "playoff_final" } as Record<string, string>)[stage])
    .sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0) || String(a.stage_label).localeCompare(String(b.stage_label)));
  const winners: Record<string, string> = {};
  const out = rows.map((r) => {
    const list = byStage(r.stage);
    const idx = rows.filter((x) => x.stage === r.stage).indexOf(r);
    const m = list[idx];
    if (!m) return r;
    const w = nameOf(m, m.winner_member_id ?? null);
    if (w && m.status === "completed") winners[r.id] = w;
    const a = nameOf(m, m.player_a_member_id ?? null), b = nameOf(m, m.player_b_member_id ?? null);
    const when = m.scheduled_date ? `${m.scheduled_date}${m.scheduled_time ? ` ${String(m.scheduled_time).slice(0, 5)}` : ""}` : m.play_by ? `play by ${m.play_by}` : r.when;
    return { ...r, when, winner: m.status === "completed" ? w : null, sides: [{ ...r.sides[0], name: a ?? r.sides[0].name }, { ...r.sides[1], name: b ?? r.sides[1].name }] as [PlannedSide, PlannedSide] };
  });
  return out.map((r) => ({ ...r, sides: r.sides.map((s) => { const k = s.label.match(/^Winner (\w+)$/)?.[1]; return k && winners[k] && !s.name ? { ...s, name: winners[k] } : s; }) as [PlannedSide, PlannedSide] }));
}

/**
 * Court-grid display of NEXT-ROUND Swiss pairings that are already decided by results.
 *
 * Read-only: uses the same projection as the tournament Progression page
 * (buildProposedSwissGrid + the tournament-wide proposed slot plan) and returns
 * a pairing only when BOTH players are known and the round has a proposed
 * date/time/court. Nothing is written: no fixtures, no bookings. Rounds that
 * already have saved fixtures are skipped (the saved fixture is shown instead).
 */
import { stageSchedules } from "@/lib/tournaments/round-scheduling";
import { scheduleDraws, slotOnlyDraw, timeSlots, fixtureKey, type FixtureSchedule } from "@/lib/tournaments/swiss-positional-draw";
import { appliedRoundPlayBy } from "@/lib/tournaments/stage-schedule";
import { divisionGroup } from "@/lib/tournaments/engine-service";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";

export interface ProjectedCourtFixture {
  key: string; champId: string; group: number; round: number;
  date: string; time: string; courtId: number; minutes: number;
  title: string; context: string;
  /** Member ids of the two decided players (a = lower position). */
  aId: string; bId: string;
}

export interface ProjectionInput {
  champ: any; arch: any; entries: any[]; matches: any[]; rounds: any[];
  courts: Array<{ id: number | string; name?: string | null }>;
  groupLabel?: (gn: number) => string;
  noRepeats?: boolean;
}

function swissStage(champ: any, arch: any, gn: number): { rounds: number | null; tieBreaks?: string[]; schedule?: any } | null {
  if (arch?.builder_architecture === "structured") {
    const spec = arch?.builder_spec;
    const d = (spec?.divisions ?? []).find((x: any) => divisionGroup(spec, x) === gn);
    const st = [...(d?.stages ?? [])].sort((x: any, y: any) => x.order - y.order)[0];
    if (st?.kind !== "swiss") return null;
    const timeline = stageSchedules(arch?.beta_lifecycle?.format_plan ?? null);
    if (!timeline.length) return { tieBreaks: st.tieBreaks, rounds: st.swissRounds ?? null, schedule: st.schedule ?? null };
    const roundDates = timeline.map((t: any) => t.deadline ?? t.windows[t.windows.length - 1]?.date ?? null);
    return { tieBreaks: st.tieBreaks, rounds: timeline.length, schedule: { ...(st.schedule ?? {}), roundDates } };
  }
  const r = Number((champ?.swiss_rounds as Record<string, number> | null)?.[String(gn)]);
  return Number.isFinite(r) && r > 0 ? { rounds: r } : null;
}

export function projectCourtFixtures(i: ProjectionInput): ProjectedCourtFixture[] {
  const { champ, arch, entries, matches, rounds, courts } = i;
  const noRepeats = i.noRepeats !== false;
  if (!champ?.id) return [];
  const types = (champ?.league_match_types as Record<string, string>) || {};
  const doubles = (gn: number) => String(types[String(gn)] || "").toLowerCase() === "doubles" || entries.some((e) => e.group_number === gn && !!e.partner_member_id);
  const groups = [...new Set(entries.map((e) => Number(e.group_number)))].filter((gn) => Number.isFinite(gn) && !doubles(gn) && swissStage(champ, arch, gn)?.rounds);
  if (!groups.length) return [];
  const a: any = { ...(champ ?? {}), ...(arch ?? {}) };
  const draws = groups.map((gn) => slotOnlyDraw(String(gn), entries.filter((e) => e.group_number === gn).length, swissStage(champ, arch, gn)!.rounds!)).filter((d) => !d.issues.length);
  const allowed = (a.court_ids ?? []).map(Number);
  const courtList = courts.filter((c) => !allowed.length || allowed.includes(Number(c.id))).map((c) => ({ id: c.id, name: c.name ?? `Court ${c.id}` }));
  // Decided Swiss games already created for rounds 2+ keep their projected slot, so they never block it.
  const busy = matches.filter((m) => !(groups.includes(Number(m.group_number)) && Number(m.round_number) > 1)).filter((m) => m.scheduled_date && m.scheduled_time && m.court_id).map((m) => ({ date: m.scheduled_date, time: String(m.scheduled_time).slice(0, 5), courtId: m.court_id }));
  const plan = a.beta_lifecycle?.format_plan ?? null;
  const planStages = stageSchedules(plan);
  const roundWindows: Record<number, any[]> = {};
  planStages.forEach((st: any, idx: number) => { if (idx > 0 && st.mode === "scheduled" && st.windows.length) roundWindows[idx + 1] = st.windows; });
  const planCourtIds = [...new Set(planStages.flatMap((st: any) => st.windows.flatMap((w: any) => w.courtIds)))];
  const courtsAll = planCourtIds.length ? courts.filter((c) => planCourtIds.includes(Number(c.id))).map((c) => ({ id: c.id, name: c.name ?? `Court ${c.id}` })) : courtList;
  const dur = Number(plan?.scheduling?.singles) || Number(a.match_duration_minutes) || 30;
  let slots: Record<string, FixtureSchedule> = {};
  try {
    slots = scheduleDraws(draws, {
      roundWindows,
      roundDates: Object.fromEntries(draws.map((d) => [d.categoryKey, (swissStage(champ, arch, Number(d.categoryKey))?.schedule?.roundDates ?? []).map((x: any, k: number) => (k === 0 ? null : x))])),
      courts: courtsAll, times: timeSlots(a.start_time, a.end_time, dur, Number(a.default_break_minutes) || 0), matchMinutes: dur,
      restMinutes: Number(plan?.scheduling?.rest ?? a.default_break_minutes) || 0, busy,
    } as any);
  } catch { return []; }
  const appliedPlayBy: Record<number, string> = {};
  for (const r of rounds ?? []) { const pb = appliedRoundPlayBy(r); if (pb && !appliedPlayBy[Number(r.round_number)]) appliedPlayBy[Number(r.round_number)] = pb; }

  const out: ProjectedCourtFixture[] = [];
  for (const gn of groups) {
    const st = swissStage(champ, arch, gn)!;
    const gEntries = entries.filter((e) => e.group_number === gn).sort((x, y) => (x.order_index ?? 0) - (y.order_index ?? 0));
    const names: Record<string, string> = {};
    gEntries.forEach((e) => { if (e.club_member_id) names[e.club_member_id] = e.club_members?.name ?? e.name ?? "Player"; });
    const gm = matches.filter((m) => m.group_number === gn && (m.round_number ?? 0) > 0);
    gm.forEach((m) => { if (m.player_a_member_id && m.player_a?.name) names[m.player_a_member_id] ??= m.player_a.name; if (m.player_b_member_id && m.player_b?.name) names[m.player_b_member_id] ??= m.player_b.name; });
    const model = buildSwissProgression({
      seedOrder: gEntries.map((e) => e.club_member_id).filter(Boolean), names, totalRounds: st.rounds, tieBreaks: st.tieBreaks,
      matches: gm.map((m) => ({ id: m.id, round: Number(m.round_number), a: m.player_a_member_id ?? m.bye_member_id ?? null, b: m.is_bye ? null : m.player_b_member_id ?? null,
        winner: m.winner_member_id, isBye: !!m.is_bye, status: m.status, score: m.score, date: m.scheduled_date, time: m.scheduled_time, court: null, playBy: m.play_by,
        placeholderA: m.placeholder_a, placeholderB: m.placeholder_b })),
    });
    const prefix = `${gn}:`;
    const gSlots = Object.fromEntries(Object.entries(slots).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
    let grid;
    try { grid = buildProposedSwissGrid(model, { schedule: st.schedule ?? null, slots: gSlots, appliedPlayBy, noRepeats }); } catch { continue; }
    if (grid.issues.length) continue;
    // Per game: skip a pairing once either player already has a saved game in that round.
    const inRound = (round: number, id: string) => gm.some((m) => Number(m.round_number) === round && (m.player_a_member_id === id || m.player_b_member_id === id));
    for (const rd of grid.rounds) {
      if (rd.created || appliedPlayBy[rd.round]) continue;
      for (const b of rd.blocks) {
        const [x, y] = b.rows;
        if (!x.id || !y.id || x.pos == null || y.pos == null) continue;
        if (inRound(rd.round, x.id) || inRound(rd.round, y.id)) continue;
        const s = gSlots[b.scheduleKey ?? fixtureKey(rd.round, Math.min(x.pos, y.pos), Math.max(x.pos, y.pos))];
        if (s?.kind !== "planned") continue;
        if (noRepeats && matches.some((m) => Number(m.court_id) === Number(s.courtId) && m.scheduled_date === s.date && String(m.scheduled_time).slice(0, 5) === s.time)) continue;
        out.push({
          key: `proj:${champ.id}:${gn}:${rd.round}:${x.pos}v${y.pos}`, champId: champ.id, group: gn, round: rd.round,
          date: s.date, time: s.time, courtId: Number(s.courtId), minutes: dur,
          title: `${x.name} v ${y.name}`, aId: x.id, bId: y.id,
          context: `${i.groupLabel?.(gn) ?? `Group ${gn}`} · Round ${rd.round} · Position ${x.pos} v ${y.pos}`,
        });
      }
    }
  }
  return out;
}

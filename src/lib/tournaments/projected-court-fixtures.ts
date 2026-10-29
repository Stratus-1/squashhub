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
import { RIVERSIDE_CLUB_ID } from "./swiss-riverside-aabb-charts";
import { rrFinishIssues, type RrFinish } from "./swiss-rr-finish";

/** Uitsig Club Champs 2026 Men's C (18 players, 5 rounds, 3 RR groups) follows the owner-approved position chart. */
export function usesUitsigMensCRemainderChart(tournamentId: string | null | undefined, entrants: number, rounds: number | null | undefined, rrGroups: number | null | undefined): boolean {
  return tournamentId === "f954222a-0f0a-4d8c-ac7b-9c74042cc69e" && entrants === 18 && rounds === 5 && rrGroups === 3;
}

export interface ProjectedCourtFixture {
  key: string; champId: string; group: number; round: number;
  date: string; time: string; courtId: number; minutes: number;
  title: string; context: string;
  /** Member ids of the two decided players (a = lower position). */
  aId: string; bId: string;
  /** Certified round-robin finish block created before earlier RR rounds complete. */
  rrFinishBlock?: boolean;
}

export interface ProjectionInput {
  champ: any; arch: any; entries: any[]; matches: any[]; rounds: any[];
  courts: Array<{ id: number | string; name?: string | null }>;
  groupLabel?: (gn: number) => string;
  noRepeats?: boolean;
  /** Club pilot flag (tournament_swiss_partial_rounds): emit certified settled pairings early. */
  partialGeneration?: boolean;
}

export interface DecidedPlayByFixture {
  champId: string; group: number; round: number;
  aId: string; bId: string; title: string; playBy: string;
  /** Certified round-robin finish block created before earlier RR rounds complete. */
  rrFinishBlock?: boolean;
}

function swissStage(champ: any, arch: any, gn: number): { rounds: number | null; tieBreaks?: string[]; schedule?: any; rrFinish?: RrFinish } | null {
  if (arch?.builder_architecture === "structured") {
    const spec = arch?.builder_spec;
    const d = (spec?.divisions ?? []).find((x: any) => divisionGroup(spec, x) === gn);
    const st = [...(d?.stages ?? [])].sort((x: any, y: any) => x.order - y.order)[0];
    if (st?.kind !== "swiss") return null;
    const rrFinish = st.rrFinish?.enabled ? st.rrFinish : undefined;
    const timeline = stageSchedules(arch?.beta_lifecycle?.format_plan ?? null);
    if (!timeline.length) return { tieBreaks: st.tieBreaks, rounds: st.swissRounds ?? null, schedule: st.schedule ?? null, rrFinish };
    const roundDates = timeline.map((t: any) => t.deadline ?? t.windows[t.windows.length - 1]?.date ?? null);
    return { tieBreaks: st.tieBreaks, rounds: champ.club_id === RIVERSIDE_CLUB_ID || rrFinish ? st.swissRounds ?? null : timeline.length, schedule: { ...(st.schedule ?? {}), roundDates }, rrFinish };
  }
  const r = Number((champ?.swiss_rounds as Record<string, number> | null)?.[String(gn)]);
  return Number.isFinite(r) && r > 0 ? { rounds: r } : null;
}

function projectSwissFixtures(i: ProjectionInput, playByOnly: boolean): Array<ProjectedCourtFixture | DecidedPlayByFixture> {
  const { champ, arch, entries, matches, rounds, courts } = i;
  const noRepeats = i.noRepeats !== false;
  if (!champ?.id) return [];
  const types = (champ?.league_match_types as Record<string, string>) || {};
  const doubles = (gn: number) => String(types[String(gn)] || "").toLowerCase() === "doubles" || entries.some((e) => e.group_number === gn && !!e.partner_member_id);
  const groups = [...new Set(entries.map((e) => Number(e.group_number)))].filter((gn) => Number.isFinite(gn) && !doubles(gn) && swissStage(champ, arch, gn)?.rounds);
  if (!groups.length) return [];
  const a: any = { ...(champ ?? {}), ...(arch ?? {}) };
  const draws = groups.flatMap((gn) => {
    const count = swissStage(champ, arch, gn)?.rounds;
    return count ? [slotOnlyDraw(String(gn), entries.filter((e) => e.group_number === gn).length, count)] : [];
  }).filter((d) => !d.issues.length);
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
  try { if (!playByOnly) {
    slots = scheduleDraws(draws, {
      roundWindows,
      roundDates: Object.fromEntries(draws.map((d) => [d.categoryKey, (swissStage(champ, arch, Number(d.categoryKey))?.schedule?.roundDates ?? []).map((x: any, k: number) => (k === 0 ? null : x))])),
      courts: courtsAll, times: timeSlots(a.start_time, a.end_time, dur, Number(a.default_break_minutes) || 0), matchMinutes: dur,
      restMinutes: Number(plan?.scheduling?.rest ?? a.default_break_minutes) || 0, busy,
    } as any);
  } } catch { return []; }

  const out: Array<ProjectedCourtFixture | DecidedPlayByFixture> = [];
  for (const gn of groups) {
    const st = swissStage(champ, arch, gn);
    if (!st) continue;
    const appliedPlayBy: Record<number, string> = {};
    const savedRounds = new Set<number>();
    for (const r of rounds ?? []) {
      if (Number(r.group_number) !== gn) continue;
      savedRounds.add(Number(r.round_number));
      const pb = appliedRoundPlayBy(r);
      if (pb) appliedPlayBy[Number(r.round_number)] = pb;
    }
    // Play-by stage with no saved row for a round yet: the stage deadline applies — never invent court times.
    const sch: any = st.schedule;
    if (sch?.rule === "play_by") for (let n = 2; n <= (st.rounds ?? 0); n++) {
      if (savedRounds.has(n) || appliedPlayBy[n]) continue;
      const d = (sch.roundDates ?? [])[n - 1] ?? sch.deadline;
      if (d) appliedPlayBy[n] = String(d).slice(0, 10);
    }
    const gEntries = entries.filter((e) => e.group_number === gn).sort((x, y) => (x.order_index ?? 0) - (y.order_index ?? 0));
    if (st.rrFinish?.enabled && rrFinishIssues(gEntries.length, st.rounds, st.rrFinish.groups).length) continue;
    const names: Record<string, string> = {};
    gEntries.forEach((e) => { if (e.club_member_id) names[e.club_member_id] = e.club_members?.name ?? e.name ?? "Player"; });
    const gm = matches.filter((m) => m.group_number === gn && (m.round_number ?? 0) > 0);
    gm.forEach((m) => { if (m.player_a_member_id && m.player_a?.name) names[m.player_a_member_id] ??= m.player_a.name; if (m.player_b_member_id && m.player_b?.name) names[m.player_b_member_id] ??= m.player_b.name; });
    const model = buildSwissProgression({
      seedOrder: gEntries.map((e) => e.club_member_id).filter(Boolean), names, totalRounds: st.rounds, tieBreaks: st.tieBreaks, rrFinish: st.rrFinish,
      ...(arch?.builder_spec?.swissSequencing ? { swissSequencing: arch.builder_spec.swissSequencing, tournamentId: champ.id } : {}),
      matches: gm.map((m) => ({ id: m.id, round: Number(m.round_number), a: m.player_a_member_id ?? m.bye_member_id ?? null, b: m.is_bye ? null : m.player_b_member_id ?? null,
        winner: m.winner_member_id, isBye: !!m.is_bye, status: m.status, score: m.score, date: m.scheduled_date, time: m.scheduled_time, court: null, playBy: m.play_by,
        placeholderA: m.placeholder_a, placeholderB: m.placeholder_b })),
    });
    const prefix = `${gn}:`;
    model.rrFinish = st.rrFinish;
    const gSlots = Object.fromEntries(Object.entries(slots).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
    let grid;
    // Same owner-approved Uitsig Men's C position chart the Progression page uses (incl. its approved
    // intentional repeats), so the writer never stalls on a "repeat" the owner already accepted.
    const mensCRemainderChart = usesUitsigMensCRemainderChart(champ.id, gEntries.length, st.rounds, st.rrFinish?.groups);
    try { grid = buildProposedSwissGrid(model, { schedule: st.schedule ?? null, slots: gSlots, appliedPlayBy, noRepeats, ...(mensCRemainderChart ? { mensCRemainderChart: true } : {}), ...(i.partialGeneration ? { partialGeneration: true } : {}) }); } catch { continue; }
    if (grid.issues.length) continue;
    // Per game: skip a pairing once either player already has a saved game in that round.
    const inRound = (round: number, id: string) => gm.some((m) => Number(m.round_number) === round && (m.player_a_member_id === id || m.player_b_member_id === id));
    for (const rd of grid.rounds) {
      if (rd.round < 2) continue;
      const prevComplete = !!model.rounds.find((r) => r.round === rd.round - 1)?.complete;
      const deadline = appliedPlayBy[rd.round];
      if (playByOnly ? !deadline : !!deadline) continue;
      for (const b of rd.blocks) {
        const [x, y] = b.rows;
        if (!x.id || !y.id || x.pos == null || y.pos == null) continue;
        // Round-robin finish stages normally wait for the previous round; only engine-certified
        // blocks (group positions proven final) may be created while it is still open.
        if (st.rrFinish?.enabled && !prevComplete && !b.certified) continue;
        if (inRound(rd.round, x.id) || inRound(rd.round, y.id)) continue;
        const early = b.certified === true && !prevComplete ? { rrFinishBlock: true as const } : {};
        if (playByOnly) {
          out.push({ champId: champ.id, group: gn, round: rd.round, aId: x.id, bId: y.id, title: `${x.name} v ${y.name}`, playBy: deadline, ...early });
          continue;
        }
        const s = gSlots[b.scheduleKey ?? fixtureKey(rd.round, Math.min(x.pos, y.pos), Math.max(x.pos, y.pos))];
        if (s?.kind !== "planned") continue;
        if (matches.some((m) => Number(m.court_id) === Number(s.courtId) && m.scheduled_date === s.date && String(m.scheduled_time).slice(0, 5) === s.time)) continue;
        out.push({
          key: `proj:${champ.id}:${gn}:${rd.round}:${x.pos}v${y.pos}`, champId: champ.id, group: gn, round: rd.round,
          date: s.date, time: s.time, courtId: Number(s.courtId), minutes: dur,
          title: `${x.name} v ${y.name}`, aId: x.id, bId: y.id,
          context: `${i.groupLabel?.(gn) ?? `Group ${gn}`} · Round ${rd.round} · Position ${x.pos} v ${y.pos}`,
          ...early,
        });
      }
    }
  }
  return out;
}

/** Court occupancy projections never include unbooked play-by games. */
export function projectCourtFixtures(i: ProjectionInput): ProjectedCourtFixture[] {
  return projectSwissFixtures(i, false).filter((f): f is ProjectedCourtFixture => "courtId" in f);
}

/** Confirmed players in applied play-by rounds need a fixture, not an automatic booking. */
export function projectDecidedPlayByFixtures(i: ProjectionInput): DecidedPlayByFixture[] {
  return projectSwissFixtures(i, true).filter((f): f is DecidedPlayByFixture => "playBy" in f);
}

/** Recover only a still-unstarted scheduled Swiss fixture whose failed initial booking
 * left no allocation. Re-project with that ONE row excluded, then require identical
 * participants. Never reschedule a player-owned, started, scored or allocated game. */
export function projectSwissBookingRetries(i: ProjectionInput): Array<ProjectedCourtFixture & { matchId: string }> {
  return i.matches.flatMap((m) => {
    if (m.status !== "scheduled" || m.booking_id || m.court_id || m.scheduled_date || m.scheduled_time
      || m.winner_member_id || m.score || m.game_scores || Number(m.side_a_points) > 0 || Number(m.side_b_points) > 0
      || m.is_bye || !m.player_a_member_id || !m.player_b_member_id || Number(m.round_number) < 2) return [];
    const group = Number(m.group_number), round = Number(m.round_number);
    const previous = i.matches.filter((f) => Number(f.group_number) === group && Number(f.round_number) === round - 1);
    if (!previous.length || previous.some((f) => f.status !== "completed" || (!f.is_bye && !f.winner_member_id))) return [];
    const match = projectCourtFixtures({ ...i, matches: i.matches.filter((f) => f.id !== m.id) }).find((f) =>
      f.group === group && f.round === round && [f.aId, f.bId].sort().join("|") === [m.player_a_member_id, m.player_b_member_id].sort().join("|"));
    return match ? [{ ...match, matchId: m.id }] : [];
  });
}

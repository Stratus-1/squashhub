/**
 * Target-stage schedule resolution for ONE fixture.
 *
 * Every surface (round header, fixture badge, booking banner, mobile card, booking CTA) must read a
 * fixture's schedule from the stage the fixture BELONGS to — never from the pool / first round /
 * tournament start. Round rows are matched by the fixture's own `round_id`, then by its `stage_key`;
 * a row from another stage (e.g. pool "Round 1", play by 6 Oct) is never borrowed.
 */

export type StageRule = "fixed" | "play_by" | null;

export interface StageScheduleInfo {
  stageId: string;
  name: string;
  order: number;
  rule: StageRule;
  date: string | null;
  deadline: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  courtIds: number[];
}

/** stage_key → planned schedule, from a structured tournament spec. */
export function stageScheduleIndex(spec: any): Map<string, StageScheduleInfo> {
  const out = new Map<string, StageScheduleInfo>();
  for (const d of spec?.divisions ?? []) {
    for (const s of d?.stages ?? []) {
      if (!s?.id || out.has(s.id)) continue;
      const sch = s.schedule ?? {};
      out.set(s.id, {
        stageId: s.id,
        name: String(s.name ?? ""),
        order: Number(s.order ?? 0),
        rule: sch.rule === "fixed" || sch.rule === "play_by" ? sch.rule : null,
        date: sch.date ? String(sch.date).slice(0, 10) : null,
        deadline: sch.deadline ? String(sch.deadline).slice(0, 10) : null,
        timeFrom: sch.timeFrom ?? null,
        timeTo: sch.timeTo ?? null,
        courtIds: Array.isArray(sch.courtIds) ? sch.courtIds : [],
      });
    }
  }
  return out;
}

export interface RoundRowLike {
  id?: string | null;
  round_number?: number | null;
  group_number?: number | null;
  section_number?: number | null;
  stage_key?: string | null;
  label?: string | null;
  play_by?: string | null;
}

export interface FixtureLikeForSchedule {
  round_id?: string | null;
  round_number?: number | null;
  group_number?: number | null;
  section_number?: number | null;
  stage_key?: string | null;
  play_by?: string | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  court_id?: number | string | null;
  booking_id?: string | null;
}

/** The round row that belongs to THIS fixture — own round_id, else same stage + round + draw. Never another stage. */
export function fixtureRoundRow<R extends RoundRowLike>(m: FixtureLikeForSchedule, rows: R[]): R | undefined {
  if (m.round_id) {
    const own = rows.find((r) => r.id && r.id === m.round_id);
    if (own) return own;
  }
  const sameRound = rows.filter((r) => Number(r.round_number) === Number(m.round_number));
  // Rows that carry a stage must match the fixture's stage; a staged fixture never reads an unstaged row.
  const sameStage = sameRound.filter((r) =>
    m.stage_key ? r.stage_key === m.stage_key : !r.stage_key,
  );
  return (
    sameStage.find((r) => Number(r.group_number) === Number(m.group_number) && Number(r.section_number) === Number(m.section_number)) ||
    sameStage.find((r) => Number(r.group_number) === Number(m.group_number)) ||
    undefined
  );
}

export type FixtureSchedule =
  | { mode: "scheduled"; date: string | null; time: string | null; window: { from: string | null; to: string | null } | null; allocated: boolean; playBy: null; bookable: false }
  | { mode: "play_by"; playBy: string; bookable: true }
  | { mode: "none"; playBy: null; bookable: true };

/**
 * Resolve ONE fixture's schedule from its target stage.
 *  1. The fixture's own play_by wins (what the organiser set when it was drawn).
 *  2. A structured stage configured "Play on scheduled date/time" is centrally scheduled: show its
 *     date/time/court, no Play by / Book by and no booking prompt for players.
 *  3. A structured play-off stage configured "Play by a date" uses THAT stage's deadline.
 *  4. Otherwise the fixture's own round row (round_id / same stage), then `fallback()` — legacy
 *     tournaments without a structured spec only.
 */
export function resolveFixtureSchedule(
  m: FixtureLikeForSchedule,
  opts: { stage?: StageScheduleInfo | null; rows?: RoundRowLike[]; fallback?: () => string | null | undefined; organiserScheduled?: boolean } = {},
): FixtureSchedule {
  const own = m.play_by ? String(m.play_by).slice(0, 10) : "";
  if (own) return { mode: "play_by", playBy: own, bookable: true };
  const st = opts.stage ?? null;
  const allocated = !!(m.court_id || m.booking_id);
  // A player booking also writes scheduled_date/time. Only the stage's fixed rule
  // (or an explicitly identified legacy organiser slot) makes it central.
  if (st?.rule === "fixed" || opts.organiserScheduled) {
    return {
      mode: "scheduled",
      date: (m.scheduled_date ? String(m.scheduled_date).slice(0, 10) : null) ?? st?.date ?? null,
      time: m.scheduled_time ? String(m.scheduled_time).slice(0, 5) : null,
      window: st?.timeFrom || st?.timeTo ? { from: st?.timeFrom ?? null, to: st?.timeTo ?? null } : null,
      allocated,
      playBy: null,
      bookable: false,
    };
  }
  if (st && st.order > 0 && st.rule === "play_by") {
    return st.deadline ? { mode: "play_by", playBy: st.deadline, bookable: true } : { mode: "none", playBy: null, bookable: true };
  }
  const row = opts.rows ? fixtureRoundRow(m, opts.rows) : undefined;
  if (row?.play_by) return { mode: "play_by", playBy: String(row.play_by).slice(0, 10), bookable: true };
  // A structured stage owns its schedule — never fall back to another stage's plan.
  if (m.stage_key && st) return { mode: "none", playBy: null, bookable: true };
  const fb = opts.fallback?.();
  return fb ? { mode: "play_by", playBy: String(fb).slice(0, 10), bookable: true } : { mode: "none", playBy: null, bookable: true };
}

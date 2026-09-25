/**
 * Sessions — the real date / court / time blocks, separate from stages.
 *
 *   Session (date + courts + start time) → one or more stages played back to back
 *
 * A stage joins the session of an earlier stage only through an explicit `sameSessionAs`
 * link (e.g. Diamond League: singles then doubles on the same evening, same court).
 * Without that link, later stages follow earlier ones on later dates as before.
 * Sequential durations inside a session are added up and checked against the evening.
 */
import { allStages, effectiveSchedule, type Stage, type TournamentDefinition } from "./definition";
import { d10 } from "@/lib/tournaments/date-window";
import { scoringMinutes, stageScoringLine } from "./scoring";
import { stageCourts } from "./court-allocation";

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export interface SessionPart { stageId: string; name: string; discipline: Stage["discipline"]; minutesPerCourt: number | null; start: string | null; end: string | null; detail: string }
export interface PlannedSession {
  date: string; label: string; divisionIds: string[];
  start: string | null; end: string | null; minutes: number | null;
  parts: SessionPart[];
  /** Available evening length, when known. */
  limitMinutes: number | null;
  state: "feasible" | "infeasible" | "incomplete";
}
export interface SessionIssue { code: "session_dates" | "session_overrun" | "session_link"; divisionId: string; stageId: string; message: string }

/** First stage of the session this stage belongs to (follows sameSessionAs links). */
export function sessionLeader(def: TournamentDefinition, st: Stage): Stage {
  const byId = new Map(allStages(def).map((r) => [r.stage.id, r.stage]));
  let cur = st; const seen = new Set<string>();
  while (cur.sameSessionAs && byId.has(cur.sameSessionAs) && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.sameSessionAs)!; }
  return cur;
}

/** Stages in one session, in play order (leader first). */
export function sessionMembers(def: TournamentDefinition, leader: Stage): Stage[] {
  const list = allStages(def).map((r) => r.stage);
  const out = [leader];
  for (let next = list.find((s) => s.sameSessionAs === leader.id); next && !out.includes(next); next = list.find((s) => s.sameSessionAs === next!.id)) out.push(next);
  return out;
}

/** Per-game minutes: a stage's Bells cap wins over the slot length typed on each game. */
const gameMins = (def: TournamentDefinition, st: Stage, r: { minutes?: number }) => scoringMinutes(def, st) ?? r.minutes ?? 0;
const tieMins = (def: TournamentDefinition, st: Stage) => st.tieFormat?.rubbers.reduce((n, r) => n + gameMins(def, st, r), 0) ?? 0;

/** Court minutes one stage needs in one session. */
function partMinutes(def: TournamentDefinition, st: Stage, courtsFor: number): { minutes: number | null; detail: string } {
  const groups = Math.max(1, st.groups ?? 1);
  if (st.tieFormat) {
    const ties = Math.floor(groups / 2);
    const perCourt = Math.ceil(ties / Math.max(1, courtsFor || ties));
    const counts = st.tieFormat.rubbers.reduce<Record<string, { n: number; m: number }>>((a, r) => { a[r.discipline] = { n: (a[r.discipline]?.n ?? 0) + 1, m: gameMins(def, st, r) }; return a; }, {});
    const txt = Object.entries(counts).map(([d, v]) => `${v.n} ${d} × ${v.m} min`).join(" + ");
    return { minutes: perCourt * tieMins(def, st), detail: `${stageScoringLine(def, st)} · ${txt} per court` };
  }
  const e = effectiveSchedule(def, st);
  const mm = scoringMinutes(def, st) ?? (e.matchMinutes.value as number | null);
  const n = st.groupSize ?? null;
  if (!mm || !n || !courtsFor) return { minutes: null, detail: "Game length or courts not set" };
  const games = Math.floor(n / 2) * groups;
  return { minutes: Math.ceil(games / courtsFor) * mm, detail: `${games} games × ${mm} min over ${courtsFor} courts` };
}

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

export function sessionPlan(def: TournamentDefinition): { sessions: PlannedSession[]; issues: SessionIssue[] } {
  const issues: SessionIssue[] = [];
  const merged = new Map<string, PlannedSession>();
  const rows = allStages(def);
  for (const { division, stage } of rows) {
    if (stage.sameSessionAs) {
      const lead = rows.find((r) => r.stage.id === stage.sameSessionAs);
      if (!lead) { issues.push({ code: "session_link", divisionId: division.id, stageId: stage.id, message: `${stage.name} is set to share a session with a stage that no longer exists.` }); continue; }
      if (lead.division.id !== division.id) issues.push({ code: "session_link", divisionId: division.id, stageId: stage.id, message: `${stage.name} can only share a session with a stage in the same division.` });
      const a = (lead.stage.schedule.roundDates ?? []).map(d10).join(","), b = (stage.schedule.roundDates ?? []).map(d10).join(",");
      if (stage.schedule.roundDates?.length && a !== b)
        issues.push({ code: "session_dates", divisionId: division.id, stageId: stage.id, message: `${stage.name} plays in the same session as ${lead.stage.name}, so it must use the same dates (${a || "none set"}).` });
      continue;
    }
    if (stage.schedule.mode !== "fixed") continue;
    const members = sessionMembers(def, stage);
    const courts = stageCourts(def, division, stage).count;
    const start = stage.tieFormat?.startTime ?? def.scheduleDefaults?.startTime ?? null;
    const limit = (effectiveSchedule(def, stage).sessionMinutes.value as number | null) ?? null;
    let at = start ? toMin(start) : null, total: number | null = 0;
    const parts: SessionPart[] = members.map((m) => {
      const { minutes, detail } = partMinutes(def, m, courts);
      const s = at != null ? hhmm(at) : null;
      if (minutes == null) { total = null; at = null; } else { if (total != null) total += minutes; if (at != null) at += minutes; }
      return { stageId: m.id, name: m.name, discipline: m.discipline, minutesPerCourt: minutes, start: s, end: at != null ? hhmm(at) : null, detail };
    });
    for (const raw of stage.schedule.roundDates ?? []) {
      const date = d10(raw); if (!date) continue;
      const key = `${date}|${members.map((m) => m.name).join("+")}`;
      const end = start && total != null ? hhmm(toMin(start) + total) : null;
      const state: PlannedSession["state"] = !start || total == null ? "incomplete" : limit && total > limit ? "infeasible" : "feasible";
      const ex = merged.get(key);
      if (ex) { if (!ex.divisionIds.includes(division.id)) ex.divisionIds.push(division.id); continue; }
      merged.set(key, { date, label: `${dayLabel(date)}${start && end ? `, ${start}–${end}` : ""} — ${members.map((m) => m.name).join(" + ")}`, divisionIds: [division.id], start, end, minutes: total, parts, limitMinutes: limit, state });
      if (state === "infeasible") issues.push({ code: "session_overrun", divisionId: division.id, stageId: stage.id, message: `${dayLabel(date)}: ${members.map((m) => m.name).join(" + ")} needs ${total} min per court but the session is ${limit} min.` });
    }
  }
  const sessions = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""));
  return { sessions, issues };
}

import { eachDayOfInterval, format, getDay, parseISO } from "date-fns";
import { playoffMatchesForBracket } from "@/lib/tournament-playoffs";

/**
 * Tournament capacity model.
 *
 * Capacity is a *validation* of two independent inputs:
 *   - WHAT the tournament is  → league formats, pools, rounds, slot length, play-offs
 *   - WHEN/WHERE it runs      → dates, daily time windows, courts per window
 *
 * Nothing here enforces anything: the result is advisory and is only rendered.
 */

export type LeagueFormat =
  | "single_round_robin"
  | "double_round_robin"
  | "cross_league"
  | "swiss"
  | "knockout"
  | "";

/** One real playing window: a date, a time range and the courts available in it. */
export interface CapacitySession {
  date: string;
  /** Minutes of wall-clock play in this window. */
  minutes: number;
  /** Number of courts genuinely available for this window. */
  courts: number;
}

export interface CapacityLeagueInput {
  groupNumber: number;
  label?: string;
  format: LeagueFormat;
  /** Planned minutes per match for this league (its own duration, not a global one). */
  slotMinutes: number;
  /** Pools the league is split into (1 = single draw). */
  pools: number;
  /** Configured Swiss rounds (0/undefined = derive a suggestion). */
  rounds?: number;
  /** Actual roster size, or the planned expected count, in *entities* (players or pairs). */
  entities: number;
  playoffs: boolean;
}

export interface CapacityInput {
  sessions: CapacitySession[];
  leagues: CapacityLeagueInput[];
  isDoubles: boolean;
  /** Admin asked for leagues to run side by side (courts split between them). */
  parallelLeagues: boolean;
  /** Cross-league play forces one shared timeline — leagues cannot be split. */
  crossLeague: boolean;
  /** Pause held before the play-off stage; it eats wall-clock time on every court. */
  playoffBreakMinutes?: number;
}

export type MissingInput = "dates" | "times" | "courts" | "duration" | "structure";

export interface CapacityLeagueResult {
  groupNumber: number;
  label: string;
  format: LeagueFormat;
  isSwiss: boolean;
  slotMinutes: number;
  pools: number;
  rounds: number;
  suggestedRounds: number;
  /** Match slots this league can be given by the schedule. */
  gamesAvailable: number;
  gamesPerPoolAvailable: number;
  /** Matches the current/expected field needs (group stage only). */
  gamesNeeded: number;
  playoffGames: number;
  totalGamesNeeded: number;
  requiredMinutes: number;
  availableMinutes: number;
  maxEntities: number;
  maxPlayers: number;
  entities: number;
  players: number;
  fits: boolean;
  shortfallGames: number;
}

export interface CapacityResult {
  ready: boolean;
  missing: MissingInput[];
  sessionCount: number;
  dayCount: number;
  maxCourts: number;
  totalCourtMinutes: number;
  /** Court-minutes actually claimed by the current structure. */
  requiredCourtMinutes: number;
  parallelApplied: boolean;
  leagueCount: number;
  perLeague: CapacityLeagueResult[];
  maxEntitiesTotal: number;
  maxPlayersTotal: number;
  plannedEntities: number;
  plannedPlayers: number;
  /** Every league with a planned field fits. Null when no field is planned yet. */
  fits: boolean | null;
  bottleneck: string | null;
}

const parseHM = (s: string): number => {
  const [h, m] = String(s || "").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Largest N where a full round-robin (N·(N−1)/2 games) still fits in G games. */
export function maxEntitiesForGames(games: number): number {
  if (!Number.isFinite(games) || games <= 0) return 0;
  return Math.max(0, Math.floor((1 + Math.sqrt(1 + 8 * games)) / 2));
}

export interface DeriveSessionsInput {
  customizeDailySchedule: boolean;
  daySchedules: { date: string; start_time: string; end_time: string; court_ids: number[] | null }[];
  startDate: string;
  endDate: string;
  playDays: number[];
  startTime: string;
  endTime: string;
  selectedCourtIds: number[];
}

/**
 * Turn the wizard's date/time/court state into concrete playing windows.
 * Per-day windows win when the admin customised them (they can also narrow the
 * courts for that window); otherwise every play-day gets the global window.
 */
export function deriveSessions(input: DeriveSessionsInput): CapacitySession[] {
  const selected = new Set(input.selectedCourtIds);
  if (input.customizeDailySchedule && input.daySchedules.length > 0) {
    return input.daySchedules
      .map((d) => {
        const courts =
          d.court_ids && d.court_ids.length > 0
            ? Array.from(new Set(d.court_ids.filter((id) => selected.has(id)))).length
            : selected.size;
        return { date: d.date, minutes: parseHM(d.end_time) - parseHM(d.start_time), courts };
      })
      .filter((s) => s.minutes > 0 && s.courts > 0);
  }
  if (!input.startDate || !input.endDate || input.playDays.length === 0 || selected.size === 0) return [];
  const days = new Set(input.playDays);
  const minutes = parseHM(input.endTime) - parseHM(input.startTime);
  if (minutes <= 0) return [];
  return eachDayOfInterval({ start: parseISO(input.startDate), end: parseISO(input.endDate) })
    .filter((d) => days.has(getDay(d)))
    .map((d) => ({ date: format(d, "yyyy-MM-dd"), minutes, courts: selected.size }));
}

/** Which required scheduling inputs are still missing. */
export function missingCapacityInputs(input: DeriveSessionsInput & { leagues: CapacityLeagueInput[] }): MissingInput[] {
  const missing: MissingInput[] = [];
  const hasCustom = input.customizeDailySchedule && input.daySchedules.length > 0;
  if (!hasCustom && (!input.startDate || !input.endDate)) missing.push("dates");
  if (!hasCustom && (input.playDays.length === 0 || parseHM(input.endTime) - parseHM(input.startTime) <= 0))
    missing.push("times");
  if (hasCustom && !input.daySchedules.some((d) => parseHM(d.end_time) - parseHM(d.start_time) > 0))
    missing.push("times");
  if (input.selectedCourtIds.length === 0) missing.push("courts");
  if (input.leagues.length === 0) missing.push("structure");
  else if (input.leagues.some((l) => !l.slotMinutes || l.slotMinutes <= 0)) missing.push("duration");
  return missing;
}

/**
 * Core calculation. Every league is costed at its own slot length against the
 * court-time it can actually claim, so leagues that share courts (or run in
 * parallel on split courts) are sized separately.
 */
export function computeCapacity(input: CapacityInput): CapacityResult {
  const sessions = input.sessions.filter((s) => s.minutes > 0 && s.courts > 0);
  const leagues = input.leagues;
  const leagueCount = leagues.length;
  const isDoubles = input.isDoubles;

  const maxCourts = sessions.reduce((a, s) => Math.max(a, s.courts), 0);
  const dayCount = new Set(sessions.map((s) => s.date)).size;
  const breakMinutes = Math.max(0, Math.round(Number(input.playoffBreakMinutes) || 0));
  const anyPlayoffs = leagues.some((l) => l.playoffs);
  // A pre-play-off pause idles every court once.
  const breakCost = anyPlayoffs ? breakMinutes * maxCourts : 0;
  const totalCourtMinutes = Math.max(0, sessions.reduce((a, s) => a + s.minutes * s.courts, 0) - breakCost);

  const canParallel = leagueCount > 1 && maxCourts >= leagueCount && !input.crossLeague;
  const parallelApplied = input.parallelLeagues && canParallel;

  const ready = sessions.length > 0 && leagueCount > 0 && leagues.every((l) => l.slotMinutes > 0);

  const perLeague: CapacityLeagueResult[] = leagues.map((L, idx) => {
    const gn = L.groupNumber;
    const isSwiss = L.format === "swiss";
    const isDouble = L.format === "double_round_robin";
    const slot = Math.max(0, Number(L.slotMinutes) || 0);
    const pools = Math.max(1, Number(L.pools) || 1);

    let gamesAvailable = 0;
    let availableMinutes = 0;
    for (const s of sessions) {
      const leagueCourts = parallelApplied
        ? Math.floor(s.courts / leagueCount) + (idx < s.courts % leagueCount ? 1 : 0)
        : s.courts;
      availableMinutes += s.minutes * leagueCourts;
      if (slot > 0) gamesAvailable += Math.floor(s.minutes / slot) * leagueCourts;
    }
    if (anyPlayoffs && slot > 0 && breakMinutes > 0) {
      const lost = Math.floor(breakMinutes / slot) * (parallelApplied ? Math.max(1, Math.floor(maxCourts / leagueCount)) : maxCourts);
      gamesAvailable = Math.max(0, gamesAvailable - lost);
      availableMinutes = Math.max(0, availableMinutes - breakMinutes * (parallelApplied ? Math.max(1, Math.floor(maxCourts / leagueCount)) : maxCourts));
    }

    const gamesPerPoolAvailable = Math.floor(gamesAvailable / pools);
    const rrMaxEntities =
      maxEntitiesForGames(isDouble ? Math.floor(gamesPerPoolAvailable / 2) : gamesPerPoolAvailable) * pools;

    const entities = Math.max(0, Math.round(Number(L.entities) || 0));
    const perPoolActual = Math.ceil(entities / pools);

    const suggestedRounds = isSwiss
      ? Math.max(
          1,
          perPoolActual > 1
            ? Math.min(
                perPoolActual - 1,
                Math.floor(gamesPerPoolAvailable / Math.max(1, Math.ceil(perPoolActual / 2))),
              )
            : Math.min(5, Math.floor(gamesPerPoolAvailable / 2)),
        )
      : 0;
    const configuredRounds = Math.max(0, Number(L.rounds) || 0);
    const rounds = isSwiss ? (configuredRounds > 0 ? configuredRounds : suggestedRounds) : 0;

    const swissMaxPerPool = isSwiss && rounds > 0 ? Math.floor(gamesPerPoolAvailable / rounds) * 2 : 0;
    const swissMaxEntities = isSwiss ? swissMaxPerPool * pools : 0;

    const maxEntities = isSwiss ? swissMaxEntities : rrMaxEntities;
    const maxPlayers = isDoubles ? maxEntities * 2 : maxEntities;

    const rrGamesNeeded =
      perPoolActual > 1 ? ((perPoolActual * (perPoolActual - 1)) / (isDouble ? 1 : 2)) * pools : 0;
    const gamesNeeded = isSwiss
      ? rounds > 0
        ? Math.ceil(perPoolActual / 2) * rounds * pools
        : 0
      : rrGamesNeeded;

    const bracketSize =
      pools > 1
        ? pools >= 8
          ? 8
          : pools >= 4
            ? 4
            : 2
        : entities >= 8
          ? 8
          : entities >= 4
            ? 4
            : entities >= 2
              ? 2
              : 0;
    const playoffGames = L.playoffs ? playoffMatchesForBracket(bracketSize) : 0;
    const totalGamesNeeded = gamesNeeded + playoffGames;

    return {
      groupNumber: gn,
      label: L.label || `League ${gn}`,
      format: L.format,
      isSwiss,
      slotMinutes: slot,
      pools,
      rounds,
      suggestedRounds,
      gamesAvailable,
      gamesPerPoolAvailable,
      gamesNeeded,
      playoffGames,
      totalGamesNeeded,
      requiredMinutes: totalGamesNeeded * slot,
      availableMinutes,
      maxEntities,
      maxPlayers,
      entities,
      players: isDoubles ? entities * 2 : entities,
      fits: totalGamesNeeded <= gamesAvailable,
      shortfallGames: Math.max(0, totalGamesNeeded - gamesAvailable),
    };
  });

  const plannedEntities = perLeague.reduce((a, l) => a + l.entities, 0);
  const withField = perLeague.filter((l) => l.entities > 0);
  const worst = [...withField].sort((a, b) => b.shortfallGames - a.shortfallGames)[0];

  let bottleneck: string | null = null;
  if (worst && !worst.fits) {
    const extraMinutes = worst.shortfallGames * worst.slotMinutes;
    bottleneck = `${worst.label} needs ${worst.shortfallGames} more match slot${
      worst.shortfallGames === 1 ? "" : "s"
    } (~${Math.round(extraMinutes / 60 * 10) / 10}h of court time). Add court time, add a court, shorten the match slot, or reduce the field.`;
  }

  return {
    ready,
    missing: [],
    sessionCount: sessions.length,
    dayCount,
    maxCourts,
    totalCourtMinutes,
    requiredCourtMinutes: perLeague.reduce((a, l) => a + l.requiredMinutes, 0),
    parallelApplied,
    leagueCount,
    perLeague,
    maxEntitiesTotal: perLeague.reduce((a, l) => a + l.maxEntities, 0),
    maxPlayersTotal: perLeague.reduce((a, l) => a + l.maxPlayers, 0),
    plannedEntities,
    plannedPlayers: perLeague.reduce((a, l) => a + l.players, 0),
    fits: withField.length === 0 ? null : withField.every((l) => l.fits),
    bottleneck,
  };
}

/** "6h 30m" */
export function formatCourtMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export const MISSING_LABELS: Record<MissingInput, string> = {
  dates: "tournament start and end dates",
  times: "daily playing times",
  courts: "courts for the tournament",
  duration: "a match duration for every league",
  structure: "at least one league",
};

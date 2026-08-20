/**
 * Season archiving for club leagues.
 *
 * Archiving is an EXPLICIT admin action at season level. It never deletes or
 * re-keys anything: league rows keep their ids, and every dependent record
 * (rounds, fixtures, results, lineups, registrations, ladder history,
 * tournaments) stays attached to those same ids. Archiving only sets
 * `archived_at`, which hides the season from active operational selectors and
 * makes the league rows read-only (enforced by a database trigger too).
 */

export interface ArchivableLeague {
  id: string;
  name?: string | null;
  season_year?: number | null;
  association_id?: string | null;
  archived_at?: string | null;
}

export const isArchivedLeague = (l: ArchivableLeague | null | undefined): boolean =>
  !!l && l.archived_at != null;

/** Rows usable in day-to-day workflows (fixtures, tournaments, invites, ladders). */
export function filterActiveLeagues<T extends ArchivableLeague>(rows: T[]): T[] {
  return (rows || []).filter((l) => !isArchivedLeague(l));
}

/** Rows that belong to an archived season — historical browsing only. */
export function filterArchivedLeagues<T extends ArchivableLeague>(rows: T[]): T[] {
  return (rows || []).filter(isArchivedLeague);
}

export interface SeasonGroup<T extends ArchivableLeague = ArchivableLeague> {
  /** null = rows with no confident season year; never auto-archived. */
  seasonYear: number | null;
  leagues: T[];
  total: number;
  archivedCount: number;
  activeCount: number;
  /** A season counts as archived only when every one of its leagues is. */
  archived: boolean;
  /** Some archived, some not — archiving/unarchiving the season squares it up. */
  partial: boolean;
}

/** Group leagues into seasons, newest first, undated last. */
export function groupLeaguesBySeason<T extends ArchivableLeague>(rows: T[]): SeasonGroup<T>[] {
  const map = new Map<string, T[]>();
  (rows || []).forEach((l) => {
    const key = l.season_year == null ? "none" : String(l.season_year);
    const list = map.get(key) || [];
    list.push(l);
    map.set(key, list);
  });

  const groups: SeasonGroup<T>[] = Array.from(map.entries()).map(([key, leagues]) => {
    const archivedCount = leagues.filter(isArchivedLeague).length;
    return {
      seasonYear: key === "none" ? null : Number(key),
      leagues,
      total: leagues.length,
      archivedCount,
      activeCount: leagues.length - archivedCount,
      archived: archivedCount === leagues.length && leagues.length > 0,
      partial: archivedCount > 0 && archivedCount < leagues.length,
    };
  });

  return groups.sort((a, b) => {
    if (a.seasonYear == null) return 1;
    if (b.seasonYear == null) return -1;
    return b.seasonYear - a.seasonYear;
  });
}

/** Seasons an admin may archive: has a year and at least one live league. */
export function archivableSeasons<T extends ArchivableLeague>(rows: T[]): SeasonGroup<T>[] {
  return groupLeaguesBySeason(rows).filter((g) => g.seasonYear != null && g.activeCount > 0);
}

/**
 * Safeguard copy for un-archiving. Bringing an old season back while a newer
 * one is live means two active seasons in every selector — allowed, but the
 * admin is warned first.
 */
export function unarchiveWarning<T extends ArchivableLeague>(
  rows: T[],
  seasonYear: number,
): string | null {
  const newer = groupLeaguesBySeason(rows).find(
    (g) => g.seasonYear != null && g.seasonYear > seasonYear && g.activeCount > 0,
  );
  if (!newer) return null;
  return `Season ${newer.seasonYear} is currently active. Restoring ${seasonYear} means both seasons appear in fixtures, tournaments and invites until you archive one of them.`;
}

/**
 * Name/link resolution for historical views: archived rows must still resolve,
 * so lookups always search the FULL list, never the active-only list.
 */
export function resolveLeagueName<T extends ArchivableLeague>(
  allRows: T[],
  leagueId: string,
): string | null {
  const hit = (allRows || []).find((l) => l.id === leagueId);
  return hit ? (hit.name ?? null) : null;
}

/** Plain-language confirmation body for the archive dialog. */
export function archiveConfirmation(seasonYear: number, leagueCount: number): string {
  return (
    `Archive all ${leagueCount} league team${leagueCount === 1 ? "" : "s"} for the ${seasonYear} season. ` +
    `Nothing is deleted: teams, players, rounds, fixtures, results, lineups, ladders and tournament history are all kept and stay browsable under Archived seasons. ` +
    `The ${seasonYear} season becomes read-only and is hidden from day-to-day workflows such as new fixtures, tournament sources and invitations. You can restore it later.`
  );
}

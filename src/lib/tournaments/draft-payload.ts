/**
 * Tournament draft payload sanitisation.
 *
 * The wizard intentionally starts several constrained fields as "" (empty
 * string) so the organiser is forced to make a choice later. Those columns are
 * guarded by CHECK constraints in the database (e.g. `tr_bye_handling_check`),
 * so sending "" makes the whole draft insert fail with a 23514 error and the
 * draft is never created.
 *
 * Dropping the empty keys lets the DB defaults apply on insert, and leaves the
 * previously stored value untouched on update.
 */

/** Columns on `club_champs` whose values are validated by CHECK constraints. */
export const CONSTRAINED_DRAFT_FIELDS = [
  "gender",
  "match_type",
  "scoring_mode",
  "round_format",
  "bye_handling",
  "win_condition",
  "handicap_mode",
  "partner_mode",
  "registration_mode",
  "entry_source",
  "approval_gate",
  "invite_source",
  "schedule_mode",
  "scheduling_mode",
  "eligibility_scope",
  "payment_timing",
] as const;

export function sanitizeDraftPayload<T extends Record<string, any>>(payload: T): Partial<T> {
  const out: Record<string, any> = { ...payload };
  for (const key of CONSTRAINED_DRAFT_FIELDS) {
    const value = out[key];
    if (typeof value === "string" && value.trim() === "") delete out[key];
  }
  return out as Partial<T>;
}

/**
 * Columns on `tournaments` that are NOT NULL with a default. The wizard sends
 * `null` for these while a draft is still empty, which fails with a 23502.
 * Omitting them keeps the default (insert) or the stored value (update).
 */
export const NON_NULLABLE_EXTRAS_FIELDS = [
  "event_type",
  "seeding_source",
  "participating_club_ids",
  "league_win_conditions",
  "league_sections",
  "league_sources",
  "league_source_modes",
] as const;

export function sanitizeExtrasPayload<T extends Record<string, any>>(payload: T): Partial<T> {
  const out: Record<string, any> = { ...payload };
  for (const key of NON_NULLABLE_EXTRAS_FIELDS) {
    if (key in out && (out[key] === null || out[key] === undefined)) delete out[key];
  }
  return out as Partial<T>;
}

/**
 * Restore the organiser's player picker without confusing a draft selection
 * with accepted registrations or a final division allocation.
 *
 * Once entry rows exist they are authoritative. Before that, the saved draft
 * roster is restored, but people who have since accepted a registration are
 * always merged in — someone who signs up (and pays) after the organiser last
 * saved the wizard must never silently disappear from the player list.
 */
export function restoreDraftPlayerIds(
  entryIds: string[],
  draftPlayerIds: string[] | null | undefined,
  registeredPlayerIds: string[],
): string[] {
  if (entryIds.length > 0) return Array.from(new Set(entryIds));
  if (Array.isArray(draftPlayerIds)) {
    return Array.from(new Set([...draftPlayerIds, ...registeredPlayerIds]));
  }
  return Array.from(new Set(registeredPlayerIds));
}

/** Keep the current field easy to review before the unselected member directory. */
export function sortTournamentPlayers<T extends { id: string; name?: string | null; profiles?: { name?: string | null } | null }>(
  players: T[], selectedIds: ReadonlySet<string>,
): { participants: T[]; otherMembers: T[] } {
  const byName = (a: T, b: T) => String(a.name || a.profiles?.name || "")
    .localeCompare(String(b.name || b.profiles?.name || ""));
  return {
    participants: players.filter((player) => selectedIds.has(player.id)).sort(byName),
    otherMembers: players.filter((player) => !selectedIds.has(player.id)).sort(byName),
  };
}

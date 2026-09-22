/**
 * Tournament venues — the single source of truth for WHERE an event is played.
 *
 * The owning body (club, association or federation) does not need to own
 * courts: a regional association runs the tournament and one or more member
 * clubs host it. Each host club contributes its OWN existing courts; we never
 * create tournament-only court records.
 *
 * `tournament_venues` holds the authoritative rows. The legacy
 * `tournaments.participating_club_ids` / `tournaments.court_ids` columns are
 * kept in sync as derived mirrors so every existing scheduler, capacity and
 * invite code path keeps working unchanged.
 */

export type HostFeeBasis = "fixed" | "per_court_hour" | "per_day";

export interface VenueRow {
  club_id: string;
  court_ids: number[];
  is_primary: boolean;
  host_fee_cents?: number;
  host_fee_basis?: HostFeeBasis;
  host_fee_qty?: number;
  host_share_pct?: number;
  notes?: string | null;
}

export interface CourtRef {
  id: number;
  club_id?: string | null;
}

/**
 * Split the flat selected-court list into one venue row per host club.
 * The primary club always gets a row, even when none of its courts are used
 * (an association may host entirely at other clubs but still own the event).
 */
export function deriveVenueRows(args: {
  primaryClubId: string;
  venueClubIds: string[];
  selectedCourtIds: number[];
  courts: CourtRef[];
}): VenueRow[] {
  const { primaryClubId, selectedCourtIds, courts } = args;
  const clubOf = new Map<number, string>();
  courts.forEach((c) => {
    if (c.club_id) clubOf.set(c.id, c.club_id);
  });

  const clubIds = Array.from(new Set([primaryClubId, ...args.venueClubIds].filter(Boolean)));
  const byClub = new Map<string, number[]>(clubIds.map((id) => [id, []]));

  selectedCourtIds.forEach((courtId) => {
    const club = clubOf.get(courtId) || primaryClubId;
    const list = byClub.get(club) || [];
    list.push(courtId);
    byClub.set(club, list);
  });

  return Array.from(byClub.entries())
    .filter(([clubId, courtIds]) => clubId === primaryClubId || courtIds.length > 0 || clubIds.includes(clubId))
    .map(([clubId, courtIds]) => ({
      club_id: clubId,
      court_ids: Array.from(new Set(courtIds)).sort((a, b) => a - b),
      is_primary: clubId === primaryClubId,
    }));
}

/** Effective hosting cost for one venue, in cents. */
export function hostFeeCents(v: {
  host_fee_cents?: number | null;
  host_fee_basis?: string | null;
  host_fee_qty?: number | null;
}): number {
  const rate = Math.max(0, Math.round(Number(v.host_fee_cents) || 0));
  const basis = (v.host_fee_basis || "fixed") as HostFeeBasis;
  if (basis === "fixed") return rate;
  const qty = Math.max(0, Number(v.host_fee_qty) || 0);
  return Math.round(rate * qty);
}

export function hostFeeBasisLabel(basis: string | null | undefined): string {
  if (basis === "per_court_hour") return "per court hour";
  if (basis === "per_day") return "per day";
  return "fixed amount";
}

/** Which club a fixture's court belongs to — the venue shown to players. */
export function venueClubForCourt(courtId: number | null | undefined, courts: CourtRef[], fallbackClubId: string): string {
  if (courtId == null) return fallbackClubId;
  return courts.find((c) => c.id === courtId)?.club_id || fallbackClubId;
}

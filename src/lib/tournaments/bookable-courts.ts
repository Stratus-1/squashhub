/**
 * Mirror of DB `tournament_bookable_court_ids` (the authority used by the booking
 * guard). Owner is never venue: club events default to the owning club; regional/
 * national events need an explicitly stipulated host club.
 */
export type EventKind = "club" | "regional";
export interface VenueInput {
  kind: EventKind;
  ownerClubId: string | null;
  venues: { club_id: string; court_ids: number[] }[];
  legacyCourtIds?: number[];
  /** Stage override from stage_scheduling (pools or the playoff key). */
  override?: { court_ids?: number[]; venue_club_id?: string | null } | null;
  courts: { id: number; club_id: string; active?: boolean; is_external?: boolean }[];
}

export function hostClubIds(i: Pick<VenueInput, "kind" | "ownerClubId" | "venues">): string[] {
  if (i.kind === "club") return [...new Set([...i.venues.map((v) => v.club_id), ...(i.ownerClubId ? [i.ownerClubId] : [])])];
  return [...new Set(i.venues.filter((v) => v.club_id !== i.ownerClubId || v.court_ids.length > 0).map((v) => v.club_id))];
}

const normal = (i: VenueInput, clubs: string[]) =>
  i.courts.filter((c) => clubs.includes(c.club_id) && c.active !== false && !c.is_external).map((c) => c.id).sort((a, b) => a - b);

export function bookableCourtIds(i: VenueInput): number[] {
  if (i.override?.court_ids?.length) return [...new Set(i.override.court_ids)];
  if (i.override?.venue_club_id) return normal(i, [i.override.venue_club_id]);
  const explicit = [...new Set(i.venues.flatMap((v) => v.court_ids))];
  if (explicit.length) return explicit;
  if (i.legacyCourtIds?.length) return i.legacyCourtIds;
  return normal(i, hostClubIds(i));
}

/** Blocks self-bookable generation when a regional/national event has no host venue. */
export function venueBlocker(kind: EventKind, hostIds: string[]): string | null {
  return kind === "regional" && hostIds.length === 0
    ? "Choose the host club/venue for this regional or national event before generating self-bookable games. The organising body or your own club is never assumed."
    : null;
}

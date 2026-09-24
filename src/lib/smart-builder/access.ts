/**
 * Single gate for the Smart Tournament Builder BETA ("Tournament Beta").
 *
 * Rollout:
 *  - Super Admin: always (platform panel).
 *  - Selected beta clubs: Super Admin switches a club on in `club_beta_features`
 *    (feature = 'tournament_beta'). Club admins, or members with the
 *    Tournaments ("champs") permission, at that club may then use the builder
 *    in their own club context.
 *
 * The same rule is enforced server-side by `can_use_tournament_beta()` (drafts
 * RLS) and the `smart-tournament-interpret` edge function.
 * The legacy Tournaments tile is never replaced or redirected by this flag.
 */
export const TOURNAMENT_BETA_FEATURE = "tournament_beta";

export interface SmartBuilderAccessContext {
  isSuperAdmin: boolean;
  /** Club context only: the club has Tournament Beta switched on */
  clubHasBeta?: boolean;
  /** Club context only: viewer is full club admin or holds the "champs" permission */
  canManageTournaments?: boolean;
}

export function canUseSmartBuilder(ctx: SmartBuilderAccessContext): boolean {
  if (ctx.isSuperAdmin === true) return true;
  return ctx.clubHasBeta === true && ctx.canManageTournaments === true;
}

export const SMART_BUILDER_LABEL = "Smart Tournament Builder — BETA";
export const SMART_BUILDER_SUBLABEL = "Super Admin testing only";
export const CLUB_BETA_TILE_LABEL = "Tournament Beta";

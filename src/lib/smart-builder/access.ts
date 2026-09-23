/**
 * Single gate for the Smart Tournament Builder BETA.
 *
 * Today only platform Super Admins may use it. This is a temporary release
 * restriction, not an architectural assumption: widen access here (and in the
 * `smart_tournament_drafts` RLS policy + edge function check) when the beta
 * opens to club / association / federation admins.
 */
export interface SmartBuilderAccessContext {
  isSuperAdmin: boolean;
}

export function canUseSmartBuilder(ctx: SmartBuilderAccessContext): boolean {
  return ctx.isSuperAdmin === true;
}

export const SMART_BUILDER_LABEL = "Smart Tournament Builder — BETA";
export const SMART_BUILDER_SUBLABEL = "Super Admin testing only";

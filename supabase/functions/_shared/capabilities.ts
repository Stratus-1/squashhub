// Shared capability check for background / edge-function paths.
//
// Mirrors the client-side capability model (public.club_capabilities).
// Fails OPEN when a club has no capability rows at all (pre-migration or
// association tenants) so we never silently break an established club.

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export async function clubHasCapability(
  admin: AnyClient,
  clubId: string,
  slug: string,
): Promise<boolean> {
  if (!clubId) return false;
  const { data, error } = await admin
    .from("club_capabilities")
    .select("capability, enabled")
    .eq("club_id", clubId);
  if (error) return true; // fail open on read errors — never block on infra issues
  const rows = (data ?? []) as Array<{ capability: string; enabled: boolean }>;
  if (rows.length === 0) return true; // no capability rows yet → legacy behaviour
  const row = rows.find((r) => r.capability === slug);
  return row ? !!row.enabled : false;
}

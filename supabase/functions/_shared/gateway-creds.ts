// Multi-gateway support helpers.
//
// A club has one primary gateway (`clubs.payment_gateway`) plus any number of
// additional gateways (`clubs.payment_gateways`). Credentials for the primary
// gateway stay flat in `club_secrets.payment_gateway_credentials` (unchanged,
// backwards compatible); additional gateways store their credentials under
// `payment_gateway_credentials.__gateways.<gatewayId>`.

export type ClubGatewayRow = {
  payment_gateway?: string | null;
  payment_gateways?: string[] | null;
};

/** Every gateway the club has switched on, primary first. */
export function enabledGateways(club: ClubGatewayRow | null | undefined): string[] {
  const out: string[] = [];
  const primary = (club?.payment_gateway || "").trim();
  if (primary) out.push(primary);
  for (const g of club?.payment_gateways || []) {
    const id = String(g || "").trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** True when the club can take payments through this gateway. */
export function gatewayEnabled(club: ClubGatewayRow | null | undefined, gatewayId: string): boolean {
  return enabledGateways(club).includes(gatewayId);
}

/**
 * Credentials for a specific gateway: the namespaced block when present,
 * otherwise the flat block (which belongs to the primary gateway).
 */
export function resolveGatewayCreds(
  all: unknown,
  gatewayId: string,
): Record<string, string> {
  const root = (all || {}) as Record<string, unknown>;
  const scoped = (root.__gateways as Record<string, Record<string, string>> | undefined)?.[gatewayId];
  if (scoped && typeof scoped === "object" && Object.keys(scoped).length > 0) return scoped;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(root)) {
    if (k === "__gateways") continue;
    flat[k] = v as string;
  }
  return flat;
}

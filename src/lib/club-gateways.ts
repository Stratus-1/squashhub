// Multi-gateway helpers for the client.
//
// `clubs.payment_gateway` remains the club's primary/default gateway.
// `clubs.payment_gateways` holds any additional gateways the club also offers
// (e.g. Paynow *and* EcoCash). Member-facing screens show a choice whenever
// more than one supported gateway is switched on.
import { SUPPORTED_GATEWAYS, isSupportedGateway, type GatewayId } from "@/lib/club-payments";

export const GATEWAY_LABELS: Record<string, string> = {
  yoco: "Yoco",
  stitch: "Stitch (card / PayByBank)",
  paynow: "Paynow (EcoCash, cards)",
  ecocash: "EcoCash",
  payfast: "PayFast",
  peach: "Peach Payments",
  ozow: "Ozow",
  snapscan: "SnapScan",
  paystack: "Paystack",
  stripe: "Stripe",
};

export const gatewayLabel = (id: string | null | undefined) =>
  (id && GATEWAY_LABELS[id]) || id || "payment gateway";

type ClubLike = { payment_gateway?: string | null; payment_gateways?: string[] | null } | null | undefined;

/** All gateways the club has switched on (primary first), unfiltered. */
export function enabledGatewayIds(club: ClubLike): string[] {
  const out: string[] = [];
  const primary = (club?.payment_gateway || "").trim();
  if (primary) out.push(primary);
  for (const g of (club as any)?.payment_gateways || []) {
    const id = String(g || "").trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Only the gateways we can actually run a checkout with, primary first. */
export function checkoutGateways(club: ClubLike): GatewayId[] {
  return enabledGatewayIds(club).filter(isSupportedGateway) as GatewayId[];
}

export { SUPPORTED_GATEWAYS, isSupportedGateway };
export type { GatewayId };

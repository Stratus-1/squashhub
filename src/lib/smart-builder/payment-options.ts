/**
 * Which tournament payment methods the host club can actually accept.
 * Source of truth = the club's Banking settings (same as the Current Builder):
 *   clubs.accepted_payment_methods ("cash" | "eft" | "online"),
 *   clubs.payment_gateway / payment_gateways (online needs a gateway),
 *   club_secrets bank details (EFT needs them).
 * Values map 1:1 onto tournaments.payment_methods, which the player Pay flow reads.
 */
import type { TournamentPaymentMethod } from "@/lib/tournaments/payment-methods";

export type ClubPaymentConfig = { accepted: string[] | null; gateway: string | null; gatewayLabel?: string | null; eftConfigured: boolean };
export type MethodOption = { key: TournamentPaymentMethod; label: string; available: boolean; why?: string };

export function tournamentMethodOptions(cfg: ClubPaymentConfig): MethodOption[] {
  const acc = new Set(cfg.accepted ?? ["cash", "eft", "online"]);
  return [
    { key: "card", label: `Online${cfg.gatewayLabel ? ` (${cfg.gatewayLabel})` : ""} — card / instant pay`, available: acc.has("online") && !!cfg.gateway,
      why: !acc.has("online") ? "Online payments aren't switched on in Banking." : !cfg.gateway ? "No online gateway set up in Banking." : undefined },
    { key: "eft", label: "EFT (bank transfer — admin marks paid)", available: acc.has("eft") && cfg.eftConfigured,
      why: !acc.has("eft") ? "EFT isn't switched on in Banking." : !cfg.eftConfigured ? "No bank details in Banking." : undefined },
    { key: "cash", label: "Cash at club (admin marks paid)", available: acc.has("cash"), why: acc.has("cash") ? undefined : "Cash isn't switched on in Banking." },
    { key: "account", label: "Add to member account (settled later)", available: true },
  ];
}

/** Keeps only methods the club can accept (drops ones switched off since). */
export const allowedMethods = (chosen: string[] | undefined, opts: MethodOption[]) =>
  (chosen ?? []).filter((m) => opts.some((o) => o.key === m && o.available)) as TournamentPaymentMethod[];

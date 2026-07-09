import { useMyClub } from "@/hooks/use-club";
import { useClubContext } from "@/contexts/ClubContext";
import { formatMoney as fmt, getCurrencyOption } from "@/lib/currency";

/**
 * Returns the active club's currency + a bound `format(amount)` helper.
 * Safe on marketing/public pages — falls back to ZAR / "R".
 */
export function useClubCurrency() {
  const { data } = useMyClub();
  const { club: ctxClub } = useClubContext();
  const club: any = data?.club || ctxClub || null;
  const opt = getCurrencyOption(club?.currency_code);
  const symbol: string = club?.currency_symbol || opt.symbol;
  const code: string = (club?.currency_code || "ZAR").toUpperCase();
  return {
    code,
    symbol,
    name: opt.name,
    format: (amount: number | null | undefined, decimals?: number) =>
      fmt(amount, { currency_symbol: symbol, currency_code: code }, { decimals }),
  };
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClubCurrency } from "@/hooks/use-currency";
import { normaliseCurrency } from "@/lib/saas-tiers";

/**
 * Per-message rates shown to a club.
 *
 * Mirrors the subscription-pricing convention: ZAR is the base currency and
 * USD/EUR are fixed rate tables scaled by the same exchange ratio used for
 * SaaS tiers (no live FX). Platform defaults live in `app_settings` (ZAR);
 * a currency override uses a `<key>_<ccy>` setting, e.g. `sms_unit_cost_usd`.
 * Clubs in any other currency are billed at the ZAR rates, exactly like
 * their subscription.
 */
const BASE_KEYS = [
  "sms_unit_cost",
  "whatsapp_rate_service",
  "whatsapp_rate_utility",
  "whatsapp_rate_marketing",
] as const;

const DEFAULTS: Record<(typeof BASE_KEYS)[number], number> = {
  sms_unit_cost: 0.25,
  whatsapp_rate_service: 0.15,
  whatsapp_rate_utility: 0.45,
  whatsapp_rate_marketing: 0.8,
};

export function useMessagingRates() {
  const { code: clubCode } = useClubCurrency();
  // Same currency rule as subscriptions: only ZAR/USD/EUR have rate tables.
  const code = normaliseCurrency(clubCode);
  const symbol = code === "USD" ? "$" : code === "EUR" ? "€" : "R";

  const { data } = useQuery({
    queryKey: ["messaging-rates", code],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const keys = [
        ...BASE_KEYS,
        ...BASE_KEYS.map((k) => `${k}_${code.toLowerCase()}`),
      ];
      const { data, error } = await supabase.from("app_settings").select("key, value").in("key", keys);
      if (error) throw error;
      return new Map((data ?? []).map((r: { key: string; value: string | null }) => [r.key, r.value]));
    },
  });

  const rate = (key: (typeof BASE_KEYS)[number]) => {
    const scoped = data?.get(`${key}_${code.toLowerCase()}`);
    const base = data?.get(key);
    const raw = code === "ZAR" ? base : (scoped ?? base);
    const n = Number(raw);
    return raw == null || raw === "" || Number.isNaN(n) ? DEFAULTS[key] : n;
  };

  return {
    currency: code,
    symbol,
    /** Money formatter bound to the messaging rate currency, always 2 decimals. */
    money: (n: number | null | undefined) =>
      formatMoney(Number(n || 0), { currency_symbol: symbol, currency_code: code }, { decimals: 2 }),
    sms: rate("sms_unit_cost"),
    waService: rate("whatsapp_rate_service"),
    waUtility: rate("whatsapp_rate_utility"),
    waMarketing: rate("whatsapp_rate_marketing"),
  };
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_TIERS,
  DEFAULT_MIN_CHARGE,
  parseTiers,
  normaliseCurrency,
  tierSettingKey,
  type SaasCycle,
  type SaasTier,
} from "@/lib/saas-tiers";

export const SAAS_SYMBOL: Record<string, string> = { ZAR: "R", USD: "$", EUR: "€" };
export const saasMinKey = (c: string, cycle: SaasCycle) =>
  `saas_tier_min_${c.toLowerCase()}_${cycle}`;

export interface SaasPricing {
  currency: string;
  symbol: string;
  monthlyTiers: SaasTier[];
  annualTiers: SaasTier[];
  monthlyMin: number;
  annualMin: number;
  cap: number | null;
  format: (n: number) => string;
  bandLabel: (from: number, to: number | null) => string;
}

/**
 * Single source of truth for the platform's sliding-scale pricing.
 * Reads live values from `app_settings` (editable in Super Admin) and falls
 * back to the code defaults. Readable by signed-out visitors so the marketing
 * site stays in sync automatically.
 */
export function useSaasPricing(currencyCode?: string | null): SaasPricing {
  const ccy = normaliseCurrency(currencyCode || "ZAR");

  const { data: settings } = useQuery({
    queryKey: ["saas-pricing-public", ccy],
    staleTime: 60_000,
    queryFn: async () => {
      const keys = [
        "saas_billing_cap",
        tierSettingKey(ccy, "monthly"),
        tierSettingKey(ccy, "annual"),
        saasMinKey(ccy, "monthly"),
        saasMinKey(ccy, "annual"),
      ];
      const { data, error } = await supabase.from("app_settings").select("key, value").in("key", keys);
      if (error) throw error;
      return new Map((data || []).map((r: any) => [r.key, r.value as string]));
    },
  });

  const rawCap = settings?.get("saas_billing_cap");
  const cap = rawCap == null || rawCap === "" ? null : Number(rawCap);

  const monthlyTiers = parseTiers(settings?.get(tierSettingKey(ccy, "monthly"))) || DEFAULT_TIERS[ccy].monthly;
  const annualTiers = parseTiers(settings?.get(tierSettingKey(ccy, "annual"))) || DEFAULT_TIERS[ccy].annual;
  const monthlyMin = Number(settings?.get(saasMinKey(ccy, "monthly")) ?? DEFAULT_MIN_CHARGE[ccy].monthly) || 0;
  const annualMin = Number(settings?.get(saasMinKey(ccy, "annual")) ?? DEFAULT_MIN_CHARGE[ccy].annual) || 0;

  const symbol = SAAS_SYMBOL[ccy] || "R";

  return {
    currency: ccy,
    symbol,
    monthlyTiers,
    annualTiers,
    monthlyMin,
    annualMin,
    cap,
    format: (n: number) => `${symbol}${Number(n || 0).toFixed(2)}`,
    bandLabel: (from: number, to: number | null) =>
      to == null ? `${from}+` : from === 1 ? `First ${to}` : `${from} – ${to}`,
  };
}

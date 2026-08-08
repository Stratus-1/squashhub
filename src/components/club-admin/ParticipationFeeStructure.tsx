import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Printer, Layers } from "lucide-react";
import { useClubCurrency } from "@/hooks/use-currency";
import {
  DEFAULT_TIERS,
  DEFAULT_MIN_CHARGE,
  computeTieredCharge,
  parseTiers,
  normaliseCurrency,
  tierSettingKey,
  TIERS_ENABLED_KEY,
  type SaasCycle,
} from "@/lib/saas-tiers";

const SYMBOL: Record<string, string> = { ZAR: "R", USD: "$", EUR: "€" };
const minKey = (c: string, cycle: SaasCycle) => `saas_tier_min_${c.toLowerCase()}_${cycle}`;

/**
 * Tenant-facing fee structure. Mirrors the platform's graduated ("sliding
 * scale") pricing when it is enabled, and falls back to the legacy flat rate
 * otherwise.
 */
export function ParticipationFeeStructure({ memberCount }: { memberCount?: number | null }) {
  const { code: clubCurrencyCode, name: clubCurrencyName } = useClubCurrency();
  const ccy = normaliseCurrency(clubCurrencyCode);
  const symbol = SYMBOL[ccy] || "R";

  const { data: settings } = useQuery({
    queryKey: ["saas-pricing-public", ccy],
    queryFn: async () => {
      const keys = [
        TIERS_ENABLED_KEY,
        "saas_billing_cap",
        tierSettingKey(ccy, "monthly"),
        tierSettingKey(ccy, "annual"),
        minKey(ccy, "monthly"),
        minKey(ccy, "annual"),
      ];
      const { data, error } = await supabase.from("app_settings").select("key, value").in("key", keys);
      if (error) throw error;
      return new Map((data || []).map((r: any) => [r.key, r.value as string]));
    },
  });

  const tiersEnabled = settings?.get(TIERS_ENABLED_KEY) === "true";
  const rawCap = settings?.get("saas_billing_cap");
  const cap = rawCap == null || rawCap === "" ? null : Number(rawCap);

  const monthlyTiers = parseTiers(settings?.get(tierSettingKey(ccy, "monthly"))) || DEFAULT_TIERS[ccy].monthly;
  const annualTiers = parseTiers(settings?.get(tierSettingKey(ccy, "annual"))) || DEFAULT_TIERS[ccy].annual;
  const monthlyMin = Number(settings?.get(minKey(ccy, "monthly")) ?? DEFAULT_MIN_CHARGE[ccy].monthly) || 0;
  const annualMin = Number(settings?.get(minKey(ccy, "annual")) ?? DEFAULT_MIN_CHARGE[ccy].annual) || 0;

  const fmt = (n: number) => `${symbol}${Number(n || 0).toFixed(2)}`;
  const billable =
    typeof memberCount === "number"
      ? cap && cap > 0
        ? Math.min(memberCount, cap)
        : memberCount
      : null;

  const monthly = billable !== null ? computeTieredCharge(billable, monthlyTiers, monthlyMin) : null;
  const annual = billable !== null ? computeTieredCharge(billable, annualTiers, annualMin) : null;

  // Legacy flat-rate fallback (used when graduated pricing is switched off).
  const FLAT: Record<string, { monthly: number; annual: number; savings: string }> = {
    ZAR: { monthly: 6.0, annual: 5.0, savings: "R12" },
    USD: { monthly: 0.35, annual: 0.3, savings: "$0.60" },
    EUR: { monthly: 0.32, annual: 0.27, savings: "€0.60" },
  };
  const flat = FLAT[ccy];

  const bandLabel = (from: number, to: number | null) =>
    to == null ? `${from}+ members` : from === 1 ? `First ${to} members` : `Members ${from}–${to}`;

  return (
    <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-3">
      <div className="flex items-center gap-2 font-medium text-foreground">
        {tiersEnabled && <Layers className="w-4 h-4 text-primary" />}
        Fee structure
      </div>

      {tiersEnabled ? (
        <>
          <p className="text-xs text-muted-foreground">
            Pricing is on a <strong className="text-foreground">sliding scale</strong> — like tax bands, each block of
            members is charged at its own rate, so the more members you have the lower your average cost per member.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Band</th>
                  <th className="py-1 px-2 font-medium text-right">Monthly / member</th>
                  <th className="py-1 pl-2 font-medium text-right">Annual upfront / member / month</th>
                </tr>
              </thead>
              <tbody>
                {monthlyTiers.map((t, i) => {
                  const from = i === 0 ? 1 : (monthlyTiers[i - 1].upTo ?? 0) + 1;
                  return (
                    <tr key={i} className="border-t border-border/60">
                      <td className="py-1 pr-2 text-muted-foreground">{bandLabel(from, t.upTo)}</td>
                      <td className="py-1 px-2 text-right font-medium text-foreground">{fmt(t.rate)}</td>
                      <td className="py-1 pl-2 text-right text-muted-foreground">
                        {fmt(annualTiers[i]?.rate ?? t.rate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="list-disc pl-5 text-muted-foreground space-y-1 text-xs">
            <li>
              Minimum charge of <strong className="text-foreground">{fmt(monthlyMin)}</strong> per month
              ({fmt(annualMin)} / month when paid annually in advance).
            </li>
            <li>Paying <strong className="text-foreground">annually in advance</strong> saves roughly 15% overall.</li>
            {cap && cap > 0 && (
              <li>
                Billing is <strong className="text-foreground">capped at {cap} active members</strong> — additional
                members are free.
              </li>
            )}
          </ul>
        </>
      ) : (
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li>
            <strong className="text-foreground">{fmt(flat.monthly)}</strong> per active member per month (billed
            monthly), or
          </li>
          <li>
            <strong className="text-foreground">{fmt(flat.annual)}</strong> per active member per month if paid{" "}
            <strong className="text-foreground">annually in advance</strong> (save {flat.savings} / member / year)
          </li>
          {cap && cap > 0 && (
            <li>
              Billing is <strong className="text-foreground">capped at {cap} active members</strong> per club —
              additional members are free.
            </li>
          )}
        </ul>
      )}

      <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded px-2 py-1.5">
        Fees are first invoiced from <strong>September 2026</strong> for the current financial year, and annually
        thereafter.
      </p>
      <p className="text-xs text-muted-foreground italic">
        Invoiced in your club currency ({clubCurrencyName} · {clubCurrencyCode}).
      </p>

      {typeof memberCount === "number" && billable !== null && (
        <div className="rounded border bg-background/60 p-2.5 text-xs space-y-1">
          <div className="text-muted-foreground">
            Your club currently has <strong className="text-foreground">{memberCount}</strong> active member
            {memberCount === 1 ? "" : "s"}
            {cap && cap > 0 && memberCount > cap && (
              <>
                {" "}— billed on <strong className="text-foreground">{cap}</strong> (cap)
              </>
            )}
            .
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <div className="text-muted-foreground">Estimated monthly</div>
              <div className="font-semibold text-foreground">
                {fmt(tiersEnabled ? monthly!.subtotal : billable * flat.monthly)}{" "}
                <span className="text-[10px] font-normal text-muted-foreground">/ month</span>
              </div>
              {tiersEnabled && billable > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  ≈ {fmt(monthly!.effectiveRate)} / member{monthly!.minApplied ? " (minimum applied)" : ""}
                </div>
              )}
            </div>
            <div>
              <div className="text-muted-foreground">Estimated annual (upfront)</div>
              <div className="font-semibold text-foreground">
                {fmt(tiersEnabled ? annual!.subtotal * 12 : billable * flat.annual * 12)}{" "}
                <span className="text-[10px] font-normal text-muted-foreground">/ year</span>
              </div>
              {tiersEnabled && billable > 0 && (
                <div className="text-[10px] text-muted-foreground">≈ {fmt(annual!.subtotal)} / month</div>
              )}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground pt-1">
            Estimates exclude VAT and update automatically as your membership changes.
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" asChild>
          <a href="/sla" target="_blank" rel="noopener noreferrer">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> View full SLA
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const w = window.open("/sla?print=1", "_blank");
            if (w) setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 800);
          }}
        >
          <Printer className="w-3.5 h-3.5 mr-1.5" /> Download / Print SLA
        </Button>
      </div>
    </div>
  );
}

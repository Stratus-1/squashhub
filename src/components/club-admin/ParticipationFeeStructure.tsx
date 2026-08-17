import { Button } from "@/components/ui/button";
import { FileText, Printer, Layers } from "lucide-react";
import { useClubCurrency } from "@/hooks/use-currency";
import { computeTieredCharge } from "@/lib/saas-tiers";
import { useSaasPricing } from "@/hooks/use-saas-pricing";

/**
 * Tenant-facing fee structure. Mirrors the platform's graduated ("sliding
 * scale") pricing, which applies to every club. All values are read live from
 * the platform pricing settings managed in Super Admin.
 */
export function ParticipationFeeStructure({
  memberCount,
  clubId,
}: {
  memberCount?: number | null;
  clubId?: string;
}) {
  const { code: clubCurrencyCode, name: clubCurrencyName } = useClubCurrency();
  const { startLabel, trialEndLabel } = useClubBillingStart(clubId);
  const { monthlyTiers, biannualTiers, annualTiers, monthlyMin, biannualMin, annualMin, cap, format: fmt } =
    useSaasPricing(clubCurrencyCode);


  const billable =
    typeof memberCount === "number"
      ? cap && cap > 0
        ? Math.min(memberCount, cap)
        : memberCount
      : null;

  const monthly = billable !== null ? computeTieredCharge(billable, monthlyTiers, monthlyMin) : null;
  const annual = billable !== null ? computeTieredCharge(billable, annualTiers, annualMin) : null;

  const bandLabel = (from: number, to: number | null) =>
    to == null ? `${from}+ members` : from === 1 ? `First ${to} members` : `Members ${from}–${to}`;


  return (
    <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-3">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <Layers className="w-4 h-4 text-primary" />
        Fee structure
      </div>

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
                  <th className="py-1 px-2 font-medium text-right">6-monthly / member / month</th>
                  <th className="py-1 pl-2 font-medium text-right">Annual / member / month</th>
                </tr>
              </thead>
              <tbody>
                {monthlyTiers.map((t, i) => {
                  const from = i === 0 ? 1 : (monthlyTiers[i - 1].upTo ?? 0) + 1;
                  return (
                    <tr key={i} className="border-t border-border/60">
                      <td className="py-1 pr-2 text-muted-foreground">{bandLabel(from, t.upTo)}</td>
                      <td className="py-1 px-2 text-right font-medium text-foreground">{fmt(t.rate)}</td>
                      <td className="py-1 px-2 text-right text-muted-foreground">
                        {fmt(biannualTiers[i]?.rate ?? t.rate)}
                      </td>
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
              ({fmt(biannualMin)} / month paid six-monthly, {fmt(annualMin)} / month paid annually in advance).
            </li>
            <li>
              Paying upfront saves off the monthly scale:{" "}
              <strong className="text-foreground">5% for six months</strong> in advance or{" "}
              <strong className="text-foreground">10% for a full year</strong>.
            </li>
            {cap && cap > 0 && (
              <li>
                Billing is <strong className="text-foreground">capped at {cap} active members</strong> — additional
                members are free.
              </li>
            )}
          </ul>
      </>


      <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded px-2 py-1.5">
        Fees are invoiced <strong>monthly in advance</strong>, with the first invoice issued on{" "}
        <strong>1 September 2026</strong>. Six-monthly or annual upfront payment can be requested
        on the Subscription tab. Payment can be made by <strong>EFT</strong> or by{" "}
        <strong>card</strong> — set your preferred method on the Subscription tab so we know how to
        bill you.
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
                {fmt(monthly!.subtotal)}{" "}
                <span className="text-[10px] font-normal text-muted-foreground">/ month</span>
              </div>
              {billable > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  ≈ {fmt(monthly!.effectiveRate)} / member{monthly!.minApplied ? " (minimum applied)" : ""}
                </div>
              )}
            </div>
            <div>
              <div className="text-muted-foreground">Estimated annual (upfront)</div>
              <div className="font-semibold text-foreground">
                {fmt(annual!.subtotal * 12)}{" "}
                <span className="text-[10px] font-normal text-muted-foreground">/ year</span>
              </div>
              {billable > 0 && (
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

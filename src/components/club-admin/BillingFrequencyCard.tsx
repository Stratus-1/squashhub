import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CalendarClock, Info } from "lucide-react";
import { toast } from "sonner";
import { useUpdateClub, type Club } from "@/hooks/use-club";
import { useClubCurrency } from "@/hooks/use-currency";
import { useSaasPricing } from "@/hooks/use-saas-pricing";
import { computeTieredCharge } from "@/lib/saas-tiers";


type BillingOption = "monthly" | "annual_upfront";

export interface BillingFrequencyInvoice {
  billing_cycle?: string | null;
  status?: string | null;
  period_end?: string | null;
}

/**
 * Lets the club choose how it wants to be invoiced — monthly in arrears or
 * annually upfront — quoting both amounts side by side. Future invoices are
 * generated at the chosen frequency.
 *
 * While on monthly, the switch-to-annual offer stays available every month.
 * Once an annual invoice has been issued/paid, the choice is locked until that
 * 12-month period ends (no invoices are raised in between).
 */
export function BillingFrequencyCard({
  club,
  invoices = [],
}: {
  club: Club;
  invoices?: BillingFrequencyInvoice[];
}) {
  const c = club as any;
  const updateClub = useUpdateClub();
  const { code: currencyCode } = useClubCurrency();
  const pricing = useSaasPricing(currencyCode);

  const current: BillingOption = c.sla_billing_option === "annual_upfront" ? "annual_upfront" : "monthly";
  const [choice, setChoice] = useState<BillingOption>(current);
  const [saving, setSaving] = useState(false);

  // Active annual cover = an annual invoice (not void) whose period is still running.
  const annualCoverUntil = (() => {
    const today = new Date().toISOString().slice(0, 10);
    const ends = invoices
      .filter(
        (i) =>
          (i.billing_cycle || "").toLowerCase() === "annual" &&
          (i.status || "").toLowerCase() !== "void" &&
          i.period_end &&
          i.period_end >= today
      )
      .map((i) => i.period_end as string)
      .sort();
    return ends.length ? ends[ends.length - 1] : null;
  })();
  const locked = !!annualCoverUntil;
  const allowAnnual = c.allow_annual_billing === true;

  // Live billable member count — active members only, visitors are never billed.
  const { data: memberCountData } = useQuery({
    queryKey: ["club-billable-member-count", club.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("club_members")
        .select("id", { count: "exact", head: true })
        .eq("club_id", club.id)
        .eq("status", "active")
        .neq("role", "visitor");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const memberCount: number | null =
    typeof memberCountData === "number"
      ? memberCountData
      : typeof c.active_member_count === "number"
        ? c.active_member_count
        : null;
  const billable =
    memberCount === null
      ? null
      : pricing.cap && pricing.cap > 0
        ? Math.min(memberCount, pricing.cap)
        : memberCount;


  const monthly = billable !== null ? computeTieredCharge(billable, pricing.monthlyTiers, pricing.monthlyMin) : null;
  const annual = billable !== null ? computeTieredCharge(billable, pricing.annualTiers, pricing.annualMin) : null;

  const monthlyTotal = monthly ? monthly.subtotal : null;
  const annualTotal = annual ? annual.subtotal * 12 : null;
  const saving12 = monthlyTotal != null && annualTotal != null ? monthlyTotal * 12 - annualTotal : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateClub.mutateAsync({ id: club.id, sla_billing_option: choice } as any);
      toast.success(
        choice === "annual_upfront"
          ? "Set to annual upfront — your next invoice will cover 12 months."
          : "Set to monthly — you'll be invoiced each month."
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to save billing frequency");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarClock className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Billing frequency</h3>
        <Badge variant="outline" className="text-[10px]">
          {current === "annual_upfront" ? "Annual upfront" : "Monthly"}
        </Badge>
        {locked && (
          <Badge variant="secondary" className="text-[10px]">
            Covered to {new Date(annualCoverUntil!).toLocaleDateString()}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {locked ? (
          <>
            You&apos;ve paid annually in advance — no further invoices until{" "}
            {new Date(annualCoverUntil!).toLocaleDateString()}. You can choose monthly or annual
            again when this period ends.
          </>
        ) : allowAnnual ? (
          <>
            Choose how you&apos;d like to be invoiced. While you&apos;re on monthly you can switch to
            annual upfront at any time — the option stays here every month. Annual upfront covers 12
            months in one invoice and works out cheaper per member.
          </>
        ) : (
          <>
            Your club is invoiced monthly in arrears, based on your member count at the time of each
            invoice. Annual upfront billing is enabled by SquashHub once your roster has settled —
            ask us if you&apos;d like it switched on.
          </>
        )}
      </p>


      <RadioGroup
        value={choice}
        onValueChange={(v) => setChoice(v as BillingOption)}
        disabled={locked}
        className="grid grid-cols-1 md:grid-cols-2 gap-2"
      >
        <label
          className={`flex items-start gap-2 rounded-md border p-3 ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${choice === "monthly" ? "border-primary bg-primary/5" : ""}`}
        >
          <RadioGroupItem value="monthly" id="freq-monthly" className="mt-0.5" disabled={locked} />

          <div className="text-sm flex-1">
            <div className="font-medium">Monthly</div>
            <div className="text-lg font-bold text-foreground">
              {monthlyTotal != null ? pricing.format(monthlyTotal) : "—"}
              <span className="text-[10px] font-normal text-muted-foreground"> / month</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Billed monthly in arrears
              {monthlyTotal != null && <> · {pricing.format(monthlyTotal * 12)} over 12 months</>}
            </div>
          </div>
        </label>

        {allowAnnual && (
          <label
            className={`flex items-start gap-2 rounded-md border p-3 ${locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${choice === "annual_upfront" ? "border-primary bg-primary/5" : ""}`}
          >
            <RadioGroupItem value="annual_upfront" id="freq-annual" className="mt-0.5" disabled={locked} />
            <div className="text-sm flex-1">
              <div className="font-medium">Annual upfront</div>
              <div className="text-lg font-bold text-foreground">
                {annualTotal != null ? pricing.format(annualTotal) : "—"}
                <span className="text-[10px] font-normal text-muted-foreground"> / year</span>
              </div>
              <div className="text-xs text-muted-foreground">
                One invoice, paid in advance
                {annual && <> · ≈ {pricing.format(annual.subtotal)} / month</>}
              </div>
              {saving12 != null && saving12 > 0 && (
                <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Save {pricing.format(saving12)} per year
                </div>
              )}
            </div>
          </label>
        )}
      </RadioGroup>

      {allowAnnual && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
          <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Annual true-up:</span> an annual invoice is
            priced on your member count on the day it&apos;s issued. If your membership changes by
            more than 10% during the year, the difference is reconciled on your next annual invoice
            (or credited if members drop).
          </p>
        </div>
      )}


      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={handleSave} disabled={locked || saving || choice === current}>
          {saving
            ? "Saving…"
            : locked
              ? "Locked until annual period ends"
              : choice === current
                ? "Current selection"
                : choice === "annual_upfront"
                  ? "Switch to annual upfront"
                  : "Switch to monthly"}
        </Button>

        <span className="text-[11px] text-muted-foreground">
          Estimates exclude VAT and are based on {memberCount ?? "your"} active member
          {memberCount === 1 ? "" : "s"}.
        </span>
      </div>
    </Card>
  );
}

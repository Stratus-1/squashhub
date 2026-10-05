import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { arrearsOfferOpen, recurringGatewayFor, useClubRecurringSettings, clubRecurringAvailable } from "@/lib/recurring-payments";

const money = (n: number) => `R${n.toFixed(2)}`;
const DISMISS_DAYS = 7;

/**
 * On-screen prompt shown when the club offers monthly payment of outstanding
 * balances and the member qualifies (uncovered debt, no active plan yet).
 * Members with a monthly payment are asked to increase it; others to set one up.
 */
export default function RecurringOfferPrompt({ club, clubMemberId }: { club: any; clubMemberId?: string | null }) {
  const navigate = useNavigate();
  const clubId = club?.id as string | undefined;
  const { data: settings } = useClubRecurringSettings(clubId);
  const gateway = recurringGatewayFor(club);
  const available = clubRecurringAvailable(gateway, settings);

  const { data } = useQuery({
    queryKey: ["recurring-offer-prompt", clubMemberId],
    enabled: !!clubMemberId && available && !!settings?.arrears_enabled,
    queryFn: async () => {
      const [{ data: b }, { data: plans }] = await Promise.all([
        (supabase as any).rpc("member_outstanding_breakdown", { p_club_member_id: clubMemberId }),
        (supabase as any).from("mandate_arrears_plans").select("id").eq("club_member_id", clubMemberId).eq("status", "active").limit(1),
      ]);
      return { uncovered: Number(b?.uncovered || 0), hasFeePlan: !!b?.has_fee_plan, hasPlan: (plans || []).length > 0 };
    },
  });

  const key = clubMemberId ? `sh.recurringOffer.dismissed.${clubMemberId}` : "";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!data || !key || data.hasPlan || !arrearsOfferOpen(settings, data.uncovered)) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const { at, amount } = JSON.parse(raw);
        // Re-prompt after a week, or sooner if the balance has grown.
        if (Date.now() - at < DISMISS_DAYS * 864e5 && data.uncovered <= Number(amount) + 0.005) return;
      }
    } catch { /* ignore */ }
    setOpen(true);
  }, [data, key, settings]);

  if (!data) return null;
  const dismiss = () => {
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), amount: data.uncovered })); } catch { /* ignore */ }
    setOpen(false);
  };
  const go = (path: string) => { setOpen(false); navigate(path); };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-lg border-destructive/60">
        <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-lg bg-destructive" aria-hidden />
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            Pay your outstanding balance monthly
          </DialogTitle>
          <DialogDescription className="text-foreground/90">
            You have{" "}
            <span className="inline-block rounded bg-destructive/10 px-1.5 py-0.5 font-bold text-destructive">
              {money(data.uncovered)} outstanding
            </span>{" "}
            (bar, court lights, bookings, tournaments, opening balance and other charges).
            {data.hasFeePlan
              ? " Your club lets you add it to your existing monthly payment. Your membership amount stays the same, and the extra stops once the balance is paid."
              : " Your club lets you spread it over a few months with a monthly payment."}
            {settings?.arrears_until ? ` Offer open until ${settings.arrears_until}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="ghost" onClick={dismiss}>Dismiss</Button>
          <Button variant="outline" onClick={() => go("/my-account")}>Go to My Account</Button>
          <Button variant="destructive" onClick={() => go("/my-account#recurring-payments")}>
            {data.hasFeePlan ? "Increase monthly payment" : "Set up monthly payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle } from "lucide-react";
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

  // Shown on every visit (once per app session) until a monthly plan exists
  // or the balance is settled — it can be closed for now, never permanently.
  const key = clubMemberId ? `sh.recurringOffer.seen.${clubMemberId}` : "";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!data || !key || data.hasPlan || !arrearsOfferOpen(settings, data.uncovered)) return;
    try { if (sessionStorage.getItem(key)) return; } catch { /* ignore */ }
    setOpen(true);
  }, [data, key, settings]);

  if (!data) return null;
  const dismiss = () => {
    try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
    setOpen(false);
  };
  const until = settings?.arrears_until
    ? new Date(`${settings.arrears_until}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const go = (path: string) => { dismiss(); navigate(path); };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-lg border-destructive/60">
        <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-lg bg-destructive" aria-hidden />
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            Outstanding balance — action required
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-foreground/90">
              <p>
                Your account shows an outstanding balance of{" "}
                <span className="inline-block rounded bg-destructive/10 px-1.5 py-0.5 font-bold text-destructive">{money(data.uncovered)}</span>.
                This amount must be settled.
              </p>
              <p>You can settle it in one of two ways:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li><strong>Once-off:</strong> top up your account with the full amount (EFT with proof of payment, or pay online).</li>
                <li>
                  <strong>Monthly:</strong>{" "}
                  {data.hasFeePlan
                    ? "add it to your existing monthly payment — the extra stops once the balance is paid."
                    : `spread it over up to ${settings?.arrears_max_months ?? ""} months with a monthly debit order.`}
                  {until ? ` This option is available until ${until}.` : ""}
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">This reminder will show each time you open the app until the balance is paid or a monthly payment is set up.</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="ghost" onClick={dismiss}>Remind me next time</Button>
          <Button variant="outline" onClick={() => go("/my-account")}>Top up once-off</Button>
          <Button variant="destructive" onClick={() => go("/my-account#recurring-payments")}>
            {data.hasFeePlan ? "Increase monthly payment" : "Set up monthly payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

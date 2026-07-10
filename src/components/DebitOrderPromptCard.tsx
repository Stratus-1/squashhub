import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banknote, X } from "lucide-react";

const DISMISS_KEY = "sh.debit.prompt.dismissedUntil";
const MIN_OUTSTANDING_RAND = 500;

/**
 * Shows the "Switch to a monthly debit order" prompt only when:
 *  1. The club's active payment gateway is Stitch.
 *  2. The member has no active/pending Stitch mandate.
 *  3. At least R500 is outstanding on fees whose category is flagged
 *     `debit_order_eligible = true` (i.e. actually pullable by Stitch).
 *
 * Non-eligible fees (once/off, EFT-only, etc.) never trigger the prompt.
 */
export default function DebitOrderPromptCard({ clubMemberId }: { clubMemberId: string | null | undefined }) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const until = localStorage.getItem(DISMISS_KEY);
    if (until && Date.now() < Number(until)) setHidden(true);
  }, []);

  const { data } = useQuery({
    enabled: !!clubMemberId,
    queryKey: ["debit-prompt", clubMemberId],
    queryFn: async () => {
      // 1) Look up the member's club so we can check the gateway + eligible fee labels.
      const { data: member } = await supabase
        .from("club_members")
        .select("club_id")
        .eq("id", clubMemberId!)
        .maybeSingle();
      const clubId = member?.club_id;
      if (!clubId) return { eligible: false, outstanding: 0 };

      const [clubRes, mandateRes, catRes, assocRes, nbRes, feesRes] = await Promise.all([
        supabase.from("clubs").select("payment_gateway").eq("id", clubId).maybeSingle(),
        fromExt("stitch_mandates").select("id, status")
          .eq("club_member_id", clubMemberId!).in("status", ["active", "pending"]).limit(1),
        fromExt("member_fee_categories").select("name")
          .eq("club_id", clubId).eq("debit_order_eligible", true),
        fromExt("league_associations").select("name, abbreviation")
          .eq("club_id", clubId).eq("debit_order_eligible", true),
        fromExt("national_body_fees").select("body_name, abbreviation")
          .eq("club_id", clubId).eq("debit_order_eligible", true),
        supabase.from("club_member_fee_payments").select("amount, fee_label")
          .eq("club_member_id", clubMemberId!).eq("paid", false),
      ]);

      // Gate 1: Stitch must be the club's active gateway.
      if (String(clubRes.data?.payment_gateway || "").toLowerCase() !== "stitch") {
        return { eligible: false, outstanding: 0 };
      }
      // Gate 2: no active/pending mandate already.
      if ((mandateRes.data || []).length > 0) {
        return { eligible: false, outstanding: 0 };
      }

      // Build the eligible-label set (lowercased for match).
      const labels = new Set<string>();
      (catRes.data || []).forEach((r: any) => r.name && labels.add(String(r.name).toLowerCase()));
      (assocRes.data || []).forEach((r: any) => {
        if (r.name) labels.add(String(r.name).toLowerCase());
        if (r.abbreviation) labels.add(String(r.abbreviation).toLowerCase());
      });
      (nbRes.data || []).forEach((r: any) => {
        if (r.body_name) labels.add(String(r.body_name).toLowerCase());
        if (r.abbreviation) labels.add(String(r.abbreviation).toLowerCase());
      });

      // Sum only unpaid fees whose label matches a debit-order-eligible source.
      const outstanding = (feesRes.data || []).reduce((sum, f: any) => {
        const lbl = String(f.fee_label || "").toLowerCase();
        if (!lbl) return sum;
        for (const el of labels) {
          if (lbl === el || lbl.includes(el)) return sum + Number(f.amount || 0);
        }
        return sum;
      }, 0);

      return { eligible: true, outstanding };
    },
  });

  const visible = useMemo(() => {
    if (hidden || !data || !data.eligible) return false;
    return data.outstanding >= MIN_OUTSTANDING_RAND;
  }, [hidden, data]);

  if (!visible) return null;

  const dismiss = () => {
    const until = Date.now() + 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
    setHidden(true);
  };

  return (
    <Card className="p-3 border-sky-500/40 bg-sky-500/5">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-sky-500/15 p-2"><Banknote className="h-4 w-4 text-sky-700 dark:text-sky-400" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Switch to monthly card payment</div>
          <p className="text-xs text-muted-foreground">
            You have R{data!.outstanding.toFixed(0)} outstanding on fees eligible for automatic monthly card charges via Stitch. Set it up once and never miss a fee again.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => navigate("/account#payment-methods")}>Set up</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={dismiss}>Not now</Button>
          </div>
        </div>
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
      </div>
    </Card>
  );
}

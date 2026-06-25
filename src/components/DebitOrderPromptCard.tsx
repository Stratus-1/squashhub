import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banknote, X } from "lucide-react";

const DISMISS_KEY = "sh.debit.prompt.dismissedUntil";
const MIN_OUTSTANDING_RAND = 100;

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
      const [mandateRes, feesRes] = await Promise.all([
        supabase.from("stitch_mandates").select("id, status")
          .eq("club_member_id", clubMemberId!).in("status", ["active", "pending"]).limit(1),
        supabase.from("club_member_fee_payments").select("amount")
          .eq("club_member_id", clubMemberId!).eq("paid", false),
      ]);
      const hasMandate = (mandateRes.data || []).length > 0;
      const outstanding = (feesRes.data || []).reduce((s, f: any) => s + Number(f.amount || 0), 0);
      return { hasMandate, outstanding };
    },
  });

  const visible = useMemo(() => {
    if (hidden || !data) return false;
    if (data.hasMandate) return false;
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
          <div className="text-sm font-semibold">Switch to a monthly debit order</div>
          <p className="text-xs text-muted-foreground">
            You have R{data!.outstanding.toFixed(0)} outstanding. Set up an automatic debit and never miss a fee again.
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

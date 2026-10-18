import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Repeat } from "lucide-react";
import { useClubCurrency } from "@/hooks/use-currency";
import { FREQUENCY_LABEL, type RecurringFrequency } from "@/lib/finance/recurring";

type Row = { id: string; direction: string; amount: number; description: string; frequency: RecurringFrequency; next_due: string; method: string };

/** Recurring transactions that have reached their next date wait here for finance approval. */
export function RecurringPendingPanel({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { format: money } = useClubCurrency();
  const today = format(new Date(), "yyyy-MM-dd");
  const [edits, setEdits] = useState<Record<string, { date?: string; amount?: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { data: rows = [] } = useQuery({
    queryKey: ["recurring-due", clubId, today],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase as any).from("club_recurring_transactions")
        .select("id, direction, amount, description, frequency, next_due, method")
        .eq("club_id", clubId).eq("active", true).lte("next_due", today).order("next_due");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clubId,
  });
  if (!rows.length) return null;

  const decide = async (r: Row, approve: boolean) => {
    const e = edits[r.id] || {};
    const amount = e.amount != null ? parseFloat(e.amount) : Number(r.amount);
    if (approve && !(amount > 0)) return toast.error("Enter a valid amount");
    setBusy(r.id);
    const { error } = await (supabase as any).rpc("decide_recurring_transaction", {
      _id: r.id, _expected_due: r.next_due, _approve: approve, _amount: amount, _date: e.date || r.next_due,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(approve ? "Transaction approved and recorded" : "Occurrence skipped");
    setEdits(p => { const n = { ...p }; delete n[r.id]; return n; });
    qc.invalidateQueries({ queryKey: ["recurring-due"] });
    qc.invalidateQueries({ queryKey: ["club-journal-entries"] });
  };

  const stop = async (r: Row) => {
    if (!confirm(`Stop "${r.description}" from repeating? Past entries stay.`)) return;
    const { error } = await (supabase as any).from("club_recurring_transactions").update({ active: false }).eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["recurring-due"] });
  };

  return (
    <section className="border border-primary/40 rounded-lg p-3 space-y-2" aria-label="Recurring transactions pending approval">
      <h4 className="text-xs font-bold flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" />Recurring transactions waiting for approval ({rows.length})</h4>
      {rows.map(r => {
        const e = edits[r.id] || {};
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs border-t pt-2">
            <span className="flex-1 min-w-[160px]">
              <span className="font-medium">{r.description}</span>{" "}
              <Badge variant="outline" className="text-[10px]">{FREQUENCY_LABEL[r.frequency]}</Badge>{" "}
              <span className="text-muted-foreground">{r.direction === "income" ? "Money in" : "Money out"} · due {r.next_due} · {money(Number(r.amount))}</span>
            </span>
            <Input type="date" aria-label="Date" className="h-8 w-[140px] text-xs" value={e.date ?? r.next_due}
              onChange={ev => setEdits(p => ({ ...p, [r.id]: { ...p[r.id], date: ev.target.value } }))} />
            <Input type="number" min={0} step={0.01} aria-label="Amount" className="h-8 w-[100px] text-xs" value={e.amount ?? Number(r.amount).toFixed(2)}
              onChange={ev => setEdits(p => ({ ...p, [r.id]: { ...p[r.id], amount: ev.target.value } }))} />
            <Button size="sm" className="h-8" disabled={busy === r.id} onClick={() => decide(r, true)}>Approve</Button>
            <Button size="sm" variant="outline" className="h-8" disabled={busy === r.id} onClick={() => decide(r, false)}>Skip</Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => stop(r)}>Stop repeating</Button>
          </div>
        );
      })}
    </section>
  );
}

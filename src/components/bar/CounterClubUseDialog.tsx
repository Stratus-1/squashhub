import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gift, Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

interface StockItem { id: string; name: string; item_kind?: string | null; division?: string | null; avg_unit_cost?: number | null; cost_price?: number | null; unit_yield?: number | null; club_use_unit_cost?: number | null }
const money = (n: number) => `R${n.toFixed(2)}`;
// Cost per sold unit at cost price: average stock-unit cost when known, else purchase price spread over the yield.
export function clubUseUnitCost(i: StockItem) {
  if (i.club_use_unit_cost != null) return Number(i.club_use_unit_cost);
  if (i.item_kind === "special") return null;
  const y = Math.max(1, Number(i.unit_yield || 1));
  const perStockUnit = i.avg_unit_cost != null ? Number(i.avg_unit_cost) : Number(i.cost_price || 0) / y;
  return y * perStockUnit;
}
export function CounterClubUseDialog({ token, operator, items, onClose }: { token: string; operator: string; items: StockItem[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<{ id: string; signature: string } | null>(null);
  const stock = useMemo(() => items.filter(i => i.item_kind === "stock" || i.item_kind === "special"), [items]);
  const lines = stock.filter(i => (quantities[i.id] ?? 0) > 0).map(i => ({ item_id: i.id, quantity: quantities[i.id] })).sort((a, b) => a.item_id.localeCompare(b.item_id));
  const totalCost = useMemo(() => {
    const selected = stock.filter(i => (quantities[i.id] ?? 0) > 0);
    if (selected.some(i => clubUseUnitCost(i) == null)) return null;
    return Math.round(selected.reduce((sum, i) => sum + (quantities[i.id] ?? 0) * (clubUseUnitCost(i) ?? 0), 0) * 100) / 100;
  }, [stock, quantities]);
  async function record() {
    if (!lines.length || !reason.trim() || busy) return;
    const signature = JSON.stringify({ lines, reason: reason.trim() });
    if (attempt && attempt.signature !== signature) {
      toast.error("Retry the original basket first, or reopen this window for a different entry.");
      return;
    }
    const request = attempt ?? { id: crypto.randomUUID(), signature };
    setAttempt(request); setBusy(true);
    try {
      const { data, error } = await supabase.rpc("bar_counter_club_use", { _token: token, _lines: lines, _reason: reason.trim(), _request_id: request.id });
      if (error) throw error;
      await Promise.all(["bar-counter-board", "bar-items", "bar-stock-levels", "bar-club-use-history", "bar-club-use-items", "income-statement"].map(key => qc.invalidateQueries({ queryKey: [key] })));
      const recordedCost = data && typeof data === "object" && !Array.isArray(data) ? Number(data.cost) : totalCost;
      toast.success(recordedCost != null && Number.isFinite(recordedCost) ? `Club-sponsored stock recorded (${money(recordedCost)} at cost)` : "Club-sponsored stock recorded");
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not record club use. Retry the same basket."); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Club sponsored — no charge</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Serving: {operator}</p>
      <Input aria-label="Find sponsored item" placeholder="Find sponsored item" value={search} disabled={busy || !!attempt} onChange={e => setSearch(e.target.value)} />
      <div className="max-h-72 overflow-y-auto space-y-2">
        {stock.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).map(i => <div key={i.id} className="flex items-center justify-between gap-3 border-b py-2">
          <span className="text-sm min-w-0">{i.name}<span className="text-muted-foreground"> · {i.division === "shop" ? "Shop" : "Bar"} · {clubUseUnitCost(i) == null ? "Component cost unavailable" : `cost ${money(clubUseUnitCost(i) ?? 0)}`}</span></span>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`Remove ${i.name}`} disabled={busy || !!attempt || !quantities[i.id]} onClick={() => setQuantities(q => ({ ...q, [i.id]: Math.max(0, (q[i.id] ?? 0) - 1) }))}><Minus className="h-4 w-4" /></Button>
            <span className="w-8 text-center tabular-nums">{quantities[i.id] ?? 0}</span>
            <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`Add ${i.name}`} disabled={busy || !!attempt} onClick={() => setQuantities(q => ({ ...q, [i.id]: (q[i.id] ?? 0) + 1 }))}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>)}
        {!stock.length && <p className="text-sm text-muted-foreground">No stock products available.</p>}
      </div>
      {lines.length > 0 && <p className="text-sm">Cost to club (income statement): <span className="font-medium tabular-nums">{totalCost == null ? "Component cost unavailable" : money(totalCost)}</span></p>}
      <Label htmlFor="counter-club-use-reason">Used for</Label>
      <Input id="counter-club-use-reason" placeholder="e.g. Club Champs balls" maxLength={120} value={reason} disabled={busy || !!attempt} onChange={e => setReason(e.target.value)} />
      <Button disabled={busy || !lines.length || !reason.trim()} onClick={record} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}Record club use</Button>
    </DialogContent>
  </Dialog>;
}
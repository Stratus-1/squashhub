/**
 * Club-sponsored stock (e.g. tournament balls taken from the shop or bar).
 * Reduces stock and moves its cost (at cost price) into "Stock club expense".
 * Never a sale: no income, cash-up, tips or member charge.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { Gift, Loader2 } from "lucide-react";
import { useClubCurrency } from "@/hooks/use-currency";

const db = supabase as any;

export function ClubUseCard({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { format: money } = useClubCurrency();
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["bar-club-use-items", clubId],
    queryFn: async () => (await db.from("bar_items").select("id,name,division,unit_yield,stock_units,avg_unit_cost,cost_price")
      .eq("club_id", clubId).eq("item_kind", "stock").order("name")).data ?? [],
  });

  const { data: history = [] } = useQuery({
    queryKey: ["bar-club-use-history", clubId],
    queryFn: async () => (await db.from("bar_stock_movements").select("id,created_at,note,cost_value")
      .eq("club_id", clubId).eq("reason", "club_use").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  const item = useMemo(() => items.find((i: any) => i.id === itemId), [items, itemId]);
  const estCost = useMemo(() => {
    if (!item || !Number(qty)) return null;
    const y = Math.max(1, item.unit_yield || 1);
    const unit = item.avg_unit_cost ?? (Number(item.cost_price || 0) / y);
    return Math.round(Number(qty) * y * Number(unit || 0) * 100) / 100;
  }, [item, qty]);

  async function submit() {
    setBusy(true);
    try {
      const { data, error } = await db.rpc("bar_club_use", { _item: itemId, _qty: Number(qty), _reason: reason });
      if (error) throw error;
      toast.success(`Recorded as club expense${data?.cost ? ` (${money(Number(data.cost), 2)} at cost)` : ""}`);
      setQty(""); setReason(""); setItemId("");
      ["bar-club-use-items", "bar-club-use-history", "bar-stock-levels", "bar-items", "income-statement"]
        .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e: any) {
      toast.error(e.message ?? "Could not record club use");
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2"><Gift className="w-4 h-4" /> Club-sponsored items</h3>
        <p className="text-xs text-muted-foreground">
          Items the club gives away (e.g. tournament balls). Stock goes down and the cost price is booked to
          "Stock club expense". It is not a sale, so sales, cash-ups and tips are not affected.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[2fr_100px_2fr_auto] items-end">
        <div>
          <Label className="text-[11px]">Item</Label>
          <select aria-label="Item" className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Choose item…</option>
            {items.map((i: any) => (
              <option key={i.id} value={i.id}>{i.name}{i.division === "shop" ? " (shop)" : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[11px]">Quantity</Label>
          <Input inputMode="decimal" className="h-9" value={qty} aria-label="Quantity"
            onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
        <div>
          <Label className="text-[11px]">Used for</Label>
          <Input className="h-9" value={reason} placeholder="e.g. Club Champs balls" aria-label="Used for"
            onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button className="h-9" disabled={busy || !itemId || !(Number(qty) > 0) || !reason.trim()} onClick={submit}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Record club use"}
        </Button>
      </div>
      {estCost !== null && <p className="text-xs text-muted-foreground">Cost to club: about {money(estCost, 2)}</p>}
      {history.length > 0 && (
        <div className="text-xs grid gap-1 border-t pt-2">
          {history.map((h: any) => (
            <div key={h.id} className="flex justify-between gap-2">
              <span className="truncate">{format(new Date(h.created_at), "d MMM HH:mm")} · {h.note || "Club use"}</span>
              <span className="tabular-nums">{h.cost_value != null ? money(Math.abs(Number(h.cost_value)), 2) : "—"}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * Optional weighted-average costing: per-club switch, average cost per stock product,
 * explicit audited cost adjustments, movement history with costs, and cost of sales.
 * All numbers come from database snapshots; nothing here recomputes history.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useClubCurrency } from "@/hooks/use-currency";
import { grossProfit, perContainer, REASON_LABELS } from "@/lib/bar-costing";

const db = supabase as any;

export function CostingTab({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { format: money } = useClubCurrency();
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [edit, setEdit] = useState<{ id: string; cost: string; note: string } | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["bar-costing-settings", clubId],
    queryFn: async () => (await db.from("club_bar_settings").select("*").eq("club_id", clubId).maybeSingle()).data,
  });
  const enabled = !!settings?.costing_enabled;

  const { data: items = [] } = useQuery({
    queryKey: ["bar-costing-items", clubId],
    enabled,
    queryFn: async () => (await db.from("bar_items")
      .select("id,name,category,unit_yield,stock_units,stock_measure,avg_unit_cost,stock_unit_label")
      .eq("club_id", clubId).eq("item_kind", "stock").is("archived_at", null).order("name")).data ?? [],
  });

  const { data: moves = [] } = useQuery({
    queryKey: ["bar-costing-moves", clubId],
    enabled,
    queryFn: async () => (await db.from("bar_stock_movements")
      .select("id,created_at,reason,units_delta,unit_cost,cost_value,avg_cost_before,avg_cost_after,note,bar_items!bar_stock_movements_bar_item_id_fkey(name,unit_yield)")
      .eq("club_id", clubId).order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  const { data: report = [] } = useQuery({
    queryKey: ["bar-cogs", clubId, from, to],
    enabled,
    queryFn: async () => {
      const end = new Date(to); end.setDate(end.getDate() + 1);
      const { data, error } = await db.rpc("bar_cost_of_sales", { _club: clubId, _from: new Date(from).toISOString(), _to: end.toISOString() });
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = async (on: boolean) => {
    const { error } = await db.from("club_bar_settings").upsert({ club_id: clubId, costing_enabled: on });
    if (error) return toast.error(error.message);
    toast.success(on ? "Stock costing switched on" : "Stock costing switched off");
    qc.invalidateQueries({ queryKey: ["bar-costing-settings", clubId] });
  };

  const saveCost = async () => {
    if (!edit) return;
    const { error } = await db.rpc("bar_set_average_cost", { _item: edit.id, _cost_per_purchase_unit: Number(edit.cost), _note: edit.note });
    if (error) return toast.error(error.message);
    toast.success("Average cost updated");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["bar-costing-items", clubId] });
    qc.invalidateQueries({ queryKey: ["bar-costing-moves", clubId] });
  };

  const unitName = (i: any) => i.stock_measure === "volume" ? "litre" : i.stock_measure === "bottle" ? "bottle" : "unit";
  const totals = report.reduce((a: any, r: any) => ({ revenue: a.revenue + Number(r.revenue), cogs: a.cogs + Number(r.cogs) }), { revenue: 0, cogs: 0 });
  const gp = grossProfit(totals.revenue, totals.cogs);
  const pct = (m: number | null) => m == null ? "—" : `${(m * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm">Stock costing (average cost)</h3>
          <p className="text-xs text-muted-foreground">
            Optional. When on, each purchase updates the product's average cost, and every sale records its cost at that moment
            for cost-of-sales and margin reports. Stock counts never change the cost. Switching off keeps all recorded history.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} aria-label="Stock costing" />
      </Card>

      {enabled && (
        <>
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-sm">Average cost per product</h3>
            <p className="text-xs text-muted-foreground">Set automatically by purchases. "Set cost" is for an opening cost or a correction and needs a reason.</p>
            <div className="divide-y">
              {items.map((i: any) => {
                const y = i.unit_yield || 1;
                const c = perContainer(i.avg_unit_cost, y);
                return (
                  <div key={i.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="flex-1 min-w-[10rem] font-medium">{i.name}</span>
                    <span className="text-muted-foreground">
                      {c == null ? "No cost yet" : `${money(c)} / ${unitName(i)}`}
                      {c != null && y > 1 && ` · ${money(i.avg_unit_cost)} / ${i.stock_measure === "volume" ? "ml" : (i.stock_unit_label || "tot")}`}
                    </span>
                    {edit?.id === i.id ? (
                      <div className="flex flex-wrap gap-2 w-full">
                        <Input className="w-28" type="number" min={0} step="any" placeholder={`Cost / ${unitName(i)}`} value={edit.cost} onChange={e => setEdit({ ...edit, cost: e.target.value })} />
                        <Input className="flex-1 min-w-[10rem]" placeholder="Reason (required)" value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} />
                        <Button size="sm" onClick={saveCost} disabled={!edit.cost || !edit.note.trim()}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setEdit({ id: i.id, cost: c != null ? c.toFixed(2) : "", note: "" })}>Set cost</Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="font-semibold text-sm">Cost of sales</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
              <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div><p className="text-xs text-muted-foreground">Sales</p><p className="font-semibold">{money(totals.revenue)}</p></div>
              <div><p className="text-xs text-muted-foreground">Cost of sales</p><p className="font-semibold">{money(totals.cogs)}</p></div>
              <div><p className="text-xs text-muted-foreground">Gross profit</p><p className="font-semibold">{money(gp.profit)}</p></div>
              <div><p className="text-xs text-muted-foreground">Gross margin</p><p className="font-semibold">{pct(gp.margin)}</p></div>
            </div>
            <div className="divide-y text-sm">
              {report.length === 0 && <p className="text-xs text-muted-foreground py-2">No sales in this period.</p>}
              {report.map((r: any) => {
                const g = grossProfit(Number(r.revenue), Number(r.cogs));
                return (
                  <div key={r.sold_item_id} className="py-2 flex flex-wrap gap-x-3">
                    <span className="flex-1 min-w-[10rem]">{r.item_name} <span className="text-xs text-muted-foreground">× {Number(r.quantity)}</span></span>
                    <span>{money(Number(r.revenue))}</span>
                    <span className="text-muted-foreground">cost {money(Number(r.cogs))}</span>
                    <span>{pct(g.margin)}</span>
                    {r.uncosted_lines > 0 && <span className="text-xs text-destructive w-full">{r.uncosted_lines} sale(s) had no cost recorded</span>}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-sm">Stock history</h3>
            <div className="divide-y text-xs">
              {moves.map((m: any) => (
                <div key={m.id} className="py-1.5 flex flex-wrap gap-x-3">
                  <span className="text-muted-foreground w-28">{format(new Date(m.created_at), "dd MMM HH:mm")}</span>
                  <span className="w-36">{REASON_LABELS[m.reason] ?? m.reason}</span>
                  <span className="flex-1 min-w-[8rem]">{m.bar_items?.name}</span>
                  <span>{m.units_delta > 0 ? "+" : ""}{m.units_delta}</span>
                  <span className="text-muted-foreground">{m.cost_value == null ? "no cost" : money(Number(m.cost_value))}</span>
                  {m.avg_cost_before !== m.avg_cost_after && m.avg_cost_after != null && (
                    <span className="text-muted-foreground">avg → {money(Number(m.avg_cost_after) * (m.bar_items?.unit_yield || 1))}</span>
                  )}
                  {m.note && <span className="w-full text-muted-foreground">{m.note}</span>}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

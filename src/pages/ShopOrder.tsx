import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Ruler, Shirt, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useClubContext } from "@/contexts/ClubContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useHasPermission } from "@/hooks/use-club-permissions";
import { useClubCurrency } from "@/hooks/use-currency";
import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { placeMemberCounterOrder } from "@/lib/bar/member-tab-handoff";
import { showBarChargeError } from "@/lib/bar-charge-toast";
import {
  BACK_NAME_MAX, lineError, orderTotal, parseGarmentOptions, sizeCounts,
  type GarmentLine, type GarmentOptions,
} from "@/lib/shop/garment-order";

const STATUS: Record<string, string> = {
  awaiting_payment: "Awaiting payment", ordered: "Ordered (paid)", with_printer: "With printer", ready: "Ready for collection", collected: "Collected", cancelled: "Cancelled",
};
type Item = { id: string; name: string; price: number; image_url: string | null; order_options: unknown };
type OrderRow = { id: string; fit: string; size: string; back_name: string; unit_price: number; status: string; created_at: string; club_member_id: string; bar_item_id: string; club_members?: { name: string | null } | null };

export default function ShopOrder() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { club } = useClubContext();
  const { activeMember } = useMemberContext();
  const canManage = useHasPermission("bar" as never);
  const { format: fmtMoney } = useClubCurrency();
  const money = (n: number) => fmtMoney(n, 2);
  const clubId = club?.id;
  const memberId = activeMember?.id;

  const { data: items = [] } = useQuery({
    queryKey: ["shop-garments", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("bar_items")
        .select("id,name,price,image_url,order_options").eq("club_id", clubId).eq("active", true)
        .is("archived_at", null).not("order_options", "is", null).order("sort_order");
      if (error) throw error;
      return (data || []) as Item[];
    },
  });
  const item = items.find(i => i.id === params.get("item")) ?? items[0];
  const opts = parseGarmentOptions(item?.order_options);

  const { data: myOrders = [] } = useQuery({
    queryKey: ["shop-my-orders", memberId],
    enabled: !!memberId && !!clubId,
    queryFn: async () => {
      await (supabase as any).rpc("shop_reconcile_order_payments", { _club_id: clubId });
      const { data, error } = await (supabase as any).from("shop_orders").select("*").eq("club_member_id", memberId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OrderRow[];
    },
  });

  if (!clubId) return null;
  return (
    <div className="bottom-nav-safe">
      <SEO title="Club shop" description="Order club clothing" path="/shop" noIndex />
      <PageHeader title="Club shop" backTo="/honesty-bar" />
      <div className="px-4 mt-2 max-w-3xl mx-auto">
        <Tabs defaultValue="order">
          <TabsList>
            <TabsTrigger value="order">Order</TabsTrigger>
            <TabsTrigger value="mine">My orders ({myOrders.filter(o => o.status !== "cancelled").length})</TabsTrigger>
            {canManage && <TabsTrigger value="club">Club orders</TabsTrigger>}
          </TabsList>
          <TabsContent value="order">
            {!item || !opts ? (
              <Card className="p-6 text-center text-muted-foreground">There is nothing to order at the moment.</Card>
            ) : (<>
              {items.length > 1 && (
                <div className="flex gap-2 mb-3 overflow-x-auto">
                  {items.map(i => (
                    <Button key={i.id} size="sm" variant={i.id === item.id ? "default" : "outline"}
                      onClick={() => setParams(prev => { const n = new URLSearchParams(prev); n.set("item", i.id); return n; }, { replace: true })}>{i.name}</Button>
                  ))}
                </div>
              )}
              <OrderForm key={item.id} item={item} opts={opts} clubId={clubId} memberId={memberId} memberName={activeMember?.name || ""}
                money={money} onDone={(dest) => { qc.invalidateQueries({ queryKey: ["shop-my-orders"] }); navigate(dest); }} />
            </>)}
          </TabsContent>
          <TabsContent value="mine">
            <Card className="divide-y">
              {myOrders.length === 0 && <p className="p-4 text-muted-foreground">No orders yet.</p>}
              {myOrders.map(o => (
                <div key={o.id} className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">"{o.back_name}" · {fitLabel(items, o.bar_item_id, o.fit)} {o.size}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(o.created_at), "d MMM yyyy")} · {money(Number(o.unit_price))}</div>
                  </div>
                  <Badge variant={o.status === "ready" ? "default" : "secondary"}>{STATUS[o.status]}</Badge>
                </div>
              ))}
            </Card>
          </TabsContent>
          {canManage && <TabsContent value="club"><ClubOrders clubId={clubId} items={items} money={money} /></TabsContent>}
        </Tabs>
      </div>
    </div>
  );
}

function fitLabel(items: Item[], itemId: string, fit: string) {
  const o = parseGarmentOptions(items.find(i => i.id === itemId)?.order_options);
  return o?.fits.find(f => f.key === fit)?.label ?? fit;
}

function OrderForm({ item, opts, clubId, memberId, memberName, money, onDone }: {
  item: Item; opts: GarmentOptions; clubId: string; memberId?: string; memberName: string;
  money: (n: number) => string; onDone: (dest: string) => void;
}) {
  const blank = (name = ""): GarmentLine & { confirmed: boolean } => ({ fit: opts.fits[0].key, size: "", back_name: name, confirmed: false });
  const [lines, setLines] = useState([blank(memberName.toUpperCase())]);
  const [chartFit, setChartFit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string>(crypto.randomUUID());
  const total = orderTotal(lines.length, Number(item.price));
  const needName = opts.back_name !== false;
  const unit = opts.unit || "shirt";
  const choiceLabel = opts.choice_label || "Fit";
  const errors = lines.map(l => lineError(l, opts) ?? (l.confirmed || !needName ? null : "Confirm the name on the back"));
  const set = (i: number, patch: Partial<GarmentLine & { confirmed: boolean }>) =>
    setLines(prev => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    if (!memberId) { toast.error("Please log in again to place this order."); return; }
    if (errors.some(Boolean)) { toast.error(errors.find(Boolean)!); return; }
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("shop_place_order", {
        _club_member_id: memberId, _bar_item_id: item.id, _request_id: requestId.current,
        _lines: lines.map(({ fit, size, back_name }) => ({ fit, size, back_name: needName ? back_name.trim() : "" })),
      });
      if (error) throw error;
      toast.success("Order saved — it is only placed once you have paid");
      const dest = await placeMemberCounterOrder(clubId, memberId, { [item.id]: lines.length }, requestId.current);
      requestId.current = crypto.randomUUID();
      onDone(dest);
    } catch (err: any) {
      showBarChargeError(err, "Could not place the order");
    } finally { setBusy(false); }
  };

  const chart = opts.fits.find(f => f.key === chartFit);
  return (
    <div className="space-y-3">
      <Card className="p-4 flex gap-4 items-center">
        {item.image_url
          ? <img src={item.image_url} alt={`${item.name}, front`} className="w-24 h-24 shrink-0 rounded-md bg-muted object-cover object-left" />
          : <div className="w-24 h-24 shrink-0 rounded-md bg-muted flex items-center justify-center"><Shirt className="w-10 h-10 text-muted-foreground" /></div>}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{item.name}</h2>
          <p className="text-primary font-semibold">{money(Number(item.price))} each</p>
          {opts.note && <p className="text-sm text-muted-foreground">{opts.note}</p>}
          {opts.size_note && <p className="text-xs text-muted-foreground mt-1">{opts.size_note}</p>}
          <div className="flex gap-2 mt-2 flex-wrap">
            {opts.fits.filter(f => f.chart?.length).map(f => (
              <Button key={f.key} size="sm" variant="outline" className="gap-1" onClick={() => setChartFit(f.key)}><Ruler className="w-3.5 h-3.5" />{f.label} size chart</Button>
            ))}
          </div>
        </div>
      </Card>

      {lines.map((l, i) => {
        const fit = opts.fits.find(f => f.key === l.fit)!;
        return (
          <Card key={i} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium capitalize">{unit} {i + 1}</span>
              {lines.length > 1 && <Button size="icon" variant="ghost" aria-label={`Remove ${unit} ${i + 1}`} onClick={() => setLines(p => p.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>}
            </div>
            {(() => { const img = fit.image || item.image_url; return (
            <div className={img ? "grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start" : ""}>
            {img && <img src={img} alt={fit.image ? `${item.name}, ${fit.label}` : `${item.name}, front and back`} className="w-full rounded-md bg-muted" loading="lazy" />}
            <div className="space-y-3 min-w-0">
            <div className={fit.image ? "space-y-3" : "grid grid-cols-2 gap-3"}>
              <div className="space-y-1">
                <Label>{choiceLabel}{fit.image ? `: ${fit.label}` : ""}</Label>
                <div className={fit.image ? "grid grid-cols-2 sm:grid-cols-4 gap-2" : "flex gap-1"}>
                  {opts.fits.map(f => f.image ? (
                    <button key={f.key} type="button" aria-pressed={l.fit === f.key} aria-label={f.label}
                      className={`rounded-md border-2 p-1 text-xs font-medium bg-card ${l.fit === f.key ? "border-primary" : "border-border opacity-80"}`}
                      onClick={() => set(i, { fit: f.key, size: f.sizes.includes(l.size) ? l.size : "" })}>
                      <img src={f.image} alt="" className="w-full aspect-[4/3] object-cover rounded" loading="lazy" />
                      <span className="block mt-1 leading-tight">{f.label}</span>
                    </button>
                  ) : (
                    <Button key={f.key} type="button" size="sm" variant={l.fit === f.key ? "default" : "outline"} className="flex-1"
                      onClick={() => set(i, { fit: f.key, size: f.sizes.includes(l.size) ? l.size : "" })}>{f.label}</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Size</Label>
                <Select value={l.size} onValueChange={v => set(i, { size: v })}>
                  <SelectTrigger aria-label={`Size for ${unit} ${i + 1}`}><SelectValue placeholder="Choose size" /></SelectTrigger>
                  <SelectContent>{fit.sizes.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {needName && <div className="space-y-1">
              <Label htmlFor={`back-${i}`}>Name on the back — type it exactly as it must be printed</Label>
              <Input id={`back-${i}`} value={l.back_name} maxLength={BACK_NAME_MAX}
                onChange={e => set(i, { back_name: e.target.value, confirmed: false })} />
              <div className="rounded-md bg-muted px-3 py-2 text-center font-bold tracking-widest">{l.back_name.trim() || "—"}</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={l.confirmed} onChange={e => set(i, { confirmed: e.target.checked })} />
                Yes, this is exactly the name I want on the back
              </label>
            </div>}
            {errors[i] && <p className="text-xs text-destructive">{errors[i]}</p>}
            </div>
            </div>
            ); })()}
          </Card>
        );
      })}

      <Button variant="outline" className="w-full gap-2" disabled={lines.length >= 20} onClick={() => setLines(p => [...p, blank()])}><Plus className="w-4 h-4" />Add another {unit}</Button>
      <Card className="p-4 flex items-center justify-between gap-3">
        <div><div className="text-sm text-muted-foreground">{lines.length} {unit}{lines.length > 1 ? "s" : ""}</div><div className="text-xl font-semibold">{money(total)}</div></div>
        <Button disabled={busy} onClick={submit}>{busy ? "Saving…" : "Order and pay"}</Button>
      </Card>
      <p className="text-xs text-muted-foreground">Your order is only placed once it is paid by card/EFT or accepted on your member account.</p>

      <Dialog open={!!chart} onOpenChange={o => !o && setChartFit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{chart?.label} size chart (cm)</DialogTitle></DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b"><th className="py-1">Size</th><th>Half chest</th><th>Full chest</th><th>Body length</th><th>Sleeve</th></tr></thead>
              <tbody>{chart?.chart?.map(r => <tr key={r[0]} className="border-b"><td className="py-1 font-medium">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Half chest: straight across, underarm to underarm. Body length: highest shoulder point to bottom hem. Sleeve: shoulder seam to sleeve hem. Tolerance ±1 cm — measure a similar shirt laid flat.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClubOrders({ clubId, items, money }: { clubId: string; items: Item[]; money: (n: number) => string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("open");
  const { data: rows = [] } = useQuery({
    queryKey: ["shop-club-orders", clubId],
    queryFn: async () => {
      await (supabase as any).rpc("shop_reconcile_order_payments", { _club_id: clubId });
      const { data, error } = await (supabase as any).from("shop_orders").select("*, club_members:club_member_id(name)").eq("club_id", clubId).order("created_at");
      if (error) throw error;
      return (data || []) as OrderRow[];
    },
  });
  const shown = rows.filter(r => filter === "all" || (filter === "open" ? !["collected", "cancelled"].includes(r.status) : r.status === filter));
  const setStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).rpc("shop_set_order_status", { _order_id: id, _status: status });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["shop-club-orders"] });
  };
  const counts = useMemo(() => {
    const toPrint = rows.filter(r => r.status === "ordered").map(r => ({ ...r, member: r.club_members?.name || "" }));
    return items.flatMap(it => {
      const opts = parseGarmentOptions(it.order_options);
      if (!opts) return [];
      const prefix = items.length > 1 ? `${it.name} · ` : "";
      return sizeCounts(toPrint.filter(r => r.bar_item_id === it.id), opts).map(c => ({ ...c, fit: prefix + c.fit }));
    });
  }, [rows, items]);
  const download = () => {
    const toPrint = rows.filter(r => r.status === "ordered");
    const csv = [["Item", "Fit / colour", "Size", "Name on back", "Member"], ...toPrint.map(r => [items.find(i => i.id === r.bar_item_id)?.name || "", fitLabel(items, r.bar_item_id, r.fit), r.size, r.back_name, r.club_members?.name || ""])]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `printer-list-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };
  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">Not yet sent to the printer</span>
          <Button size="sm" variant="outline" className="gap-1" onClick={download} disabled={!counts.length}><Download className="w-3.5 h-3.5" />Printer list</Button>
        </div>
        <div className="flex flex-wrap gap-2">{counts.length ? counts.map(c => <Badge key={c.fit + c.size} variant="secondary">{c.fit} {c.size}: {c.count}</Badge>) : <span className="text-sm text-muted-foreground">None</span>}</div>
      </Card>
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Open orders</SelectItem>
          {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          <SelectItem value="all">All</SelectItem>
        </SelectContent>
      </Select>
      <Card className="divide-y">
        {shown.length === 0 && <p className="p-4 text-muted-foreground">No orders.</p>}
        {shown.map(r => (
          <div key={r.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="font-medium">{r.club_members?.name || "Member"} — "{r.back_name}"</div>
              <div className="text-xs text-muted-foreground">{fitLabel(items, r.bar_item_id, r.fit)} {r.size} · {money(Number(r.unit_price))} · {format(new Date(r.created_at), "d MMM yyyy")}</div>
            </div>
            <Select value={r.status} onValueChange={v => setStatus(r.id, v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k} disabled={(k === "cancelled" ? !["ordered", "awaiting_payment"].includes(r.status) : r.status === "awaiting_payment" || k === "awaiting_payment")}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
      </Card>
      <p className="text-xs text-muted-foreground">Cancelling an order doesn't refund it. Refund through the bar as usual.</p>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import type { BarOrder } from "./BarCounterOrders";

type Lines = { bar_item_id: string; quantity: number }[];

/** Customer: choose collect/deliver and explicitly place the order on their open tab. */
export function GuestOrderDialog({ tab, lines, open, onOpenChange, onPlaced }: {
  tab: { tab_id: string; token: string } | null; lines: Lines; open: boolean;
  onOpenChange: (v: boolean) => void; onPlaced: (order: BarOrder) => void;
}) {
  const [fulfilment, setFulfilment] = useState<"collect" | "deliver">("deliver");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // One key per dialog opening so double taps / retries never create a second order.
  const idemKey = useMemo(() => crypto.randomUUID(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = async () => {
    if (!tab) return;
    if (fulfilment === "deliver" && !location.trim()) return toast.error("Where should we bring it? e.g. Court 1");
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("bar_submit_guest_order", {
      _tab_id: tab.tab_id, _token: tab.token, _lines: lines, _fulfilment: fulfilment,
      _location: location, _note: note, _idempotency_key: idemKey,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    onPlaced(data as BarOrder);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Place your order</DialogTitle>
          <DialogDescription>It goes onto your open tab and to the bar staff.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button variant={fulfilment === "deliver" ? "default" : "outline"} onClick={() => setFulfilment("deliver")}>Deliver to me</Button>
            <Button variant={fulfilment === "collect" ? "default" : "outline"} onClick={() => setFulfilment("collect")}>Collect at bar</Button>
          </div>
          {fulfilment === "deliver" && (
            <div className="space-y-1">
              <Label htmlFor="order-location" className="text-xs">Where are you?</Label>
              <Input id="order-location" placeholder="e.g. Court 1, table by the window" maxLength={60}
                value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="order-note" className="text-xs">Note (optional)</Label>
            <Input id="order-note" placeholder="e.g. no ice" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button className="w-full" disabled={busy} onClick={place}>
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Place order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Customer: progress of their orders on this tab. */
export function GuestOrderProgress({ tab }: { tab: { tab_id: string; token: string } }) {
  const { data: orders = [] } = useQuery({
    queryKey: ["bar-guest-orders", tab.tab_id],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("bar_guest_orders", { _tab_id: tab.tab_id, _token: tab.token });
      return (data ?? []) as BarOrder[];
    },
  });
  if (orders.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">Your orders</p>
      {orders.map((o) => (
        <div key={o.id} className="rounded-md border p-2 text-[11px] space-y-0.5">
          <div className="flex justify-between font-medium">
            <span>#{o.order_number} · {o.fulfilment === "deliver" ? `to ${o.location}` : "collect at bar"}</span>
            <span>{o.status === "completed" ? "Delivered" : o.status === "open" ? "In progress" : o.status}</span>
          </div>
          <div className="text-[10px] font-medium">
            {o.tab_status === "settled" ? `Paid${(o as any).tab_settled_method === "terminal" ? " — card machine" : (o as any).tab_settled_method === "cash" ? " — cash" : ""}`
              : o.tab_status === "closing" ? ((o as any).tab_settled_method === "terminal" ? "Awaiting card payment at bar" : (o as any).tab_settled_method === "cash" ? "Awaiting cash payment at bar" : "Online payment pending")
              : "On your tab · not paid yet"}
          </div>
          {o.lines.map((l) => (
            <div key={l.id} className="flex justify-between text-muted-foreground">
              <span>{l.quantity}× {l.item_name}</span>
              <span>{l.delivered_qty >= l.quantity ? (o.fulfilment === "collect" ? "✓ collected" : "✓ delivered") : (o.fulfilment === "collect" && (l as any).ready_notified_at) ? "Ready — collect at bar" : `${l.delivered_qty} of ${l.quantity}`}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

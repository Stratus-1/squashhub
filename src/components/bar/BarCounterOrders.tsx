import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Minus, Plus, MapPin, ShoppingBag, Bell } from "lucide-react";

export type BarOrderLine = {
  id: string; item_name: string; quantity: number; delivered_qty: number;
  ready_qty?: number; ready_notified_at?: string | null; ready_notify_count?: number;
};
export type BarOrder = {
  id: string; order_number: number; customer_name: string; fulfilment: "collect" | "deliver";
  location: string | null; note: string | null; status: string; created_at: string;
  completed_at: string | null; tab_status: string | null; member_linked?: boolean; lines: BarOrderLine[];
};

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

/** Counter Mode → Orders: club-wide list, item-level delivery. Polls every 10s. */
export function BarCounterOrders({ token, clubId }: { token: string | null; clubId: string | null }) {
  const qc = useQueryClient();
  const [view, setView] = useState<"open" | "done">("open");
  const [busy, setBusy] = useState<string | null>(null);
  const key = ["bar-counter-orders", token, clubId, view];

  const { data: orders = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!token || !!clubId,
    refetchInterval: 10000,
    refetchOnReconnect: true,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("bar_counter_orders", {
        _token: token, _club_id: token ? null : clubId, _status: view === "open" ? "open" : "done",
      });
      if (error) throw error;
      return (data ?? []) as BarOrder[];
    },
  });

  const setDelivered = async (line: BarOrderLine, qty: number) => {
    setBusy(line.id);
    const { error } = await (supabase as any).rpc("bar_counter_set_delivered", {
      _line_id: line.id, _delivered: qty, _token: token, _club_id: token ? null : clubId,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["bar-counter-orders"] });
  };

  /** Collect-at-bar only. Marks the item ready and notifies the member; never marks delivered or paid. */
  const notifyReady = async (line: BarOrderLine, resend: boolean) => {
    if (resend && !window.confirm(`Send the "${line.item_name}" ready message again?`)) return;
    setBusy(line.id);
    const { data, error } = await (supabase as any).rpc("bar_counter_notify_ready", {
      _line_ids: [line.id], _resend: resend, _token: token, _club_id: token ? null : clubId,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    const r = data as any;
    if (r?.already) toast.info("Already notified — use Resend if they need a reminder.");
    else if (r?.notified) toast.success(`${line.item_name}: member notified it's ready`);
    else if (r?.reason === "no_member_account") toast.info(`${line.item_name} marked ready — this customer has no member account to notify. Call them.`);
    else if (r?.reason === "all_delivered") toast.info("Already delivered.");
    qc.invalidateQueries({ queryKey: ["bar-counter-orders"] });
  };

  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <Button size="sm" variant={view === "open" ? "default" : "outline"} onClick={() => setView("open")}>Open</Button>
        <Button size="sm" variant={view === "done" ? "default" : "outline"} onClick={() => setView("done")}>Completed</Button>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          {view === "open" ? "No open orders." : "No completed orders yet."}
        </p>
      ) : orders.map((o) => {
        const left = o.lines.reduce((s, l) => s + l.quantity - l.delivered_qty, 0);
        return (
          <Card key={o.id} className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">#{o.order_number} · {o.customer_name}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  {o.fulfilment === "deliver"
                    ? <><MapPin className="w-3 h-3" /> Deliver to {o.location}</>
                    : <><ShoppingBag className="w-3 h-3" /> Collect at bar</>}
                  {" · "}{ago(o.created_at)}
                </p>
                {o.note && <p className="text-[11px] italic">“{o.note}”</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={o.status === "open" ? "secondary" : "outline"}>
                  {o.status === "open" ? `${left} to go` : o.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {o.tab_status === "settled" ? "Paid" : "On tab · unpaid"}
                </span>
              </div>
            </div>
            <div className="divide-y rounded-md border">
              {o.lines.map((l) => {
                const done = l.delivered_qty >= l.quantity;
                const canReady = o.fulfilment === "collect" && o.status === "open" && !done;
                const notified = !!l.ready_notified_at;
                return (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
                    <div className="min-w-0">
                      <span className={`text-xs ${done ? "line-through text-muted-foreground" : ""}`}>
                        {l.quantity}× {l.item_name}
                      </span>
                      {o.fulfilment === "collect" && notified && !done && (
                        <p className="text-[10px] text-primary">
                          Ready for collection · notified {time(l.ready_notified_at!)}
                          {(l.ready_notify_count ?? 0) > 1 ? ` (sent ${l.ready_notify_count}×)` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {canReady && (
                        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
                          disabled={busy === l.id} onClick={() => notifyReady(l, notified)}
                          title={o.member_linked ? "Tell the member this item is ready at the bar" : "No member account linked — marks ready only"}>
                          <Bell className="w-3 h-3" />
                          {notified ? "Resend" : o.member_linked ? "Ready — notify" : "Mark ready"}
                        </Button>
                      )}
                      {l.quantity > 1 && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`One less ${l.item_name} delivered`}
                            disabled={busy === l.id || l.delivered_qty === 0} onClick={() => setDelivered(l, l.delivered_qty - 1)}>
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="text-[11px] tabular-nums w-14 text-center">{l.delivered_qty} of {l.quantity}</span>
                          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`One more ${l.item_name} delivered`}
                            disabled={busy === l.id || done} onClick={() => setDelivered(l, l.delivered_qty + 1)}>
                            <Plus className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant={done ? "outline" : "default"} className="h-7 text-[11px] gap-1"
                        disabled={busy === l.id} onClick={() => setDelivered(l, done ? 0 : l.quantity)}>
                        {done ? "Undo" : <><Check className="w-3 h-3" /> {o.fulfilment === "collect" ? "Collected" : "Delivered"}</>}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

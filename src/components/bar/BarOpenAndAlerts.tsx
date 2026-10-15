import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BellRing, DoorClosed, DoorOpen } from "lucide-react";
import type { BarOrder } from "./BarCounterOrders";

/** Short two-tone chime via Web Audio (no audio file needed). */
function chime() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t); o.stop(t + 0.4);
    });
    setTimeout(() => ctx.close?.(), 1200);
  } catch { /* sound is best-effort */ }
}

/**
 * Counter Mode: the person running the bar opens/closes it for phone orders,
 * and gets a sound + pop-up whenever a new order arrives (on any pane).
 */
export function BarOpenAndAlerts({ token, clubId, operator, onShowOrders }: {
  token: string | null; clubId: string | null; operator: string | null; onShowOrders: () => void;
}) {
  const qc = useQueryClient();
  const args = { _token: token, _club_id: token ? null : clubId };
  const [busy, setBusy] = useState(false);
  const [popup, setPopup] = useState<BarOrder[]>([]);
  const seen = useRef<Set<string> | null>(null);

  const { data: state } = useQuery({
    queryKey: ["bar-open-state", token, clubId],
    enabled: !!token || !!clubId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("bar_counter_open_state", args);
      if (error) throw error;
      return data as { open: boolean; open_until: string | null; opened_by: string | null };
    },
  });
  const isOpen = !!state?.open;

  const { data: orders } = useQuery({
    queryKey: ["bar-counter-orders", token, clubId, "open", "alerts"],
    enabled: !!token || !!clubId,
    refetchInterval: 8000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("bar_counter_orders", { ...args, _status: "open" });
      if (error) throw error;
      return (data ?? []) as BarOrder[];
    },
  });

  useEffect(() => {
    if (!orders) return;
    if (seen.current === null) { seen.current = new Set(orders.map(o => o.id)); return; }
    const fresh = orders.filter(o => !seen.current!.has(o.id));
    orders.forEach(o => seen.current!.add(o.id));
    if (fresh.length) {
      chime();
      setPopup(p => [...p, ...fresh]);
      qc.invalidateQueries({ queryKey: ["bar-counter-orders"] });
    }
  }, [orders, qc]);

  const toggle = async () => {
    setBusy(true);
    const { error } = await (supabase as any).rpc("bar_counter_set_open", { _open: !isOpen, ...args, _operator: operator });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!isOpen) chime(); // also unlocks sound on phones/tablets after a tap
    toast.success(isOpen ? "Bar closed — customers can't place phone orders." : "Bar open — phone orders will come in here.");
    qc.invalidateQueries({ queryKey: ["bar-open-state"] });
  };

  const openCount = orders?.length ?? 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isOpen ? "default" : "secondary"} className="gap-1">
          {isOpen ? <DoorOpen className="w-3 h-3" /> : <DoorClosed className="w-3 h-3" />}
          {isOpen ? "Open for orders" : "Closed for orders"}
        </Badge>
        {isOpen && state?.open_until && (
          <span className="text-[11px] text-muted-foreground">
            {state.opened_by ? `by ${state.opened_by} · ` : ""}closes automatically {new Date(state.open_until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <Button size="sm" variant={isOpen ? "outline" : "default"} disabled={busy} onClick={toggle}>
          {isOpen ? "Close bar" : "Open bar for orders"}
        </Button>
        {openCount > 0 && <Badge variant="destructive">{openCount} open order{openCount === 1 ? "" : "s"}</Badge>}
      </div>

      <Dialog open={popup.length > 0} onOpenChange={(o) => { if (!o) setPopup([]); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BellRing className="w-5 h-5" /> New order{popup.length > 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>A customer has ordered from their phone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {popup.map(o => (
              <div key={o.id} className="rounded-md border p-2">
                <p className="text-sm font-semibold">#{o.order_number} · {o.customer_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {o.fulfilment === "deliver" ? `Deliver to ${o.location}` : "Collect at bar"}
                </p>
                <p className="text-xs">{o.lines.map(l => `${l.quantity}× ${l.item_name}`).join(", ")}</p>
                {o.note && <p className="text-[11px] italic">“{o.note}”</p>}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => { setPopup([]); onShowOrders(); }}>Show orders</Button>
            <Button variant="outline" onClick={() => setPopup([])}>OK</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

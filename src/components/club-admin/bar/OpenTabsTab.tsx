import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type TabLine = { name: string | null; quantity: number; total: number; operator?: string | null; operator_id?: string | null };
type OpenTab = {
  tab_id: string;
  guest_name: string;
  guest_phone: string | null;
  status: string;
  opened_at: string;
  operator: string | null;
  total: number;
  lines: TabLine[];
};

const money = (n: number) => `R${Number(n || 0).toFixed(2)}`;

function fmtWhen(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `today ${time}` : `${d.toLocaleDateString()} ${time}`;
}

/** Opened on an earlier Johannesburg calendar day (server blocks new items on these). */
function isPreviousDay(iso: string) {
  const d = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  return d(new Date(iso)) < d(new Date());
}

export function OpenTabsTab({ clubId }: { clubId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [removing, setRemoving] = useState<OpenTab | null>(null);
  const qc = useQueryClient();
  const removeTab = useMutation({
    mutationFn: async (tabId: string) => {
      const { error } = await supabase.rpc("bar_admin_remove_zero_tab", { _club_id: clubId, _tab_id: tabId });
      if (error) throw error;
    },
    onSuccess: () => {
      setRemoving(null);
      toast.success("Zero-outstanding tab removed");
      qc.invalidateQueries({ queryKey: ["bar-open-tabs", clubId] });
      qc.invalidateQueries({ queryKey: ["bar-counter-board"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not remove tab"),
  });

  const { data: tabs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["bar-open-tabs", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_open_tabs", { _club_id: clubId });
      if (error) throw error;
      return (data as unknown as OpenTab[]) ?? [];
    },
    refetchInterval: 30000,
  });

  const { data: isTreasurer = false } = useQuery({
    queryKey: ["bar-is-treasurer", clubId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await (supabase as any).from("club_offices")
        .select("id, club_members!inner(user_id)")
        .eq("club_id", clubId).eq("office", "treasurer").is("ended_at", null)
        .eq("club_members.user_id", u.user.id).limit(1);
      return (data?.length ?? 0) > 0;
    },
  });
  const allowToday = useMutation({
    mutationFn: async (tabId: string) => {
      const { error } = await (supabase as any).rpc("bar_treasurer_allow_tab_today", { _tab_id: tabId });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Tab may take items again today"),
    onError: (e: Error) => toast.error(e.message || "Could not allow tab"),
  });
  const grandTotal = tabs.reduce((s, t) => s + Number(t.total || 0), 0);
  const stale = tabs.filter(t => Date.now() - new Date(t.opened_at).getTime() > 24 * 3600 * 1000);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-medium">Open &amp; unpaid tabs</h4>
          <p className="text-sm text-muted-foreground">
            Every guest tab that is still open or awaiting payment, who is serving it, and how much is outstanding.
            Refreshes automatically every 30 seconds.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {stale.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
          <p>
            {stale.length} tab{stale.length === 1 ? " has" : "s have"} been open for more than a day — the counter may
            not have been closed off properly. Ask the operator to settle or close these tabs.
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tabs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open tabs — everything is settled. 🎉</p>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="font-medium">{tabs.length} open tab{tabs.length === 1 ? "" : "s"}</span>
            <span className="font-semibold">{money(grandTotal)} outstanding</span>
          </div>
          <div className="divide-y rounded-md border">
            {tabs.map(t => {
              const open = expanded === t.tab_id;
              const isStale = Date.now() - new Date(t.opened_at).getTime() > 24 * 3600 * 1000;
              return (
                <div key={t.tab_id} className="px-3 py-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 text-left"
                    onClick={() => setExpanded(open ? null : t.tab_id)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{t.guest_name}</span>
                        {t.status === "closing" && <Badge variant="destructive" className="text-[10px]">awaiting payment</Badge>}
                        {isStale && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">open &gt; 1 day</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Opened {fmtWhen(t.opened_at)}
                        {t.guest_phone ? ` · ${t.guest_phone}` : ""}
                        {t.operator ? ` · served by ${t.operator}` : " · no counter operator recorded"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold">{money(t.total)}</span>
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>
                  {open && (
                    <div className="mt-2 space-y-1 border-t pt-2">
                      {t.lines.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nothing charged yet.</p>
                      ) : t.lines.map((l, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span>{l.quantity} × {l.name ?? "Item"}<span className="block text-muted-foreground">{l.operator ? `Served by ${l.operator}` : "No counter operator recorded"}</span></span>
                          <span>{money(l.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {t.status === "open" && isPreviousDay(t.opened_at) && (
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-destructive">Blocked: no new items until this tab is paid or put on the member account.</span>
                      {isTreasurer && (
                        <Button variant="outline" size="sm" onClick={() => allowToday.mutate(t.tab_id)} disabled={allowToday.isPending}>
                          Allow today (treasurer)
                        </Button>
                      )}
                    </div>
                  )}
                  {t.status === "open" && Number(t.total) === 0 && (
                    <div className="mt-2 flex justify-end">
                      <Button variant="outline" size="sm" aria-label={`Remove zero-outstanding tab for ${t.guest_name}`} onClick={() => setRemoving(t)} disabled={removeTab.isPending}>
                        <Trash2 className="mr-1 h-4 w-4" /> Remove tab
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Only open tabs with R0.00 outstanding can be removed. Sales and payment history are retained.
          </p>
        </>
      )}
      <AlertDialog open={removing !== null} onOpenChange={open => { if (!open && !removeTab.isPending) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove zero-outstanding tab?</AlertDialogTitle>
            <AlertDialogDescription>{removing?.guest_name} · R0.00 outstanding. Sales and payment history will be retained.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeTab.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={removeTab.isPending} onClick={event => { event.preventDefault(); if (removing) removeTab.mutate(removing.tab_id); }}>
              {removeTab.isPending ? "Removing…" : "Remove tab"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

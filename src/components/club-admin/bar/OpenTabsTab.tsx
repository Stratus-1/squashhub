import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

type TabLine = { name: string | null; quantity: number; total: number };
type OpenTab = {
  tab_id: string;
  guest_name: string;
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

export function OpenTabsTab({ clubId }: { clubId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: tabs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["bar-open-tabs", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_open_tabs", { _club_id: clubId });
      if (error) throw error;
      return (data as unknown as OpenTab[]) ?? [];
    },
    refetchInterval: 30000,
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
                        {t.operator ? ` · served by ${t.operator}` : " · operator unknown"}
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
                          <span>{l.quantity} × {l.name ?? "Item"}</span>
                          <span>{money(l.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Tabs are settled at the bar counter (Counter mode). If a tab should be written off, an admin can remove it
            from the guest tabs list.
          </p>
        </>
      )}
    </div>
  );
}

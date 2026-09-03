/**
 * Bar Counter mode — `/s/:code/counter` (device unlocked with a staff PIN, no login)
 * or `/bar/counter` for signed-in staff with Bar permission.
 *
 * One screen for the person behind the counter: see every open tab with its
 * running total, open new tabs, add rounds and settle by cash or card machine.
 * Charging a member's account is deliberately NOT here — that always needs the
 * member's own Bar PIN via the Counter Sale flow.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClubContext } from "@/contexts/ClubContext";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Lock, Plus, Minus, Receipt, Banknote, CreditCard, RefreshCw, ArrowLeft } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

interface CounterItem { id: string; name: string; price: number; category?: string | null }
interface CounterTab {
  tab_id: string;
  guest_name: string;
  status: string;
  opened_at: string;
  total: number;
  lines: { name: string | null; quantity: number; total: number }[];
}
interface Board {
  club_id: string;
  club_name: string;
  cash_enabled: boolean;
  card_enabled: boolean;
  items: CounterItem[];
  tabs: CounterTab[];
}

const tokenKey = (code: string) => `sh.barcounter.token.${code}`;

export default function BarCounter() {
  const { code } = useParams<{ code?: string }>();
  const { activeClub } = useClubContext() as any;
  const qc = useQueryClient();

  const [token, setToken] = useState<string | null>(() => (code ? localStorage.getItem(tokenKey(code)) : null));
  const [pin, setPin] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const clubId: string | null = code ? null : activeClub?.id ?? null;
  const enabled = Boolean(token || clubId);

  const { data: board, isLoading, refetch } = useQuery({
    queryKey: ["bar-counter-board", token, clubId],
    enabled,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_counter_board", {
        _token: token,
        _club_id: clubId,
      } as any);
      if (error) throw error;
      return data as unknown as Board;
    },
  });

  useEffect(() => {
    if (!activeTabId) setCart({});
  }, [activeTabId]);

  const activeTab = useMemo(
    () => board?.tabs.find((t) => t.tab_id === activeTabId) ?? null,
    [board, activeTabId],
  );
  const cartTotal = useMemo(
    () =>
      Object.entries(cart).reduce((sum, [id, qty]) => {
        const item = board?.items.find((i) => i.id === id);
        return sum + (item ? item.price * qty : 0);
      }, 0),
    [cart, board],
  );

  const money = (n: number) => `R${Number(n || 0).toFixed(2)}`;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["bar-counter-board"] });

  async function unlock() {
    if (!code) return;
    setUnlocking(true);
    try {
      const { data, error } = await supabase.rpc("bar_counter_unlock", { _code: code, _pin: pin } as any);
      if (error) throw error;
      const t = (data as any)?.token as string;
      localStorage.setItem(tokenKey(code), t);
      setToken(t);
      setPin("");
      toast.success("Counter unlocked");
    } catch (e: any) {
      toast.error(e.message ?? "Could not unlock this device");
    } finally {
      setUnlocking(false);
    }
  }

  async function openTab() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("bar_counter_open_tab", {
        _guest_name: newName.trim(), _token: token, _club_id: clubId,
      } as any);
      if (error) throw error;
      setNewName("");
      await refetch();
      setActiveTabId((data as any)?.tab_id ?? null);
      toast.success("Tab opened");
    } catch (e: any) {
      toast.error(e.message ?? "Could not open the tab");
    } finally {
      setBusy(false);
    }
  }

  async function addRound() {
    if (!activeTabId) return;
    const lines = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([bar_item_id, quantity]) => ({ bar_item_id, quantity }));
    if (!lines.length) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_counter_add_to_tab", {
        _tab_id: activeTabId, _lines: lines, _token: token, _club_id: clubId,
      } as any);
      if (error) throw error;
      setCart({});
      await refetch();
      invalidate();
      toast.success("Added to tab");
    } catch (e: any) {
      toast.error(e.message ?? "Could not add to the tab");
    } finally {
      setBusy(false);
    }
  }

  async function settle(method: "cash" | "terminal") {
    if (!activeTabId) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_counter_settle_tab", {
        _tab_id: activeTabId, _method: method, _token: token, _club_id: clubId,
      } as any);
      if (error) throw error;
      setActiveTabId(null);
      await refetch();
      invalidate();
      toast.success("Tab settled");
    } catch (e: any) {
      toast.error(e.message ?? "Could not settle the tab");
    } finally {
      setBusy(false);
    }
  }

  // ---- Locked device ----------------------------------------------------
  if (code && !token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <SEO title="Bar counter" description="Staff counter mode" path="/bar/counter" noIndex />
        <Card className="w-full max-w-sm p-6 space-y-4 text-center">
          <Lock className="w-8 h-8 mx-auto text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">Bar counter mode</h1>
            <p className="text-sm text-muted-foreground">Enter the club's counter PIN to start serving.</p>
          </div>
          <Input
            inputMode="numeric"
            autoFocus
            value={pin}
            maxLength={8}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            className="text-center text-2xl tracking-[0.4em] h-14"
            placeholder="••••"
          />
          <Button className="w-full h-12" disabled={pin.length < 4 || unlocking} onClick={unlock}>
            {unlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Unlock counter"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            This device stays unlocked for 30 days. A club admin can revoke it at any time.
          </p>
        </Card>
      </div>
    );
  }

  if (!enabled) {
    return <div className="p-6 text-sm text-muted-foreground">Select a club to use counter mode.</div>;
  }

  if (isLoading || !board) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---- Board ------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background pb-24">
      <SEO title="Bar counter" description="Open tabs at the bar counter" path="/bar/counter" noIndex />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold leading-tight">{board.club_name} · Bar counter</h1>
          <p className="text-xs text-muted-foreground">
            {board.tabs.length} open tab{board.tabs.length === 1 ? "" : "s"} ·{" "}
            {money(board.tabs.reduce((s, t) => s + Number(t.total || 0), 0))} outstanding
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => refetch()} aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {!activeTab ? (
        <div className="p-4 space-y-4">
          <Card className="p-3 flex gap-2">
            <Input
              placeholder="Name for a new tab"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && openTab()}
              className="h-11"
            />
            <Button className="h-11 gap-1" disabled={!newName.trim() || busy} onClick={openTab}>
              <Plus className="w-4 h-4" /> Tab
            </Button>
          </Card>

          {board.tabs.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No open tabs. Open one above when someone starts drinking.
            </Card>
          ) : (
            <div className="space-y-2">
              {board.tabs.map((t) => (
                <Card
                  key={t.tab_id}
                  className="p-3 flex items-center justify-between active:scale-[0.99] transition cursor-pointer"
                  onClick={() => setActiveTabId(t.tab_id)}
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{t.guest_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      open {formatDistanceToNowStrict(new Date(t.opened_at))} · {t.lines.length} item
                      {t.lines.length === 1 ? "" : "s"}
                      {t.status === "closing" && " · awaiting payment"}
                    </div>
                  </div>
                  <Badge variant={t.status === "closing" ? "destructive" : "secondary"} className="text-sm">
                    {money(t.total)}
                  </Badge>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setActiveTabId(null)}>
            <ArrowLeft className="w-4 h-4" /> All tabs
          </Button>

          <Card className="p-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{activeTab.guest_name}</div>
              <Badge variant="secondary" className="text-sm">{money(activeTab.total)}</Badge>
            </div>
            {activeTab.lines.length > 0 && (
              <>
                <Separator className="my-2" />
                <div className="space-y-1 text-xs">
                  {activeTab.lines.map((l, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{l.quantity} × {l.name ?? "Item"}</span>
                      <span>{money(l.total)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <div className="grid grid-cols-2 gap-2">
            {board.items.map((item) => {
              const qty = cart[item.id] ?? 0;
              return (
                <Card key={item.id} className="p-2">
                  <div className="text-sm font-medium leading-tight truncate">{item.name}</div>
                  <div className="text-[11px] text-muted-foreground">{money(item.price)}</div>
                  <div className="flex items-center justify-between mt-2">
                    <Button
                      size="icon" variant="outline" className="h-8 w-8" disabled={qty === 0}
                      onClick={() => setCart((c) => ({ ...c, [item.id]: Math.max(0, (c[item.id] ?? 0) - 1) }))}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-sm font-semibold w-6 text-center">{qty}</span>
                    <Button
                      size="icon" variant="outline" className="h-8 w-8"
                      onClick={() => setCart((c) => ({ ...c, [item.id]: (c[item.id] ?? 0) + 1 }))}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-3 space-y-2">
            <Button className="w-full h-12 gap-2" disabled={cartTotal <= 0 || busy} onClick={addRound}>
              <Receipt className="w-4 h-4" />
              Add {money(cartTotal)} to {activeTab.guest_name}'s tab
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline" className="h-11 gap-2"
                disabled={busy || !board.cash_enabled || activeTab.total <= 0}
                onClick={() => settle("cash")}
              >
                <Banknote className="w-4 h-4" /> Paid cash
              </Button>
              <Button
                variant="outline" className="h-11 gap-2"
                disabled={busy || !board.card_enabled || activeTab.total <= 0}
                onClick={() => settle("terminal")}
              >
                <CreditCard className="w-4 h-4" /> Card machine
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Bar Counter mode — `/s/:code/counter` (device unlocked with a staff PIN, no login)
 * or `/bar/counter` for signed-in staff with Bar permission.
 *
 * One screen for the person behind the counter: see every open tab with its
 * running total, open new tabs, add rounds and settle by cash, card machine or
 * — for members — straight onto the member's account. Staff can never approve
 * an account charge themselves: the member enters their own six-digit Bar PIN.
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BarPinDialog } from "@/components/bar/BarPinDialog";
import { ProductScanDialog } from "@/components/bar/ProductScanDialog";
import { toast } from "sonner";
import { Loader2, Lock, Plus, Minus, Receipt, Banknote, CreditCard, RefreshCw, ArrowLeft, UserCheck, ScanBarcode, CheckCircle2 } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

interface CounterItem { id: string; name: string; price: number; category?: string | null; barcode?: string | null }
interface CounterTab {
  tab_id: string;
  token: string;
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
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberNumber, setMemberNumber] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState<{ id: string; display_name: string } | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [settled, setSettled] = useState<{
    tab: CounterTab;
    method: "member_account" | "cash" | "terminal";
    memberName?: string;
  } | null>(null);



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
    if (!activeTab) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_counter_settle_tab", {
        _tab_id: activeTab.tab_id, _method: method, _token: token, _club_id: clubId,
      } as any);
      if (error) throw error;
      setSettled({ tab: activeTab, method });
      setCart({});
      await refetch();
      invalidate();
      toast.success("Tab settled");
    } catch (e: any) {
      toast.error(e.message ?? "Could not settle the tab");
    } finally {
      setBusy(false);
    }
  }




  /** Staff picks the member by number; only the member can approve with their PIN. */
  async function identifyMember() {
    if (!board || !memberNumber.trim()) return;
    setIdentifying(true);
    try {
      const { data, error } = await (supabase as any).rpc("bar_qr_lookup_member", {
        _club_id: board.club_id,
        _number: memberNumber.trim(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.id) throw new Error("No active member with that number at this club.");
      if (!row.has_pin) throw new Error("That member has no Bar PIN yet — they can set one in the app under Bar PIN.");
      setIdentified({ id: row.id, display_name: row.display_name });
      setMemberOpen(false);
      setPinOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "Could not find that member number");
    } finally {
      setIdentifying(false);
    }
  }

  async function chargeMemberAccount({ secret }: { secret: string }) {
    if (!activeTab || !identified) return;
    const { error } = await (supabase as any).rpc("bar_qr_charge_guest_tab_member", {
      _tab_id: activeTab.tab_id,
      _token: activeTab.token,
      _club_member_id: identified.id,
      _pin: secret,
    });
    if (error) throw new Error(error.message);
    setPinOpen(false);
    setIdentified(null);
    setMemberNumber("");
    setCart({});
    setSettled({ tab: activeTab, method: "member_account", memberName: identified.display_name });
    await refetch();
    invalidate();
    toast.success("Charged to the member's account");
  }

  function finishSettled() {
    setSettled(null);
    setActiveTabId(null);
    refetch();
    invalidate();
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

      {settled ? (
        <div className="p-4 space-y-4">
          <Card className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-600" />
            <div>
              <h2 className="text-lg font-semibold">Tab settled</h2>
              <p className="text-sm text-muted-foreground">{settled.tab.guest_name}</p>
            </div>
            <div className="text-3xl font-bold">{money(settled.tab.total)}</div>
            <Badge variant="secondary" className="text-sm capitalize">
              {settled.method === "member_account"
                ? `Charged to ${settled.memberName ?? "member account"}`
                : settled.method === "terminal"
                  ? "Card machine"
                  : "Cash"}
            </Badge>
            {settled.tab.lines.length > 0 && (
              <div className="text-left text-xs space-y-1 pt-2">
                <Separator />
                {settled.tab.lines.map((l, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{l.quantity} × {l.name ?? "Item"}</span>
                    <span>{money(l.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Button className="w-full h-12" onClick={finishSettled}>
            Next customer
          </Button>
        </div>
      ) : !activeTab ? (
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
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setActiveTabId(null)}>
              <ArrowLeft className="w-4 h-4" /> All tabs
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setScanOpen(true)}>
              <ScanBarcode className="w-4 h-4" /> Scan item
            </Button>
          </div>

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
            <Button
              variant="secondary" className="w-full h-11 gap-2"
              disabled={busy || activeTab.total <= 0}
              onClick={() => { setMemberNumber(""); setMemberOpen(true); }}
            >
              <UserCheck className="w-4 h-4" /> Add to member account
            </Button>
          </div>

          <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Charge to a member account</DialogTitle>
                <DialogDescription className="text-xs">
                  Enter the member's number. They then approve {money(activeTab.total)} with their own six-digit Bar PIN — staff cannot approve it.
                </DialogDescription>
              </DialogHeader>
              <Input
                inputMode="numeric" autoFocus value={memberNumber}
                onChange={(e) => setMemberNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && identifyMember()}
                className="h-12 text-center text-xl tracking-widest"
                placeholder="Member number"
              />
              <Button className="w-full h-11" disabled={!memberNumber.trim() || identifying} onClick={identifyMember}>
                {identifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
              </Button>
            </DialogContent>
          </Dialog>

          <ProductScanDialog
            open={scanOpen}
            onOpenChange={setScanOpen}
            items={board?.items ?? []}
            onItem={(item) => setCart((c) => ({ ...c, [item.id]: (c[item.id] ?? 0) + 1 }))}
          />

          {identified && (
            <BarPinDialog
              open={pinOpen}
              onOpenChange={(o) => { setPinOpen(o); if (!o) setIdentified(null); }}
              clubMemberId={identified.id}
              memberName={identified.display_name}
              amountLabel={money(activeTab.total)}
              mode="counter"
              pinOnly
              onVerified={chargeMemberAccount}
            />
          )}

        </div>
      )}
    </div>
  );
}

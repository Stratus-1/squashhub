import { barChargeErrorMessage } from "@/lib/account-charge-gate";
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
import { useMyClub } from "@/hooks/use-club";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BarOtpDialog } from "@/components/bar/BarOtpDialog";
import { ProductScanDialog } from "@/components/bar/ProductScanDialog";
import { cancelTabCardPayment, cancelTabCardMessage } from "@/lib/bar/cancel-tab-card-payment";
import { toast } from "sonner";
import { Loader2, Lock, Plus, Minus, Receipt, Banknote, CreditCard, RefreshCw, ArrowLeft, UserCheck, ScanBarcode, CheckCircle2, Smartphone } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { BAR_CATEGORY_EMOJI, barProductEmoji, categoryLabel, useBarCategories, useBarDivisions } from "@/lib/bar-categories";

interface CounterItem { id: string; name: string; price: number; category?: string | null; division?: string | null; item_kind?: string | null; barcode?: string | null; image_url?: string | null }
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
  account_enabled?: boolean;
  online_enabled?: boolean;
  payment_gateway?: string;
  venue_code?: string | null;
  items: CounterItem[];
  tabs: CounterTab[];
}

const tokenKey = (code: string) => `sh.barcounter.token.${code}`;
const operatorKey = (code: string) => `sh.barcounter.operator.${code}`;

export default function BarCounter() {
  const { code } = useParams<{ code?: string }>();
  // ClubContext only knows the club when we're on a club subdomain; signed-in
  // staff on the main host need their own club instead (this used to read a
  // non-existent `activeClub`, which left the page empty).
  const { club: contextClub } = useClubContext() as any;
  const { data: myClub } = useMyClub();

  const qc = useQueryClient();

  const [token, setToken] = useState<string | null>(() => (code ? localStorage.getItem(tokenKey(code)) : null));
  const [operator, setOperator] = useState<string | null>(() => (code ? localStorage.getItem(operatorKey(code)) : null));
  const [pin, setPin] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [division, setDivision] = useState("bar");
  const [category, setCategory] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [memberNumber, setMemberNumber] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState<{ id: string; display_name: string } | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scannedItem, setScannedItem] = useState<CounterItem | null>(null);
  const [scanQty, setScanQty] = useState(1);
  const [settled, setSettled] = useState<{
    tab: CounterTab;
    method: "member_account" | "cash" | "terminal";
    memberName?: string;
  } | null>(null);



  const clubId: string | null = code ? null : (contextClub?.id ?? (myClub as any)?.club?.id ?? null);
  const enabled = Boolean(token || clubId);


  const { data: board, isLoading, error: boardError, refetch } = useQuery({
    queryKey: ["bar-counter-board", token, clubId],
    enabled,
    refetchInterval: 20000,
    retry: (failureCount, err: any) => {
      // Never retry an auth/session failure — fall back to the PIN screen instead.
      if (/unlock|revok|token|permission/i.test(String(err?.message ?? ""))) return false;
      return failureCount < 2;
    },
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_counter_board", {
        _token: token,
        _club_id: clubId,
      } as any);
      if (error) throw error;
      return data as unknown as Board;
    },
  });
  // PIN-only devices receive the sellable menu from the authorised counter RPC.
  // Signed-in staff can also see their club's edited category and division labels.
  const { data: categoryRows = [] } = useBarCategories(code ? undefined : board?.club_id);
  const { divisions: configuredDivisions } = useBarDivisions(code ? undefined : board?.club_id);
  const menuDivisions = useMemo(() => {
    const keys = Array.from(new Set((board?.items ?? []).map(item => item.division || "bar")));
    return keys.map(key => ({ key, label: configuredDivisions.find(d => d.key === key)?.label || (key === "bar" ? "Bar" : key === "shop" ? "Shop" : key.replace(/_/g, " ")) }))
      .sort((a, b) => (a.key === "bar" ? -1 : b.key === "bar" ? 1 : a.key === "shop" ? -1 : b.key === "shop" ? 1 : a.label.localeCompare(b.label)));
  }, [board?.items, configuredDivisions]);
  const activeDivision = menuDivisions.some(d => d.key === division) ? division : menuDivisions[0]?.key;
  const divisionItems = useMemo(() => (board?.items ?? []).filter(item => (item.division || "bar") === activeDivision), [board?.items, activeDivision]);
  const categoryKeys = useMemo(() => {
    const keys = Array.from(new Set(divisionItems.filter(item => item.item_kind !== "special").map(item => item.category || "_other")));
    const ordered = keys.sort((a, b) => categoryLabel(categoryRows, a).localeCompare(categoryLabel(categoryRows, b)));
    return [...(divisionItems.some(item => item.item_kind === "special") ? ["_specials"] : []), ...ordered];
  }, [divisionItems, categoryRows]);
  const activeCategory = category && categoryKeys.includes(category) ? category : categoryKeys[0];
  const visibleItems = useMemo(() => divisionItems.filter(item => {
    if (itemSearch.trim() && !item.name.toLowerCase().includes(itemSearch.trim().toLowerCase())) return false;
    if (itemSearch.trim()) return true;
    if (activeCategory === "_specials") return item.item_kind === "special";
    return item.item_kind !== "special" && (item.category || "_other") === activeCategory;
  }), [divisionItems, itemSearch, activeCategory]);

  // If the stored device token was revoked ("sign out all devices") or expired,
  // drop it so the page returns to the PIN unlock screen automatically.
  useEffect(() => {
    if (!boardError || !code || !token) return;
    if (/unlock|revok|token|permission/i.test(String((boardError as any)?.message ?? ""))) {
      localStorage.removeItem(tokenKey(code));
      localStorage.removeItem(operatorKey(code));
      setOperator(null);
      setToken(null);
      setPin("");
      setActiveTabId(null);
      setCart({});
      toast.error("This device was signed out — enter the counter PIN to unlock it again.");
    }
  }, [boardError, code, token]);

  useEffect(() => {
    if (!activeTabId) setCart({});
  }, [activeTabId]);

  const activeTab = useMemo(
    () => board?.tabs.find((t) => t.tab_id === activeTabId) ?? null,
    [board, activeTabId],
  );
  // Online card payment only works through the gateways the bar checkout supports.
  const onlineAvailable = !!board && board.online_enabled !== false && !!board.venue_code
    && ["stitch", "yoco", "payfast"].includes(board.payment_gateway ?? "");
  const onlineLink = activeTab && board?.venue_code
    ? `${window.location.origin}/s/${board.venue_code}?tab=${activeTab.tab_id}&t=${(activeTab as any).token}`
    : null;
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
      const who = ((data as any)?.label as string) ?? null;
      localStorage.setItem(tokenKey(code), t);
      if (who) localStorage.setItem(operatorKey(code), who);
      setOperator(who);
      setToken(t);
      setPin("");
      toast.success(who ? `Counter unlocked — hi ${who}` : "Counter unlocked");
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

  /** Post whatever is in the basket onto the tab. Returns false if it failed. */
  async function flushCart(tabId: string): Promise<boolean> {
    const lines = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([bar_item_id, quantity]) => ({ bar_item_id, quantity }));
    if (!lines.length) return true;
    const { error } = await supabase.rpc("bar_counter_add_to_tab", {
      _tab_id: tabId, _lines: lines, _token: token, _club_id: clubId,
    } as any);
    if (error) {
      toast.error(barChargeErrorMessage(error, "Could not add the basket to the tab"), { duration: 10000 });
      return false;
    }
    setCart({});
    return true;
  }

  async function addRound() {
    if (!activeTabId) return;
    if (!Object.values(cart).some((q) => q > 0)) return;
    setBusy(true);
    try {
      if (await flushCart(activeTabId)) {
        await refetch();
        invalidate();
        toast.success("Added to tab");
      }
    } finally {
      setBusy(false);
    }
  }

  async function settle(method: "cash" | "terminal") {
    if (!activeTab) return;
    setBusy(true);
    try {
      // Never lose a round that was scanned but not yet added to the tab.
      if (!(await flushCart(activeTab.tab_id))) return;
      const { error } = await supabase.rpc("bar_counter_settle_tab", {
        _tab_id: activeTab.tab_id, _method: method, _token: token, _club_id: clubId,
      } as any);
      if (error) throw error;
      const { data: fresh } = await supabase.rpc("bar_counter_board", {
        _token: token, _club_id: clubId,
      } as any);
      const latest = (fresh as any)?.tabs?.find((t: CounterTab) => t.tab_id === activeTab.tab_id);
      setSettled({ tab: latest ?? activeTab, method });
      setCart({});
      await refetch();
      invalidate();
      toast.success("Tab settled");
    } catch (e: any) {
      toast.error(barChargeErrorMessage(e, "Could not settle the tab"), { duration: 10000 });
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
    // Post any scanned-but-not-yet-added round first, so it is billed too.
    if (!(await flushCart(activeTab.tab_id))) throw new Error("Could not add the basket to the tab");
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
    const { data: fresh } = await supabase.rpc("bar_counter_board", {
      _token: token, _club_id: clubId,
    } as any);
    const latest = (fresh as any)?.tabs?.find((t: CounterTab) => t.tab_id === activeTab.tab_id);
    setSettled({ tab: latest ?? activeTab, method: "member_account", memberName: identified.display_name });
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
            <p className="text-sm text-muted-foreground">Enter your counter PIN to start serving.</p>
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

  if (boardError && !board) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-4">
        <Card className="w-full max-w-sm p-6 space-y-3 text-center">
          <h1 className="text-base font-semibold">Counter mode could not open</h1>
          <p className="text-sm text-muted-foreground">
            {(boardError as any)?.message || "Something went wrong loading the bar counter."}
          </p>
          <Button className="w-full" onClick={() => refetch()}>Try again</Button>
        </Card>
      </div>
    );
  }

  if (isLoading || !board) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading the bar counter…
      </div>
    );
  }

  // ---- Board ------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background pb-80">
      <SEO title="Bar counter" description="Open tabs at the bar counter" path="/bar/counter" noIndex />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold leading-tight">
            {board.club_name} · Bar counter
          </h1>
          <p className="text-xs text-muted-foreground">
            {operator ? <span className="font-medium text-foreground">Serving: {operator} · </span> : null}
            {board.tabs.length} open tab{board.tabs.length === 1 ? "" : "s"} ·{" "}
            {money(board.tabs.reduce((s, t) => s + Number(t.total || 0), 0))} outstanding
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          {operator && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (code) {
                  localStorage.removeItem(tokenKey(code));
                  localStorage.removeItem(operatorKey(code));
                }
                setOperator(null);
                setToken(null);
              }}
            >
              End shift
            </Button>
          )}
        </div>
      </div>

      {settled ? (
        <div className="p-4 space-y-4 max-w-7xl mx-auto">
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
        <div className="p-4 space-y-4 max-w-7xl mx-auto">
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

        <div className="p-4 space-y-4 max-w-7xl mx-auto">
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

          {menuDivisions.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Bar or shop">
              {menuDivisions.map(d => <Button key={d.key} type="button" size="sm" variant={activeDivision === d.key ? "default" : "outline"} aria-pressed={activeDivision === d.key} onClick={() => { setDivision(d.key); setCategory(null); setItemSearch(""); }}>{d.label}</Button>)}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2" role="group" aria-label="Product categories">
            {categoryKeys.map(key => (
              <Button key={key} type="button" variant={activeCategory === key ? "default" : "outline"} aria-pressed={activeCategory === key}
                onClick={() => { setCategory(key); setItemSearch(""); }}
                className="h-auto min-h-14 min-w-0 gap-2 px-2 py-2 text-[13px] leading-tight whitespace-normal">
                <span className="text-2xl shrink-0" aria-hidden="true">{key === "_specials" ? "⭐" : BAR_CATEGORY_EMOJI[key] || "📦"}</span>
                <span className="min-w-0 break-words">{key === "_specials" ? "Specials" : key === "_other" ? "Other items" : categoryLabel(categoryRows, key)}</span>
              </Button>
            ))}
          </div>
          <Input aria-label="Search products" placeholder="Search products" value={itemSearch} onChange={e => setItemSearch(e.target.value)} className="h-10" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {visibleItems.map((item) => {
              const qty = cart[item.id] ?? 0;
              return (
                <Card key={item.id} className={`relative p-1.5 flex flex-col gap-1 ${qty > 0 ? "ring-2 ring-primary" : ""}`}>
                  <Button type="button" variant="ghost" aria-label={`Add ${item.name}`} onClick={() => setCart(c => ({ ...c, [item.id]: (c[item.id] ?? 0) + 1 }))}
                    className="h-auto min-w-0 w-full p-0 flex flex-col items-center gap-1 whitespace-normal hover:bg-accent/50">
                    <span className="w-full h-24 sm:h-28 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                      {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" loading="lazy" /> : <span className="text-3xl" aria-hidden="true">{barProductEmoji(item)}</span>}
                    </span>
                    <span className="text-[11px] font-medium leading-tight text-center break-words line-clamp-2 min-h-7 w-full">{item.name}</span>
                    <span className="text-[11px] text-muted-foreground">{money(item.price)}</span>
                  </Button>
                  <div className="flex items-center justify-between mt-auto pt-1">
                    <Button
                      size="icon" variant="outline" className="h-9 w-9" disabled={qty === 0} aria-label={`Remove ${item.name}`}
                      onClick={() => setCart((c) => ({ ...c, [item.id]: Math.max(0, (c[item.id] ?? 0) - 1) }))}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-sm font-semibold w-6 text-center tabular-nums">{qty}</span>
                    <Button
                      size="icon" variant="outline" className="h-9 w-9" aria-label={`Add ${item.name}`}
                      onClick={() => setCart((c) => ({ ...c, [item.id]: (c[item.id] ?? 0) + 1 }))}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
          {visibleItems.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{itemSearch ? "No products match your search." : "No products in this category."}</p>}

          <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 border-t bg-background p-3 space-y-2 max-h-[45vh] overflow-y-auto">
            <div className="max-w-7xl mx-auto space-y-2">
            {activeTab.status === "closing" && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
                <p className="flex-1 text-xs">Waiting for an online card payment. If the customer stopped or it got stuck, cancel it and choose another way to pay.</p>
                <Button
                  size="sm" variant="outline" className="h-9 shrink-0" disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await cancelTabCardPayment(activeTab.tab_id, (activeTab as any).token);
                      toast.success(cancelTabCardMessage[result]);
                      await refetch();
                      invalidate();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Could not cancel the card payment");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Cancel card payment
                </Button>
              </div>
            )}
            <Button className="w-full h-12 gap-2" disabled={cartTotal <= 0 || busy} onClick={addRound}>
              <Receipt className="w-4 h-4" />
              Add {money(cartTotal)} to {activeTab.guest_name}'s tab
            </Button>
            {(board.cash_enabled || board.card_enabled) && (
            <div className={`grid gap-2 ${board.cash_enabled && board.card_enabled ? "grid-cols-2" : "grid-cols-1"}`}>
              {board.cash_enabled && (
              <Button
                variant="outline" className="h-11 gap-2"
                disabled={busy || activeTab.total <= 0}
                onClick={() => settle("cash")}
              >
                <Banknote className="w-4 h-4" /> Paid cash
              </Button>
              )}
              {board.card_enabled && (
              <Button
                variant="outline" className="h-11 gap-2"
                disabled={busy || activeTab.total <= 0}
                onClick={() => settle("terminal")}
              >
                <CreditCard className="w-4 h-4" /> Card machine
              </Button>
              )}
            </div>
            )}
            {(board.account_enabled !== false || onlineAvailable) && (
              <div className={`grid gap-2 ${board.account_enabled !== false && onlineAvailable ? "grid-cols-2" : "grid-cols-1"}`}>
                {onlineAvailable && (
                  <Button
                    variant="outline" className="h-11 gap-2"
                    disabled={busy || activeTab.total <= 0}
                    onClick={async () => { if (await flushCart(activeTab.tab_id)) setOnlineOpen(true); }}
                  >
                    <Smartphone className="w-4 h-4" /> Pay online
                  </Button>
                )}
                {board.account_enabled !== false && (
                  <Button
                    variant="secondary" className="h-11 gap-2"
                    disabled={busy || activeTab.total <= 0}
                    onClick={() => { setMemberNumber(""); setMemberOpen(true); }}
                  >
                    <UserCheck className="w-4 h-4" /> Member account
                  </Button>
                )}
              </div>
            )}
            {board.online_enabled !== false && !onlineAvailable && (
              <p className="text-[11px] text-muted-foreground text-center">
                Online card payment isn't available at the bar yet for {board.payment_gateway ? board.payment_gateway.toUpperCase() : "this club's payment gateway"}.
              </p>
            )}
            </div>
          </div>

          <Dialog open={onlineOpen} onOpenChange={setOnlineOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Pay {money(activeTab.total)} online</DialogTitle>
                <DialogDescription className="text-xs">
                  {activeTab.guest_name} scans this code with their phone and pays the tab by card. The tab closes automatically once the payment is confirmed.
                </DialogDescription>
              </DialogHeader>
              {onlineLink && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="rounded-lg bg-background p-3 border"><QRCodeSVG value={onlineLink} size={220} /></div>
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(onlineLink); toast.success("Link copied"); }}>Copy link</Button>
                </div>
              )}
              <Button className="w-full" onClick={() => { setOnlineOpen(false); refetch(); }}>Done</Button>
            </DialogContent>
          </Dialog>

          <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Charge to a member account</DialogTitle>
                <DialogDescription className="text-xs">
                  Enter the member's number. They then approve {money(activeTab.total)} with a one-time code sent to their phone by SMS or WhatsApp — staff cannot approve it.
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
            onItem={(item) => { setScannedItem(item); setScanQty(1); }}
          />

          <Dialog open={!!scannedItem} onOpenChange={(o) => { if (!o) setScannedItem(null); }}>
            <DialogContent className="max-w-xs">
              <DialogHeader>
                <DialogTitle>{scannedItem?.name}</DialogTitle>
                <DialogDescription>
                  {scannedItem ? money(scannedItem.price) : ""} each — set the quantity to add to {activeTab.guest_name}'s tab.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-center gap-3 py-2">
                <Button
                  size="icon" variant="outline" className="h-10 w-10"
                  disabled={scanQty <= 1}
                  onClick={() => setScanQty((q) => Math.max(1, q - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  value={scanQty}
                  onChange={(e) => setScanQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-20 h-12 text-center text-xl font-semibold"
                />
                <Button
                  size="icon" variant="outline" className="h-10 w-10"
                  onClick={() => setScanQty((q) => q + 1)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <Button
                className="w-full h-11"
                onClick={() => {
                  if (!scannedItem) return;
                  setCart((c) => ({ ...c, [scannedItem.id]: (c[scannedItem.id] ?? 0) + scanQty }));
                  toast.success(`Added ${scanQty} × ${scannedItem.name}`);
                  setScannedItem(null);
                  // Reopen the scanner so the next item can be scanned immediately.
                  setScanOpen(true);
                }}
              >
                Add to tab{scannedItem ? ` — ${money(scannedItem.price * scanQty)}` : ""}
              </Button>
            </DialogContent>
          </Dialog>

          {identified && (
            <BarOtpDialog
              open={pinOpen}
              onOpenChange={(o) => { setPinOpen(o); if (!o) setIdentified(null); }}
              clubMemberId={identified.id}
              memberName={identified.display_name}
              amountLabel={money(activeTab.total)}
              mode="counter"
              counterToken={token}
              tabToken={activeTab.token}
              onVerified={chargeMemberAccount}
            />
          )}

        </div>
      )}
    </div>
  );
}

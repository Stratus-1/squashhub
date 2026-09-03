/**
 * Public Scan-to-Pay page — `/s/:code`
 *
 * Opened by scanning a club QR sticker (per product) or the venue poster
 * (whole menu). Works fully unauthenticated: guests build a cart and pay by
 * card, members can charge the whole cart to their club account instead.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { Loader2, Minus, Plus, CreditCard, Wallet, LogIn, CheckCircle2, ArrowLeft, ShoppingCart, X, Receipt } from "lucide-react";
import { formatMoney } from "@/lib/qr-shortcodes";
import { rememberPayReturnTarget } from "@/lib/stitch-checkout";
import { BarPinDialog } from "@/components/bar/BarPinDialog";


const GUEST_PREF_KEY = "sh.scanpay.guest";
const PENDING_SALE_KEY = "sh.scanpay.pendingSale";

interface ScanItem {
  id: string;
  name: string;
  price: number;
  category?: string;
  image_url?: string | null;
  stock_qty?: number;
}

interface ScanPayload {
  found: boolean;
  kind?: "item" | "venue";
  code?: string;
  club?: {
    id: string; name: string; logo_url: string | null;
    subdomain: string | null; currency_code: string | null; bar_enabled: boolean;
    account_tab_enabled?: boolean; pay_online_enabled?: boolean; card_swipe_enabled?: boolean;
  };
  item?: ScanItem | null;
  menu?: ScanItem[] | null;
}

interface GuestTab {
  tab_id: string;
  token: string;
  guest_name: string;
  status: string;
  total: number;
  lines: { id: string; name: string; quantity: number; total: number }[];
}

export default function ScanPay() {
  const { code = "" } = useParams();
  const navigate = useNavigate();

  const [cart, setCart] = useState<Record<string, number>>({});
  const [visitorName, setVisitorName] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [done, setDone] = useState<{ total: number; itemName: string; onAccount: boolean; cardPaid?: boolean; terminal?: boolean; reference?: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [tab, setTab] = useState<GuestTab | null>(null);
  // Guest-QR member identification: membership number + own Bar PIN.
  const [numberEntry, setNumberEntry] = useState(false);
  const [memberNumber, setMemberNumber] = useState("");
  const [identified, setIdentified] = useState<{ id: string; display_name: string; has_pin: boolean } | null>(null);
  const [identifying, setIdentifying] = useState(false);


  const [guestChosen, setGuestChosen] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem(GUEST_PREF_KEY) === "1",
  );

  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["scan-code", code],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("resolve_qr_short_code", { _code: code });
      if (error) throw error;
      return data as ScanPayload;
    },
    enabled: !!code,
  });

  const club = data?.club;
  const currency = club?.currency_code;

  // Which club_member row (if any) belongs to the signed-in user at this club
  const { data: member } = useQuery({
    queryKey: ["scan-member", club?.id, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("id, name")
        .eq("club_id", club!.id)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!club?.id && !!userId,
  });

  /** Everything the payer can tap — a single-item sticker still shows a menu of one. */
  const menu = useMemo<ScanItem[]>(() => {
    if (data?.kind === "item" && data.item) return [data.item as ScanItem];
    return (data?.menu || []) as ScanItem[];
  }, [data]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([id, qty]) => {
          const it = menu.find((m) => m.id === id);
          return it ? { item: it, qty, line: Number(it.price) * qty } : null;
        })
        .filter(Boolean) as { item: ScanItem; qty: number; line: number }[],
    [cart, menu],
  );
  const total = cartLines.reduce((s, l) => s + l.line, 0);
  const count = cartLines.reduce((s, l) => s + l.qty, 0);
  const cartLabel =
    cartLines.length === 0
      ? ""
      : cartLines.length === 1
        ? `${cartLines[0].qty}× ${cartLines[0].item.name}`
        : `${count} items`;

  const bump = (id: string, delta: number) =>
    setCart((prev) => {
      const next = Math.max(0, Math.min(50, (prev[id] || 0) + delta));
      if (next === 0) {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });

  // Returning from the Stitch hosted card page — confirm the payment landed.
  // This must NEVER block the menu: the bar list renders immediately and the
  // check runs quietly in the background.
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(PENDING_SALE_KEY) : null;
    if (!raw) return;
    let pending: { saleId: string; itemName: string; total: number; code: string; ts?: number } | null = null;
    try { pending = JSON.parse(raw); } catch { localStorage.removeItem(PENDING_SALE_KEY); return; }
    if (!pending?.saleId || pending.code !== code) return;
    // Stale leftovers (older than 15 min) are dropped — they only slow the bar down.
    if (pending.ts && Date.now() - pending.ts > 15 * 60 * 1000) {
      localStorage.removeItem(PENDING_SALE_KEY);
      return;
    }

    let cancelled = false;
    setVerifying(true);
    const poll = async (attempt = 0) => {
      if (cancelled) return;
      const { data: res } = await supabase.functions.invoke("bar-card-verify", {
        body: { sale_id: pending!.saleId },
      });
      if (cancelled) return;
      const status = (res as any)?.status;
      if (status === "paid") {
        localStorage.removeItem(PENDING_SALE_KEY);
        if ((pending as any).tab) {
          localStorage.removeItem(`sh.scanpay.tab.${code}`);
          setTab(null);
        }
        setVerifying(false);
        setDone({ total: pending!.total, itemName: pending!.itemName, onAccount: false, cardPaid: true });
        return;
      }
      if (status === "failed" || attempt >= 3) {
        localStorage.removeItem(PENDING_SALE_KEY);
        setVerifying(false);
        if (status === "failed") toast.error("That card payment did not go through.");
        return;
      }
      setTimeout(() => poll(attempt + 1), 4000);
    };
    poll();
    return () => { cancelled = true; };
  }, [code]);

  /* ---------------- Open evening tab (visitors & members) ---------------- */

  const tabKey = `sh.scanpay.tab.${code}`;

  const applyTabPayload = (payload: any) => {
    if (!payload?.found) {
      localStorage.removeItem(tabKey);
      setTab(null);
      return null;
    }
    const stored = JSON.parse(localStorage.getItem(tabKey) || "{}");
    const next: GuestTab = {
      tab_id: payload.tab_id,
      token: stored.token,
      guest_name: payload.guest_name,
      status: payload.status,
      total: Number(payload.total || 0),
      lines: payload.lines || [],
    };
    setTab(next);
    return next;
  };

  // Restore a tab opened earlier this evening on this phone.
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(tabKey) : null;
    if (!raw) return;
    let saved: { tab_id: string; token: string } | null = null;
    try { saved = JSON.parse(raw); } catch { localStorage.removeItem(tabKey); return; }
    if (!saved?.tab_id || !saved?.token) return;
    (async () => {
      const { data } = await (supabase as any).rpc("get_bar_guest_tab", {
        _tab_id: saved!.tab_id, _token: saved!.token,
      });
      const payload = data as any;
      if (!payload?.found || payload.status !== "open") {
        localStorage.removeItem(tabKey);
        return;
      }
      applyTabPayload(payload);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /** Open an empty evening tab up front — name only, no items needed. */
  const openTabNow = async () => {
    const name = member?.name || visitorName.trim();
    if (!name) {
      toast.error("Please give a name for the tab first.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("open_bar_guest_tab", {
        _code: code, _guest_name: name,
      });
      if (error) throw error;
      localStorage.setItem(tabKey, JSON.stringify({ tab_id: data.tab_id, token: data.token }));
      setTab({ tab_id: data.tab_id, token: data.token, guest_name: data.guest_name, status: "open", total: 0, lines: [] });
      toast.success(`Tab opened for ${data.guest_name} — tap items to add them.`);
    } catch (err: any) {
      toast.error(err.message || "Could not open a tab");
    } finally {
      setSubmitting(false);
    }
  };

  /** Start (or top up) an open tab for the evening with the current cart. */
  const addToOpenTab = async () => {
    if (cartLines.length === 0) return;
    const name = member?.name || visitorName.trim();
    if (!tab && !name) {
      toast.error("Please give a name for the tab first.");
      return;
    }
    setSubmitting(true);
    try {
      let current = tab;
      if (!current) {
        const { data, error } = await (supabase as any).rpc("open_bar_guest_tab", {
          _code: code, _guest_name: name,
        });
        if (error) throw error;
        localStorage.setItem(tabKey, JSON.stringify({ tab_id: data.tab_id, token: data.token }));
        current = { tab_id: data.tab_id, token: data.token, guest_name: data.guest_name, status: "open", total: 0, lines: [] };
        setTab(current);
      }
      const { data: res, error: addErr } = await (supabase as any).rpc("add_to_bar_guest_tab", {
        _tab_id: current.tab_id, _token: current.token, _lines: cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty })),
      });
      if (addErr) throw addErr;
      applyTabPayload(res);
      setCart({});
      setCheckingOut(false);
      toast.success("Added to your tab — settle up when you're ready.");
    } catch (err: any) {
      toast.error(err.message || "Could not add to your tab");
    } finally {
      setSubmitting(false);
    }
  };

  /** Pay the whole open tab online by card via the club's hosted checkout. */
  const payTabOnline = async () => {
    if (!tab) return;
    setSubmitting(true);
    try {
      rememberPayReturnTarget(`${window.location.origin}/s/${code}/success`);
      const { data: res, error } = await supabase.functions.invoke("bar-card-pay", {
        body: {
          code,
          tab_id: tab.tab_id,
          tab_token: tab.token,
          return_url: "https://squashhub.co.za/pay/return",
        },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      const redirect = (res as any)?.redirect_url;
      const saleId = (res as any)?.sale_id;
      if (!redirect) throw new Error("Card payment could not be started");
      if (saleId) {
        localStorage.setItem(
          PENDING_SALE_KEY,
          JSON.stringify({ saleId, itemName: `Bar tab · ${tab.guest_name}`, total: tab.total, code, ts: Date.now(), tab: true }),
        );
      }
      window.location.assign(String(redirect));
    } catch (err: any) {
      toast.error(err.message || "Could not start the card payment");
      setSubmitting(false);
    }
  };

  /** Close the tab: swipe the total at the club's card machine, or pay cash. */
  const settleTab = async (method: "terminal" | "cash") => {
    if (!tab) return;
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("settle_bar_guest_tab", {
        _tab_id: tab.tab_id, _token: tab.token, _method: method,
      });
      if (error) throw error;
      const total = Number((data as any)?.total || tab.total);
      localStorage.removeItem(tabKey);
      setTab(null);
      setDone({
        total,
        itemName: `Bar tab · ${tab.guest_name}`,
        onAccount: false,
        terminal: method === "terminal",
      });
    } catch (err: any) {
      toast.error(err.message || "Could not settle your tab");
    } finally {
      setSubmitting(false);
    }
  };

  /** Record a "swipe my card at the bar" order for the current cart. */
  const swipeAtClub = async () => {
    if (cartLines.length === 0) return;
    const name = member?.name || visitorName.trim() || tab?.guest_name?.trim() || "";
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("record_bar_terminal_sale", {
        _lines: cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty })),
        _code: code,
        _club_id: null,
        _buyer_name: name || null,
      });
      if (error) throw error;
      setDone({ total, itemName: cartLabel, onAccount: false, terminal: true, reference: (data as any)?.reference });
      setCart({});
      setCheckingOut(false);
    } catch (err: any) {
      toast.error(err.message || "Could not send your order to the bar");
    } finally {
      setSubmitting(false);
    }
  };


  const continueAsGuest = () => {
    localStorage.setItem(GUEST_PREF_KEY, "1");
    setGuestChosen(true);
  };

  const goLogin = () => {
    const next = `/s/${code}`;
    localStorage.removeItem(GUEST_PREF_KEY);
    navigate(`/auth?redirectTo=${encodeURIComponent(next)}`);
  };

  /** Real card checkout — hands the current tab to the club's hosted checkout. */
  const payByCardNow = async () => {
    if (cartLines.length === 0) return;
    setSubmitting(true);
    try {
      rememberPayReturnTarget(`${window.location.origin}/s/${code}/success`);
      const buyerName = member?.name || visitorName.trim() || tab?.guest_name?.trim() || null;
      const { data: res, error } = await supabase.functions.invoke("bar-card-pay", {
        body: {
          code,
          lines: cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty })),
          buyer_name: buyerName,
          return_url: "https://squashhub.co.za/pay/return",
        },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      const redirect = (res as any)?.redirect_url;
      const saleId = (res as any)?.sale_id;
      if (!redirect) throw new Error("Card payment could not be started");
      if (saleId) {
        localStorage.setItem(
          PENDING_SALE_KEY,
          JSON.stringify({ saleId, itemName: cartLabel, total, code, ts: Date.now() }),
        );
      }
      // Use one tab only. The gateway sends this same tab directly to the
      // terminal success route, avoiding a provider tab plus an uncloseable QR tab.
      window.location.assign(redirect);
    } catch (err: any) {
      toast.error(err.message || "Could not start the card payment");
      setSubmitting(false);
    }
  };


  /**
   * Member account charge from the public QR page.
   * Nothing is posted until the signed-in member approves it with their own
   * Bar PIN (or a one-time code) — the order is always attached to that
   * signed-in member, never to somebody they pick from a list.
   */
  const chargeToAccount = () => {
    if (cartLines.length === 0 || !member || !club) return;
    setPinOpen(true);
  };

  /** Look the member up from the digits on their dashboard (no login needed). */
  const identifyByNumber = async () => {
    if (!club || !memberNumber.trim()) return;
    setIdentifying(true);
    try {
      const { data, error } = await (supabase as any).rpc("bar_qr_lookup_member", {
        _club_id: club.id,
        _number: memberNumber.trim(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.id) throw new Error("No active member with that number at this club.");
      if (!row.has_pin) throw new Error("That member has no Bar PIN yet — set one in Settings → Bar PIN first.");
      setIdentified({ id: row.id, display_name: row.display_name, has_pin: row.has_pin });
      setPinOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Could not find that member number");
    } finally {
      setIdentifying(false);
    }
  };

  /** Post the basket to the identified member's account after their PIN. */
  const confirmGuestAccountCharge = async ({ secret }: { secret: string }) => {
    const { error } = await (supabase as any).rpc("bar_qr_charge_member", {
      _club_id: club!.id,
      _club_member_id: identified!.id,
      _lines: cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty })),
      _pin: secret,
    });
    if (error) throw error;
    setPinOpen(false);
    setIdentified(null);
    setNumberEntry(false);
    setMemberNumber("");
    setDone({ total, itemName: cartLabel, onAccount: true });
    setCart({});
  };

  const confirmAccountCharge = async ({ secret, method }: { secret: string; method: "pin" | "otp" }) => {
    const { error } = await (supabase as any).rpc("charge_bar_to_member", {
      _club_member_id: member!.id,
      _lines: cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty })),
      _secret: secret,
      _method: method,
      _source: "qr",
      _signature: null,
    });
    if (error) throw error;
    setPinOpen(false);
    setDone({ total, itemName: cartLabel, onAccount: true });
    setCart({});
  };


  if (isLoading || !authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.found || !club) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-lg font-semibold mb-1">Code not recognised</h1>
          <p className="text-sm text-muted-foreground">
            This QR sticker is no longer active. Please ask at the bar.
          </p>
        </div>
      </div>
    );
  }

  const showLoginPrompt = !userId && !guestChosen;

  return (
    <div className="min-h-screen bg-background pb-28">
      <SEO title={`${club.name} — Scan to pay`} description="Scan-to-pay bar and shop" path={`/s/${code}`} noIndex />

      <header className="px-4 py-4 flex items-center gap-3 border-b">
        {club.logo_url ? (
          <img src={club.logo_url} alt={`${club.name} logo`} className="w-10 h-10 rounded object-contain" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold truncate">{club.name}</h1>
          <p className="text-[11px] text-muted-foreground">Scan to pay · Bar &amp; shop</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => navigate("/", { replace: true })}
        >
          <X className="h-4 w-4" /> Close bar
        </Button>
      </header>

      {/* Always-visible account strip so there is never a dead-end screen */}
      <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2 text-[11px]">
        {member ? (
          <>
            <span className="truncate flex-1">
              Signed in as <span className="font-medium text-foreground">{member.name}</span> — you can charge to your member account.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] shrink-0"
              onClick={async () => { await supabase.auth.signOut(); setGuestChosen(true); localStorage.setItem(GUEST_PREF_KEY, "1"); }}
            >
              Sign out
            </Button>
          </>
        ) : (
          <>
            <span className="truncate flex-1 text-muted-foreground">
              {userId ? "Signed in, but not a member here — paying as a visitor." : "Paying as a guest."}
            </span>
            {!userId && (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1 shrink-0" onClick={goLogin}>
                <LogIn className="w-3 h-3" /> Log in
              </Button>
            )}
          </>
        )}
      </div>

      <main className={`px-4 py-4 max-w-md mx-auto space-y-4 ${!done && !checkingOut && count > 0 ? (tab ? "pb-40" : "pb-28") : ""}`}>

        {verifying && !done && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            Checking your previous card payment in the background…
            <button
              type="button"
              className="ml-auto underline"
              onClick={() => { localStorage.removeItem(PENDING_SALE_KEY); setVerifying(false); }}
            >
              Dismiss
            </button>
          </div>
        )}
        {done ? (
          <Card className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
            <h2 className="text-lg font-semibold">Thank you!</h2>
            <p className="text-sm text-muted-foreground">
              {done.itemName} · {formatMoney(done.total, currency)}
            </p>
            <p className="text-sm text-muted-foreground">
              {done.onAccount
                ? "Charged to your member account."
                : done.terminal
                  ? `Please swipe at the bar card machine.${done.reference ? ` Order ${done.reference}.` : ""}`
                  : done.cardPaid
                    ? "Paid by card — payment confirmed."
                    : "Your purchase has been recorded."}
            </p>
            <Button variant="outline" className="w-full" onClick={() => { setDone(null); setCheckingOut(false); }}>
              Buy something else
            </Button>
          </Card>
        ) : (
          <>
            {showLoginPrompt && (
              <Card className="p-4 space-y-3 border-primary/40">
                <p className="text-sm">
                  <span className="font-medium">Are you a member of {club.name}?</span>{" "}
                  Log in to charge this to your member account. Otherwise carry on and pay now.
                </p>
                <div className="flex gap-2">
                  <Button className="flex-1 gap-1.5" onClick={goLogin}>
                    <LogIn className="w-4 h-4" /> Yes, log me in
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={continueAsGuest}>
                    No, continue
                  </Button>
                </div>
              </Card>
            )}

            {!tab && count === 0 && (
              <Card className="p-4 space-y-3 border-amber-500/40 bg-amber-500/5">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-sm font-semibold">Staying for a while? Open a tab</p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Enter your name once, then just tap drinks all evening. Pay the whole tab at the end.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={visitorName}
                    onChange={(e) => setVisitorName(e.target.value)}
                    placeholder="Your name"
                    className="h-10"
                  />
                  <Button
                    className="shrink-0 gap-1.5 h-10"
                    disabled={submitting || !visitorName.trim()}
                    onClick={openTabNow}
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                    Open my tab
                  </Button>
                </div>
              </Card>
            )}

            {tab && tab.status !== "settled" && (
              <Card className="p-4 space-y-3 border-amber-500/50">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Your open tab · {tab.guest_name}</p>
                  <span className="text-sm font-semibold">{formatMoney(tab.total, currency)}</span>
                </div>
                <div className="space-y-1">
                  {tab.lines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="truncate">{l.quantity}× {l.name}</span>
                      <span>{formatMoney(Number(l.total), currency)}</span>
                    </div>
                  ))}
                </div>
                <Separator />
                <p className="text-[11px] text-muted-foreground">
                  {tab.status === "open"
                    ? "Keep ordering all evening, then settle the whole tab once."
                    : "This tab is awaiting payment — settle it below."}
                </p>
                <div className="space-y-2">
                  {club.pay_online_enabled !== false && (
                    <Button size="sm" className="w-full gap-1.5" disabled={submitting} onClick={payTabOnline}>
                      {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                      Pay tab online by card — {formatMoney(tab.total, currency)}
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {club.card_swipe_enabled !== false && (
                      <Button size="sm" variant={club.pay_online_enabled !== false ? "outline" : "default"} className="gap-1.5" disabled={submitting} onClick={() => settleTab("terminal")}>
                        <CreditCard className="w-3.5 h-3.5" /> Swipe at the club
                      </Button>
                    )}
                    {(club as any).cash_enabled === true && (
                      <Button size="sm" variant="outline" disabled={submitting} onClick={() => settleTab("cash")}>
                        Pay cash at the bar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {!checkingOut ? (

              <>
                <h2 className="text-sm font-semibold">Tap items to add</h2>
                <div className="grid grid-cols-3 gap-2">
                  {menu.map((m) => {
                    const qty = cart[m.id] || 0;
                    const out = typeof m.stock_qty === "number" && m.stock_qty <= 0;
                    return (
                      <Card
                        key={m.id}
                        className={`relative p-2 flex flex-col items-center gap-1 cursor-pointer transition-all hover:bg-accent/50 active:scale-95 ${qty > 0 ? "ring-2 ring-primary bg-primary/10" : ""} ${out ? "opacity-50" : ""}`}
                        onClick={() => { if (!out) { navigator.vibrate?.(15); bump(m.id, 1); } }}
                      >
                        <div className="w-full aspect-square rounded bg-muted overflow-hidden flex items-center justify-center">
                          {m.image_url ? (
                            <img src={m.image_url} alt={m.name} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <span className="text-2xl">📦</span>
                          )}
                        </div>
                        <p className="text-[11px] font-medium text-center leading-tight break-words">{m.name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatMoney(Number(m.price), currency)}</p>
                        {out && <Badge variant="destructive" className="text-[10px]">Out of stock</Badge>}
                        {qty > 0 && (
                          <>
                            <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                              {qty}
                            </span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="absolute top-1 left-1 h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); bump(m.id, -1); }}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </Card>
                    );
                  })}
                  {menu.length === 0 && (
                    <p className="col-span-3 text-sm text-muted-foreground text-center py-6">
                      Nothing is in stock right now.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <Card className="p-4 space-y-4">
                <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setCheckingOut(false)}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Add more items
                </Button>

                <div className="space-y-2">
                  {cartLines.map((l) => (
                    <div key={l.item.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight break-words">{l.item.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatMoney(Number(l.item.price), currency)} each
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => bump(l.item.id, -1)}>
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-5 text-center text-sm font-semibold">{l.qty}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => bump(l.item.id, 1)}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-16 text-right text-sm font-semibold">{formatMoney(l.line, currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="flex items-center justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(total, currency)}</span>
                </div>

                {(!member || !club.account_tab_enabled) && !tab && (
                  <div className="space-y-1">
                    <Label htmlFor="visitor-name" className="text-xs">Your name</Label>
                    <Input
                      id="visitor-name"
                      value={member?.name || visitorName}
                      disabled={!!member}
                      onChange={(e) => setVisitorName(e.target.value)}
                      placeholder="Name for the bar record"
                      className="h-9"
                    />
                  </div>
                )}
                {tab && !member && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    On your open tab as <span className="font-medium text-foreground">{tab.guest_name}</span>
                  </p>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">How would you like to pay?</p>

                  {member && club.account_tab_enabled !== false && (
                    <Button className="w-full gap-2 h-11" disabled={submitting} onClick={chargeToAccount}>
                      <Wallet className="w-4 h-4" /> Add to my member account
                    </Button>
                  )}

                  {!member && club.account_tab_enabled !== false && (
                    <div className="space-y-2">
                      {!numberEntry ? (
                        <Button variant="outline" className="w-full gap-2 h-11" onClick={() => setNumberEntry(true)}>
                          <Wallet className="w-4 h-4" /> Add to my member account
                        </Button>
                      ) : (
                        <div className="rounded-md border p-3 space-y-2">
                          <Label htmlFor="bar-member-number" className="text-xs">
                            Your membership number (digits only)
                          </Label>
                          <Input
                            id="bar-member-number"
                            value={memberNumber}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="e.g. 0036"
                            className="h-9"
                            onChange={(e) => setMemberNumber(e.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            You&apos;ll confirm with your own six-digit Bar PIN — nothing is charged before that.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              className="flex-1 gap-2 h-10"
                              disabled={identifying || !memberNumber.trim()}
                              onClick={identifyByNumber}
                            >
                              {identifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                              Continue
                            </Button>
                            <Button variant="ghost" className="h-10" onClick={() => { setNumberEntry(false); setMemberNumber(""); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {club.pay_online_enabled !== false && (
                    <Button
                      variant={member ? "outline" : "default"}
                      className="w-full gap-2 h-11"
                      disabled={submitting || (!member && !visitorName.trim() && !tab)}
                      onClick={payByCardNow}
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                      Pay with card online — {formatMoney(total, currency)}
                    </Button>
                  )}

                  {club.card_swipe_enabled !== false && (
                    <Button
                      variant="outline"
                      className="w-full gap-2 h-11"
                      disabled={submitting || (!member && !visitorName.trim() && !tab)}
                      onClick={swipeAtClub}
                    >
                      <CreditCard className="w-4 h-4" /> Swipe my card at the club
                    </Button>
                  )}

                  <Button
                    variant="secondary"
                    className="w-full gap-2 h-11"
                    disabled={submitting || (!member && !tab && !visitorName.trim())}
                    onClick={addToOpenTab}
                  >
                    <Receipt className="w-4 h-4" />
                    {tab ? "Add to my open tab" : "Open a tab for the evening"}
                  </Button>

                  <p className="text-[11px] text-muted-foreground text-center">
                    {member
                      ? `Signed in as ${member.name}`
                      : `Card payments go through ${club.name}'s secure checkout.`}
                  </p>
                  {userId && !member && (
                    <p className="text-[11px] text-muted-foreground text-center">
                      You are signed in but not a member of {club.name}, so this is recorded as a visitor sale.
                    </p>
                  )}
                  {!userId && (
                    <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={goLogin}>
                      <LogIn className="w-3.5 h-3.5" /> I&apos;m a member — log in instead
                    </Button>
                  )}
                </div>

              </Card>
            )}
          </>
        )}
      </main>

      {/* Sticky cart bar — always visible while items are selected */}
      {!done && !checkingOut && count > 0 && (
        <div className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur px-4 py-3 z-40">
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{count} item{count > 1 ? "s" : ""} selected</p>
                <p className="text-base font-semibold">{formatMoney(total, currency)}</p>
              </div>
              {tab ? (
                <Button className="gap-2 h-11" disabled={submitting} onClick={addToOpenTab}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                  Add to my open tab
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="gap-1.5 h-11"
                    disabled={submitting}
                    onClick={() => {
                      // Members can open a tab straight away (their name is known);
                      // guests go to checkout where they enter a name for the tab.
                      if (member) addToOpenTab();
                      else setCheckingOut(true);
                    }}
                  >
                    <Receipt className="w-4 h-4" /> Open a tab
                  </Button>
                  <Button className="gap-2 h-11 flex-1" onClick={() => setCheckingOut(true)}>
                    <ShoppingCart className="w-4 h-4" /> Done — checkout
                  </Button>
                </div>
              )}
            </div>
            {tab && (
              <Button variant="outline" className="w-full gap-2" onClick={() => setCheckingOut(true)}>
                <CreditCard className="w-4 h-4" /> Pay now instead — card, swipe or cash
              </Button>
            )}
          </div>
        </div>
      )}
      {!member && identified && (
        <BarPinDialog
          open={pinOpen}
          onOpenChange={(o) => { setPinOpen(o); if (!o) setIdentified(null); }}
          clubMemberId={identified.id}
          memberName={identified.display_name}
          amountLabel={formatMoney(total, currency)}
          pinOnly
          onVerified={confirmGuestAccountCharge}
        />
      )}
      {member && (
        <BarPinDialog
          open={pinOpen}
          onOpenChange={setPinOpen}
          clubMemberId={member.id}
          memberName={member.name}
          amountLabel={formatMoney(total, currency)}
          onVerified={confirmAccountCharge}
        />
      )}
    </div>
  );
}

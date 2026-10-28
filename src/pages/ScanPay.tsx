import { spiritMixers, withSpiritMixers } from "@/lib/bar-spirit-menu";
import { showBarChargeError } from "@/lib/bar-charge-toast";
import { showKeepOpenHint } from "@/lib/bar/collection-alert";
/**
 * Public Scan-to-Pay page — `/s/:code`
 *
 * Opened by scanning a club QR sticker (per product) or the venue poster
 * (whole menu). Works fully unauthenticated: guests build a cart and pay by
 * card, members can charge the whole cart to their club account instead.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useBarAutoRefresh } from "@/hooks/use-bar-auto-refresh";
import { useNavigate, useParams } from "react-router-dom";
import { GuestOrderDialog, GuestOrderProgress } from "@/components/bar/GuestOrderDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { Loader2, Minus, Plus, CreditCard, Wallet, CheckCircle2, ArrowLeft, ShoppingCart, X, Receipt, Store, ScanBarcode } from "lucide-react";
import { formatMoney } from "@/lib/qr-shortcodes";
import { rememberPayReturnTarget } from "@/lib/stitch-checkout";
import { BarOtpDialog } from "@/components/bar/BarOtpDialog";
import { ProductScanDialog } from "@/components/bar/ProductScanDialog";
import type { BarDivision } from "@/lib/bar-categories";
import { BAR_CATEGORY_EMOJI, barProductEmoji, categoryLabel, useBarCategories, useBarDivisions } from "@/lib/bar-categories";
import { validitySummary } from "@/lib/bar-inventory";
import { cancelTabCardPayment, cancelTabCardMessage } from "@/lib/bar/cancel-tab-card-payment";
import { accountChargeStart, takeMemberTabDraft } from "@/lib/bar/member-tab-handoff";
import { useMemberContext } from "@/contexts/MemberContext";
import { useBarTips } from "@/hooks/use-bar-tips";
import { TipEditor } from "@/components/bar/TipEditor";
import { emptyTip, tipQuote, type TipChoice } from "@/lib/bar/tips";
import { MemberAccountTipDialog } from "@/components/bar/MemberAccountTipDialog";
import { memberSettlementTip, type ServingPerson } from "@/lib/bar/member-settlement-tip";


const GUEST_PREF_KEY = "sh.scanpay.guest";
const KEEP_OPEN_HINT_KEY = "sh.scanpay.keep-open-hint";
const PENDING_SALE_KEY = "sh.scanpay.pendingSale";

interface ScanItem {
  id: string;
  name: string;
  price: number;
  category?: string;
  division?: BarDivision | null;
  image_url?: string | null;
  stock_qty?: number;
  barcode?: string | null;
  item_kind?: string | null;
  stock_parent_id?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  valid_days?: number[] | null;
  valid_start_time?: string | null;
  valid_end_time?: string | null;
}

/** Combo specials get their own pill so a time-limited deal is never buried in a category. */
const SPECIALS_KEY = "__specials";

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
  settled_method?: string | null;
  total: number;
  subtotal?: number;
  tip?: number;
  lines: { id: string; name: string; quantity: number; total: number }[];
}

/** An order waiting for staff to take payment at the counter (card machine or cash). Never "paid" until staff confirm. */
interface CounterPayment {
  tab_id: string;
  token: string;
  total: number;
  label: string;
  method: "terminal" | "cash";
  reference?: string;
  /** True when it came from an evening tab — a declined card reopens that tab. */
  fromTab?: boolean;
}

export default function ScanPay() {
  const { code = "" } = useParams();
  const navigate = useNavigate();

  const [cart, setCart] = useState<Record<string, number>>(() => takeMemberTabDraft(code, new URLSearchParams(window.location.search).get("member_tab")));
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [division, setDivision] = useState<BarDivision>("bar");
  const [category, setCategory] = useState<string>("all");
  const [done, setDone] = useState<{ total: number; itemName: string; onAccount: boolean; cardPaid?: boolean; counterConfirmed?: "terminal" | "cash"; reference?: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [tab, setTab] = useState<GuestTab | null>(null);
  // Guest-QR member identification: membership number + own Bar PIN.
  const [numberEntry, setNumberEntry] = useState(false);
  const [memberNumber, setMemberNumber] = useState("");
  const [identified, setIdentified] = useState<{ id: string; display_name: string; has_pin: boolean } | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [accountChargeTarget, setAccountChargeTarget] = useState<"cart" | "tab">("cart");
  const [tipChoice, setTipChoice] = useState<TipChoice>(emptyTip);
  const [settleTipOpen, setSettleTipOpen] = useState(false);


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
  const { data: tipConfig } = useBarTips(club?.id);
  const currency = club?.currency_code;
  const { data: catRows } = useBarCategories(club?.id);
  const { divisions: configuredDivisions } = useBarDivisions(club?.id);
  const { data: orderProcess = false } = useQuery({
    queryKey: ["bar-order-process", club?.id],
    enabled: !!club?.id,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("bar_order_process_status", { _club_id: club!.id });
      return data === true;
    },
  });
  // The person running the counter opens/closes the bar for phone orders.
  const { data: barOpen = false } = useQuery({
    queryKey: ["bar-accepting-orders", club?.id],
    enabled: !!club?.id && orderProcess,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("bar_accepting_orders", { _club_id: club!.id });
      return data === true;
    },
  });
  const [orderTab, setOrderTab] = useState<GuestTab | null>(null);
  const queryClient = useQueryClient();

  // The public QR page stays identity-free for guests. A signed-in member who
  // is confirmed as an active member of THIS club charges straight to their
  // account — the app session is the verification and the charge functions
  // re-check ownership server-side. Everyone else keeps the membership-number
  // plus one-time-code flow.
  const member: { id: string; name: string } | null = null;
  const { activeMember } = useMemberContext();

  // A signed-in member of THIS club gets the simple flow: no guest prompts or
  // name entry — their tab carries their own name automatically.
  const { data: signedInMembership } = useQuery({
    queryKey: ["scanpay-club-membership", club?.id, activeMember?.id],
    enabled: !!club?.id && !!activeMember?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("club_members")
        .select("id, name")
        .eq("id", activeMember!.id)
        .eq("club_id", club!.id)
        .eq("status", "active")
        .maybeSingle();
      return data ?? null;
    },
  });
  const isSignedInMember = !!signedInMembership;
  const signedInName = isSignedInMember ? signedInMembership!.name || activeMember?.name || "Member" : null;
  const [checkingMembership, setCheckingMembership] = useState(false);
  const [memberTipPending, setMemberTipPending] = useState<{ target: "cart" | "tab"; memberId: string; staff: ServingPerson[]; requestId: string } | null>(null);
  const accountChargeBusy = useRef(false);

  const chargeSignedInAccount = async (target: "cart" | "tab", memberId: string, choice?: TipChoice, staff: ServingPerson[] = [], requestId?: string) => {
    if (!club || accountChargeBusy.current) return;
    accountChargeBusy.current = true;
    setCheckingMembership(true);
    try {
      const subtotal = target === "tab" && tab ? tab.subtotal ?? tab.total : total;
      const quote = choice ? memberSettlementTip(subtotal, choice, staff) : null;
      if (target === "tab") {
        if (!tab) throw new Error("Your tab is no longer open. Refresh and try again.");
        const settledName = tab.guest_name;
        const { error } = await (supabase as any).rpc(quote ? "bar_member_tab_account_with_tip" : "bar_qr_charge_guest_tab_member_session", {
          _tab_id: tab.tab_id, _token: tab.token, _club_member_id: memberId,
          ...(quote ? { _tip: quote.tip, _staff_id: quote.staffId } : {}),
        });
        if (error) throw error;
        localStorage.removeItem(tabKey);
        setTab(null);
        setDone({ total: quote?.total ?? tab.total, itemName: `Bar tab · ${settledName}`, onAccount: true });
      } else {
        const { error } = await (supabase as any).rpc(quote ? "bar_member_cart_account_with_tip" : "bar_qr_charge_member_session", {
          _club_id: club.id, _club_member_id: memberId,
          _lines: cartLines.map(l => ({ bar_item_id: l.item.id, quantity: l.qty })),
          ...(quote ? { _tip: quote.tip, _staff_id: quote.staffId, _request_id: requestId } : {}),
        });
        if (error) throw error;
        setDone({ total: quote?.total ?? total, itemName: cartLabel, onAccount: true });
        setCart({});
      }
      setMemberTipPending(null);
      setTipChoice(emptyTip);
      toast.success("Charged to your member account", { closeButton: true, duration: 8000 });
    } catch (err: any) {
      toast.error(err?.message || "Could not charge your member account");
    } finally {
      accountChargeBusy.current = false;
      setCheckingMembership(false);
    }
  };

  /** Start a member-account charge: direct for a confirmed signed-in member, number entry + one-time code otherwise. */
  const startAccountCharge = async (target: "cart" | "tab") => {
    if (checkingMembership || memberTipPending) return;
    setAccountChargeTarget(target);
    if (!club || !activeMember) { setNumberEntry(true); return; }
    setCheckingMembership(true);
    try {
      const { data, error: membershipError } = await supabase
        .from("club_members")
        .select("id, name")
        .eq("id", activeMember.id)
        .eq("club_id", club.id)
        .eq("status", "active")
        .maybeSingle();
      if (membershipError) throw membershipError;
      const start = accountChargeStart(activeMember, data);
      if (start.mode !== "direct") { setNumberEntry(true); return; }
      if (!tipConfig) throw new Error("The bar settings are still loading. Please try again.");
      if (tipConfig.enabled) {
        const { data: serving, error } = await supabase.rpc("bar_member_tip_staff", { _club_id: club.id });
        if (error) throw error;
        setMemberTipPending({ target, memberId: start.memberId, staff: serving ?? [], requestId: crypto.randomUUID() });
        return;
      }
      await chargeSignedInAccount(target, start.memberId);
    } catch (err: any) {
      toast.error(err?.message || "Could not charge your member account");
    } finally {
      setCheckingMembership(false);
    }
  };


  /** Everything the payer can tap — a single-item sticker still shows a menu of one. */
  const menu = useMemo<ScanItem[]>(() => {
    if (data?.kind === "item" && data.item) return [data.item as ScanItem];
    const allowed = new Set(configuredDivisions.map(d => d.key));
    return ((data?.menu || []) as ScanItem[]).filter(item => allowed.has(item.division || "bar"));
  }, [data, configuredDivisions]);
  // Division tabs come from what this club actually sells (clubs can configure their own divisions).
  const menuDivisions = useMemo(() => {
    const keys = Array.from(new Set(menu.map((m) => (m.division || "bar") as string)));
    const rank = (k: string) => (k === "bar" ? 0 : k === "shop" ? 1 : 2);
    return keys.length ? keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)) : configuredDivisions.map(d => d.key);
  }, [menu, configuredDivisions]);
  const activeDivision = menuDivisions.includes(division) ? division : menuDivisions[0];
  const divisionMenu = useMemo(
    () => (data?.kind === "item" ? menu : menu.filter((item) => (item.division || "bar") === activeDivision)),
    [data?.kind, menu, activeDivision],
  );

  // Category pills for the chosen division. Time-limited combo specials always
  // sit in their own pill so a deal is never hidden inside a drinks category.
  const categoryKeys = useMemo(() => {
    const hasSpecials = divisionMenu.some((m) => m.item_kind === "special");
    const rest = Array.from(
      new Set(divisionMenu.filter((m) => m.item_kind !== "special").map((m) => (m.category || "").trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
    return [...(hasSpecials ? [SPECIALS_KEY] : []), ...rest];
  }, [divisionMenu]);
  const activeCategory = category !== "all" && !categoryKeys.includes(category) ? "all" : category;


  // Mixer ("buddy") choices for spirit + mixer orders. The backend returns a
  // dedicated buddies list (includes non-sellable bulk mixers like Coke Bulk);
  // fall back to scanning the menu for older backends.
  const buddyItems = useMemo<ScanItem[]>(() => {
    const fromBackend = ((data as any)?.buddies || []) as ScanItem[];
    const source = [...menu, ...fromBackend.filter(b => !menu.some(m => m.id === b.id))];
    const candidates = spiritMixers(source).filter(
      (m) =>
        !(m.name === "Coke Bulk" && source.some(s => s.name.startsWith("Coke Bulk · "))) &&
        (m.item_kind === "made_to_order" || typeof m.stock_qty !== "number" || m.stock_qty > 0),
    );
    candidates.sort((a, b) => Number(a.price) - Number(b.price));
    return candidates;
  }, [data, menu]);


  const visibleMenu = useMemo(() => {
    if (activeCategory === "all") return divisionMenu;
    if (activeCategory === SPECIALS_KEY) return divisionMenu.filter(m => m.item_kind === "special");
    const categoryItems = divisionMenu.filter(m => m.item_kind !== "special" && (m.category || "").trim() === activeCategory);
    return withSpiritMixers(categoryItems, buddyItems, activeCategory);
  }, [divisionMenu, activeCategory, buddyItems]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([id, qty]) => {
          const it = menu.find((m) => m.id === id) ?? buddyItems.find((b) => b.id === id);
          return it ? { item: it, qty, line: Number(it.price) * qty } : null;
        })
        .filter(Boolean) as { item: ScanItem; qty: number; line: number }[],
    [cart, menu, buddyItems],
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
        body: { sale_id: pending!.saleId, cancelled: new URLSearchParams(window.location.search).has("payfast_cancelled") },
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
      if (status === "failed" || attempt >= 8) {
        localStorage.removeItem(PENDING_SALE_KEY);
        setVerifying(false);
        if (status === "failed") toast.error("That card payment did not go through and was cancelled — nothing was charged. Please try again.");
        return;
      }
      setTimeout(() => poll(attempt + 1), 4000);
    };
    poll();
    return () => { cancelled = true; };
  }, [code]);

  /* ---------------- Open evening tab (visitors & members) ---------------- */

  const tabKey = `sh.scanpay.tab.${code}`;
  const confirmedTab = useRef<string | null>(null);
  const showTabPaid = (payload: any, fallback: { total: number; label: string; reference?: string }) => {
    if (confirmedTab.current === payload.tab_id) return;
    confirmedTab.current = payload.tab_id;
    const method = payload.settled_method;
    const amount = Number(payload.total ?? fallback.total);
    setDone({ total: amount, itemName: fallback.label, onAccount: method === "member_account",
      counterConfirmed: method === "cash" || method === "terminal" ? method : undefined,
      cardPaid: method === "online", reference: fallback.reference });
    setCart({});
    setCheckingOut(false);
    toast.success(method === "member_account" ? "Charged to your member account" : "Thank you — payment received", {
      description: formatMoney(amount, currency), closeButton: true, duration: 8000,
    });
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* Optional phone feedback. */ }
  };

  const applyTabPayload = (payload: any) => {
    if (!payload?.found) {
      localStorage.removeItem(tabKey);
      setTab(null);
      return null;
    }
    if (payload.status === "settled") {
      localStorage.removeItem(tabKey);
      setTab(null);
      showTabPaid(payload, { total: tab?.total ?? 0, label: `Bar tab · ${payload.guest_name || tab?.guest_name || ""}` });
      return null;
    }
    const stored = JSON.parse(localStorage.getItem(tabKey) || "{}");
    const next: GuestTab = {
      tab_id: payload.tab_id,
      token: stored.token,
      guest_name: payload.guest_name,
      status: payload.status,
      settled_method: payload.settled_method ?? null,
      total: Number(payload.total || 0),
      subtotal: Number(payload.subtotal ?? payload.total ?? 0),
      tip: Number(payload.tip ?? 0),
      lines: payload.lines || [],
    };
    setTab(next);
    return next;
  };

  // Restore a tab opened earlier this evening on this phone.
  useEffect(() => {
    // Counter "Pay online" QR carries the tab so the guest can pay it here.
    const qp = new URLSearchParams(window.location.search);
    const qTab = qp.get("tab"), qTok = qp.get("t");
    if (qTab && qTok) localStorage.setItem(tabKey, JSON.stringify({ tab_id: qTab, token: qTok }));
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
      // Keep a tab that is awaiting payment so its card payment can still be cancelled.
      if (!payload?.found) {
        localStorage.removeItem(tabKey);
        return;
      }
      applyTabPayload(payload);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /* ---------------- Awaiting payment at the counter ---------------- */
  const counterKey = `sh.scanpay.counterpay.${code}`;
  const [counterPay, setCounterPay] = useState<CounterPayment | null>(() => {
    try { return JSON.parse(localStorage.getItem(`sh.scanpay.counterpay.${code}`) || "null"); } catch { return null; }
  });
  const startCounterPay = (cp: CounterPayment) => {
    localStorage.setItem(counterKey, JSON.stringify(cp));
    setCounterPay(cp);
  };
  const clearCounterPay = () => { localStorage.removeItem(counterKey); setCounterPay(null); };

  // Staff may settle any open/online tab directly on another device.
  useBarAutoRefresh(!!tab && !counterPay, async () => {
    if (!tab) return;
    const { data: payload, error } = await (supabase as any).rpc("get_bar_guest_tab", { _tab_id: tab.tab_id, _token: tab.token });
    if (error) throw error;
    applyTabPayload(payload);
  });

  // Refresh the counter payment status until staff confirm, decline or the customer cancels.
  useBarAutoRefresh(!!counterPay, async () => {
    if (!counterPay) return;
      const { data, error } = await (supabase as any).rpc("get_bar_guest_tab", { _tab_id: counterPay.tab_id, _token: counterPay.token });
      if (error) throw error;
      const p = data as any;
      if (!p?.found) { clearCounterPay(); return; }
      if (p.status === "settled") {
        clearCounterPay();
        localStorage.removeItem(tabKey);
        setTab(null);
        showTabPaid(p, { total: counterPay.total, label: counterPay.label, reference: counterPay.reference });
      } else if (p.status === "open") {
        clearCounterPay();
        if (counterPay.fromTab) {
          localStorage.setItem(tabKey, JSON.stringify({ tab_id: counterPay.tab_id, token: counterPay.token }));
          applyTabPayload(p);
          toast.info("Payment was not completed at the counter — your tab is open again. Choose a way to pay.");
        } else {
          toast.info("Payment was not completed at the counter. Nothing was charged.");
        }
      }
  });

  const cancelCounterPay = async () => {
    if (!counterPay) return;
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("bar_guest_cancel_counter_payment", { _tab_id: counterPay.tab_id, _token: counterPay.token });
      if (error) throw error;
      const p = data as any;
      if (p?.status === "settled") {
        clearCounterPay();
        setDone({ total: Number(p.total), itemName: counterPay.label, onAccount: false, counterConfirmed: counterPay.method, reference: counterPay.reference });
        return;
      }
      clearCounterPay();
      if (counterPay.fromTab && p?.found) {
        localStorage.setItem(tabKey, JSON.stringify({ tab_id: counterPay.tab_id, token: counterPay.token }));
        applyTabPayload(p);
        toast.success("Your tab is open again — choose another way to pay.");
      } else {
        toast.success("Order cancelled. Nothing was charged.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not cancel");
    } finally {
      setSubmitting(false);
    }
  };

  /** Open an empty evening tab up front — name only, no items needed. */
  const openTabNow = async () => {
    const name = member?.name || signedInName || visitorName.trim();
    if (!name) {
      toast.error("Please give a name for the tab first.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("open_bar_guest_tab", {
        _code: code, _guest_name: name, _guest_phone: visitorPhone.trim() || null,
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
    const name = member?.name || signedInName || visitorName.trim();
    if (!tab && !name) {
      toast.error("Please give a name for the tab first.");
      return;
    }
    setSubmitting(true);
    try {
      let current = tab;
      if (!current) {
        const { data, error } = await (supabase as any).rpc("open_bar_guest_tab", {
          _code: code, _guest_name: name, _guest_phone: visitorPhone.trim() || null,
        });
        if (error) throw error;
        localStorage.setItem(tabKey, JSON.stringify({ tab_id: data.tab_id, token: data.token }));
        current = { tab_id: data.tab_id, token: data.token, guest_name: data.guest_name, status: "open", total: 0, lines: [] };
        setTab(current);
      }
      if (orderProcess) {
        // Order process: the customer explicitly places an order (collect/deliver).
        setOrderTab(current);
        return;
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
      showBarChargeError(err, "Could not add to your tab");
    } finally {
      setSubmitting(false);
    }
  };

  /** Pay the whole open tab online by card via the club's hosted checkout. */
  const payTabOnline = async () => {
    if (!tab) return;
    setSubmitting(true);
    try {
      const quote = tipConfig?.enabled ? tipQuote(tab.subtotal ?? tab.total, tipChoice) : null;
      if (quote?.tip && !tipConfig?.online_tips_ready) throw new Error("Online tips await payment release; choose cash, card at the bar or member account.");
      rememberPayReturnTarget(`${window.location.origin}/s/${code}/success`);
      const { data: res, error } = await supabase.functions.invoke("bar-card-pay", {
        body: {
          code,
          tab_id: tab.tab_id,
          tab_token: tab.token,
          ...(quote ? { tip_amount: quote.tip, tip_staff_id: tipChoice.staffId || null } : {}),
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
      const quote = tipConfig?.enabled ? tipQuote(tab.subtotal ?? tab.total, tipChoice) : null;
      const { data, error } = await (supabase as any).rpc(quote ? "bar_request_settlement_with_tip" : "settle_bar_guest_tab", {
        _tab_id: tab.tab_id, _token: tab.token, _method: method,
        ...(quote ? { _tip: quote.tip, _staff_id: tipChoice.staffId || null } : {}),
      });
      if (error) throw error;
      const p = data as any;
      if (p?.status === "closing" && p?.settled_method === "online") {
        applyTabPayload(p);
        toast.error("An online card payment is still in progress for this tab — cancel it first.");
        return;
      }
      localStorage.removeItem(tabKey);
      setTab(null);
      startCounterPay({
        tab_id: tab.tab_id, token: tab.token,
        total: Number(p?.total ?? tab.total),
        label: `Bar tab · ${tab.guest_name}`,
        method, fromTab: true,
      });
    } catch (err: any) {
      showBarChargeError(err, "Could not settle your tab");
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
      const quote = tipConfig?.enabled ? tipQuote(total, tipChoice) : null;
      const { data, error } = await (supabase as any).rpc(quote ? "bar_terminal_cart_with_tip" : "record_bar_terminal_sale", {
        _lines: cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty })),
        _code: code,
        ...(quote ? { _tip: quote.tip, _staff_id: tipChoice.staffId || null } : { _club_id: null }),
        _buyer_name: name || null,
      });
      if (error) throw error;
      const d = data as any;
      if (!d?.tab_id || !d?.token) throw new Error("Could not send your order to the bar");
      startCounterPay({ tab_id: d.tab_id, token: d.token, total: Number(d.total ?? total), label: cartLabel, method: "terminal", reference: d.reference });
      setCart({});
      setCheckingOut(false);
    } catch (err: any) {
      showBarChargeError(err, "Could not send your order to the bar");
    } finally {
      setSubmitting(false);
    }
  };


  const continueAsGuest = () => {
    localStorage.setItem(GUEST_PREF_KEY, "1");
    setGuestChosen(true);
  };


  /** Real card checkout — hands the current tab to the club's hosted checkout. */
  const payByCardNow = async () => {
    if (cartLines.length === 0) return;
    setSubmitting(true);
    try {
      const quote = tipConfig?.enabled ? tipQuote(total, tipChoice) : null;
      if (quote?.tip && !tipConfig?.online_tips_ready) throw new Error("Online tips await payment release; choose card at the bar or member account.");
      rememberPayReturnTarget(`${window.location.origin}/s/${code}/success`);
      const buyerName = member?.name || visitorName.trim() || tab?.guest_name?.trim() || null;
      const { data: res, error } = await supabase.functions.invoke("bar-card-pay", {
        body: {
          code,
          lines: cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty })),
          buyer_name: buyerName,
          ...(quote ? { tip_amount: quote.tip, tip_staff_id: tipChoice.staffId || null } : {}),
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
    if (!club || !identified) return;
    const isTabCharge = accountChargeTarget === "tab" && tab !== null;
    const quote = tipConfig?.enabled ? tipQuote(isTabCharge ? tab.subtotal ?? tab.total : total, tipChoice) : null;
    const { error } = isTabCharge
      ? await (supabase as any).rpc(quote ? "bar_qr_account_with_tip" : "bar_qr_charge_guest_tab_member", {
          _tab_id: tab.tab_id,
          _token: tab.token,
          _club_member_id: identified.id,
          _pin: secret,
          ...(quote ? { _tip: quote.tip, _staff_id: tipChoice.staffId || null } : {}),
        })
      : await (supabase as any).rpc(quote ? "bar_qr_cart_account_with_tip" : "bar_qr_charge_member", {
          ...(quote ? { _code: code, _tip: quote.tip, _staff_id: tipChoice.staffId || null } : { _club_id: club.id }),
          _club_member_id: identified.id,
          _lines: cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty })),
          _pin: secret,
        });
    if (error) throw error;
    const chargedTotal = quote?.total ?? (isTabCharge ? tab.total : total);
    const chargedLabel = isTabCharge ? `Bar tab · ${tab.guest_name}` : cartLabel;
    if (isTabCharge) {
      localStorage.removeItem(tabKey);
      setTab(null);
    }
    setPinOpen(false);
    setIdentified(null);
    setNumberEntry(false);
    setMemberNumber("");
    setAccountChargeTarget("cart");
    setDone({ total: chargedTotal, itemName: chargedLabel, onAccount: true });
    setCart({});
  };

  const confirmAccountCharge = async ({ secret, method }: { secret: string; method: "otp" }) => {
    if (!member) throw new Error("Select your member account");
    const quote = tipConfig?.enabled ? tipQuote(total, tipChoice) : null;
    const { error } = await (supabase as any).rpc(quote ? "bar_qr_cart_account_with_tip" : "charge_bar_to_member", quote ? {
      _club_member_id: member.id, _code: code, _lines: cartLines.map(l => ({ bar_item_id: l.item.id, quantity: l.qty })), _pin: secret, _tip: quote.tip, _staff_id: tipChoice.staffId || null,
    } : {
      _club_member_id: member.id,
      _lines: cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty })),
      _secret: secret,
      _method: method,
      _source: "qr",
      _signature: null,
    });
    if (error) throw error;
    setPinOpen(false);
    setDone({ total: quote?.total ?? total, itemName: cartLabel, onAccount: true });
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

  const showLoginPrompt = !guestChosen && !isSignedInMember;

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

      {/* Neutral strip — this page never assumes who is holding the phone */}
      <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2 text-[11px]">
        {!isSignedInMember && (
          <span className="truncate flex-1 text-muted-foreground">
            Members: charge to your account with your membership number and a one-time code sent to your phone. Visitors: pay by card or open a tab.
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-8 shrink-0 gap-1.5 px-2.5 text-xs ${isSignedInMember ? "ml-auto" : ""}`}
          onClick={() => navigate(`/s/${code}/counter`)}
        >
          <Store className="h-3.5 w-3.5" /> Counter mode
        </Button>
      </div>


      <main className={`px-4 py-4 max-w-md mx-auto space-y-4 ${!done && !checkingOut && count > 0 ? (tab ? "pb-56" : "pb-44") : "pb-24"}`}>

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
                : done.counterConfirmed
                  ? `${done.counterConfirmed === "cash" ? "Cash" : "Card"} payment confirmed by the bar.${done.reference ? ` Order ${done.reference}.` : ""}`
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
                  <span className="font-medium">Member of {club.name}?</span>{" "}
                  No login needed — tap items, then choose <span className="font-medium">Add to my member account</span> and
                  confirm with your membership number and a one-time code sent to your phone. Visitors just pay by card.
                </p>
                <Button className="w-full" onClick={continueAsGuest}>
                  Got it — start ordering
                </Button>
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
                  <Input
                    value={visitorPhone}
                    onChange={(e) => setVisitorPhone(e.target.value)}
                    placeholder="Cell number"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    className="h-10"
                  />
                </div>
                <Button
                  className="w-full gap-1.5 h-10"
                  disabled={submitting || !visitorName.trim()}
                  onClick={openTabNow}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                  Open my tab
                </Button>
              </Card>
            )}

            {counterPay && (
              <Card className="p-4 space-y-3 border-amber-500/60" aria-live="polite">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  <p className="text-sm font-semibold">
                    {counterPay.method === "cash" ? "Awaiting cash payment at the counter" : "Awaiting card payment at the counter"}
                  </p>
                </div>
                <p className="text-sm">{counterPay.label} · <span className="font-semibold">{formatMoney(counterPay.total, currency)}</span></p>
                <p className="text-[11px] text-muted-foreground">
                  {counterPay.method === "cash"
                    ? "Pay the barman in cash. This is not paid until the bar confirms it."
                    : "Go to the counter and tap or swipe your card on the card machine. This is not paid until the bar confirms the card was approved."}
                  {counterPay.reference ? ` Order ${counterPay.reference}.` : ""}
                </p>
                <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={submitting} onClick={cancelCounterPay}>
                  <X className="w-3.5 h-3.5" /> {counterPay.fromTab ? "Choose another way to pay" : "Cancel this order"}
                </Button>
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
                {orderProcess && <GuestOrderProgress tab={tab} />}
                {!activeMember && tipConfig?.enabled && tab.status === "open" && tab.total > 0 && cartLines.length === 0 && (tipChoice.mode === "none" && !settleTipOpen
                  ? <Button size="sm" variant="ghost" onClick={() => setSettleTipOpen(true)}>Settling your tab? Add a tip</Button>
                  : <div className="space-y-1"><TipEditor subtotal={tab.subtotal ?? tab.total} choice={tipChoice} onChange={setTipChoice} staff={tipConfig.staff} disabled={submitting} /><Button size="sm" variant="ghost" onClick={() => { setSettleTipOpen(false); setTipChoice(emptyTip); }}>No tip</Button></div>)}
                {(tab.tip ?? 0) > 0 && <p className="text-xs">Included tip: {formatMoney(tab.tip ?? 0, currency)}</p>}
                <Separator />
                <p className="text-[11px] text-muted-foreground">
                  {tab.status === "open"
                    ? "Keep ordering all evening, then settle the whole tab once."
                    : "This tab is awaiting payment — settle it below."}
                </p>
                {tab.status === "closing" && tab.settled_method === "online" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5"
                    disabled={submitting}
                    onClick={async () => {
                      setSubmitting(true);
                      try {
                        const result = await cancelTabCardPayment(tab.tab_id, tab.token);
                        localStorage.removeItem(PENDING_SALE_KEY);
                        setVerifying(false);
                        toast.success(cancelTabCardMessage[result]);
                        const { data } = await (supabase as any).rpc("get_bar_guest_tab", { _tab_id: tab.tab_id, _token: tab.token });
                        if ((data as any)?.status === "settled") { localStorage.removeItem(tabKey); setTab(null); }
                        else applyTabPayload(data);
                      } catch (e: any) {
                        toast.error(e?.message || "Could not cancel the card payment");
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    <X className="w-3.5 h-3.5" /> Cancel card payment
                  </Button>
                )}
                <div className="space-y-2">
                  {club.account_tab_enabled !== false && (
                    <div className="space-y-2">
                      {!numberEntry || accountChargeTarget !== "tab" ? (
                        <Button
                          className="w-full gap-2 h-11"
                          disabled={submitting || checkingMembership || tab.total <= 0}
                          onClick={() => startAccountCharge("tab")}
                        >
                          <Wallet className="w-4 h-4" /> Charge tab to my member account
                        </Button>
                      ) : (
                        <div className="rounded-md border p-3 space-y-2">
                          <Label htmlFor="tab-member-number" className="text-xs">
                            Your membership number (digits only)
                          </Label>
                          <Input
                            id="tab-member-number"
                            value={memberNumber}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="e.g. 0036"
                            className="h-9"
                            onChange={(e) => setMemberNumber(e.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground">
                            You&apos;ll approve the full tab with a one-time code sent to your phone.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 gap-1.5"
                              disabled={identifying || !memberNumber.trim()}
                              onClick={identifyByNumber}
                            >
                              {identifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
                              Continue
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setNumberEntry(false);
                                setMemberNumber("");
                                setAccountChargeTarget("cart");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {club.account_tab_enabled !== false && club.pay_online_enabled !== false && (!numberEntry || accountChargeTarget !== "tab") && (
                    <div className="flex items-center gap-2 py-0.5" aria-hidden="true">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">or</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
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
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Tap items to add</h2>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setScanOpen(true)}>
                    <ScanBarcode className="w-3.5 h-3.5" /> Scan item
                  </Button>
                </div>
                {data.kind !== "item" && (
                  <div role="tablist" aria-label="Item division" className="grid gap-1 rounded-md bg-muted p-1" style={{ gridTemplateColumns: `repeat(${menuDivisions.length}, minmax(0, 1fr))` }}>
                    {menuDivisions.map((d) => (
                      <Button
                        key={d}
                        type="button"
                        role="tab"
                        aria-selected={activeDivision === d}
                        variant="ghost"
                        onClick={() => setDivision(d)}
                        className={`h-10 text-xs font-semibold ${activeDivision === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                      >
                        {d === "bar" ? "Bar items" : d === "shop" ? "Shop items" : d.charAt(0).toUpperCase() + d.slice(1).replace(/_/g, " ")}
                      </Button>
                    ))}
                  </div>
                )}
                {data.kind !== "item" && categoryKeys.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-1" role="group" aria-label="Item category">
                    {["all", ...categoryKeys].map((c) => {
                      const on = activeCategory === c;
                      const label = c === "all" ? "All" : c === SPECIALS_KEY ? "⭐ Specials" : `${BAR_CATEGORY_EMOJI[c] || "📦"} ${categoryLabel(catRows || [], c)}`;
                      return (
                        <Button
                          key={c}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          aria-pressed={on}
                          onClick={() => setCategory(c)}
                          className="h-7 rounded-full px-2.5 text-[11px] capitalize"
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {(() => {
                    // Group "Brand · Single" / "Brand · Double" into one tile with option buttons.
                    const groups = new Map<string, ScanItem[]>();
                    const order: string[] = [];
                    for (const m of visibleMenu) {
                      const parts = m.item_kind !== "special" && !buddyItems.some(b => b.id === m.id) ? m.name.split(" · ") : [m.name];
                      const key = parts.length === 2 ? `g:${parts[0]}` : `i:${m.id}`;
                      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
                      groups.get(key)!.push(m);
                    }
                    return order.filter(k => k.startsWith("g:") && groups.get(k)!.length > 1).map(k => {
                      const opts = groups.get(k)!;
                      const title = k.slice(2);
                      const first = opts.find(o => o.image_url) || opts[0];
                      const qty = opts.reduce((n, o) => n + (cart[o.id] || 0), 0);
                      return (
                        <Card key={k} className={`relative p-2 flex flex-col items-center gap-1 ${qty > 0 ? "ring-2 ring-primary bg-primary/10" : ""}`}>
                          <div className="w-full aspect-square rounded bg-muted overflow-hidden flex items-center justify-center">
                            {first.image_url ? <img src={first.image_url} alt={title} className="w-full h-full object-cover" loading="lazy" /> : <span className="text-2xl">{barProductEmoji(first)}</span>}
                          </div>
                          <p className="text-[11px] font-medium text-center leading-tight break-words">{title}</p>
                          <div className="flex flex-col gap-1 w-full">
                            {opts.map(o => {
                              const out = o.item_kind !== "made_to_order" && typeof o.stock_qty === "number" && o.stock_qty <= 0;
                              return (
                                <div key={o.id} className="flex gap-1 w-full">
                                  <Button size="sm" disabled={out} variant={cart[o.id] ? "default" : "outline"} className="h-8 flex-1 min-w-0 px-1.5 text-[10px] justify-between gap-1" onClick={() => { navigator.vibrate?.(15); bump(o.id, 1); }}>
                                    <span className="truncate">{o.name.split(" · ")[1]}</span>
                                    <span className="shrink-0">{formatMoney(Number(o.price), currency)}{cart[o.id] ? ` ×${cart[o.id]}` : ""}</span>
                                  </Button>

                                </div>
                              );
                            })}
                          </div>
                          {qty > 0 && (
                            <>
                              <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">{qty}</span>
                              <Button size="icon" variant="outline" className="absolute top-1 left-1 h-6 w-6" aria-label="Remove one" onClick={() => { const last = [...opts].reverse().find(o => cart[o.id]); if (last) bump(last.id, -1); }}>
                                <Minus className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </Card>
                      );
                    });
                  })()}
                  {visibleMenu.filter(m => {
                    const parts = m.item_kind !== "special" && !buddyItems.some(b => b.id === m.id) ? m.name.split(" · ") : [m.name];
                    return !(parts.length === 2 && visibleMenu.filter(x => x.item_kind !== "special" && x.name.startsWith(parts[0] + " · ")).length > 1);
                  }).map((m) => {
                    const qty = cart[m.id] || 0;
                    // Prepared food holds no inventory; specials derive availability from their components.
                    const out = m.item_kind !== "made_to_order" && m.item_kind !== "special"
                      && typeof m.stock_qty === "number" && m.stock_qty <= 0;
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
                             <span className="text-2xl">{barProductEmoji(m)}</span>
                          )}
                        </div>
                        {m.item_kind === "special" && (
                          <Badge className="text-[9px] px-1.5 py-0">⭐ Special</Badge>
                        )}
                        <p className="text-[11px] font-medium text-center leading-tight break-words">{m.name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatMoney(Number(m.price), currency)}</p>
                        {m.item_kind === "special" && validitySummary(m as any) !== "Always" && (
                          <p className="text-[10px] text-center leading-tight text-primary">{validitySummary(m as any)}</p>
                        )}
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
                   {visibleMenu.length === 0 && (
                    <p className="col-span-3 text-sm text-muted-foreground text-center py-6">
                       {data.kind === "item" ? "Nothing is in stock right now." : `No ${activeDivision} items available yet.`}
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
                {!activeMember && tipConfig?.enabled && total > 0 && !(tab && tab.status === "open") && <TipEditor subtotal={total} choice={tipChoice} onChange={setTipChoice} staff={tipConfig.staff} disabled={submitting} />}

                {(!member || club.account_tab_enabled === false) && !tab && (
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
<Button className="w-full gap-2 h-11" disabled={checkingMembership} onClick={() => startAccountCharge("cart")}>
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
                            You&apos;ll confirm with a one-time code sent to your phone — nothing is charged before that.
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
                  {club.account_tab_enabled !== false && club.pay_online_enabled !== false && (member || !numberEntry) && (
                    <div className="flex items-center gap-2 py-0.5" aria-hidden="true">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">or</span>
                      <span className="h-px flex-1 bg-border" />
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

                  {orderProcess && !barOpen && (
                    <p className="rounded-md border border-dashed p-2 text-xs text-center text-muted-foreground">
                      The bar is closed for orders right now. Please order at the counter when someone is there.
                    </p>
                  )}
                  <Button
                    variant="secondary"
                    className="w-full gap-2 h-11"
                    disabled={submitting || (orderProcess && !barOpen) || (!member && !tab && !visitorName.trim())}
                    onClick={addToOpenTab}
                  >
                    <Receipt className="w-4 h-4" />
                    {orderProcess ? (barOpen ? "Place order" : "Bar closed for orders") : tab ? "Add to my open tab" : "Open a tab for the evening"}
                  </Button>

                  <p className="text-[11px] text-muted-foreground text-center">
                    {member
                      ? `Signed in as ${member.name}`
                      : `Card payments go through ${club.name}'s secure checkout.`}
                  </p>
                  {userId && !activeMember && (
                    <p className="text-[11px] text-muted-foreground text-center">
                      You are signed in but not a member of {club.name}, so this is recorded as a visitor sale.
                    </p>
                  )}
                </div>

              </Card>
            )}
          </>
        )}
      </main>
      <GuestOrderDialog
        tab={orderTab}
        open={!!orderTab}
        onOpenChange={(v) => { if (!v) setOrderTab(null); }}
        lines={cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty }))}
        onPlaced={async (o) => {
          const t = orderTab!;
          setOrderTab(null); setCart({}); setCheckingOut(false);
          const { data } = await (supabase as any).rpc("get_bar_guest_tab", { _tab_id: t.tab_id, _token: t.token });
          applyTabPayload(data);
          queryClient.invalidateQueries({ queryKey: ["bar-guest-orders", t.tab_id] });
          toast.success(`Order #${o.order_number} placed — the bar has it.`);
          // Progress alerts only arrive while this page stays open — nudge once per tab.
          const hintKey = `${KEEP_OPEN_HINT_KEY}.${t.tab_id}`;
          if (localStorage.getItem(hintKey) !== "1") {
            localStorage.setItem(hintKey, "1");
            showKeepOpenHint(o.fulfilment);
          }
        }}
      />

      {/* Sticky cart bar — always visible while items are selected */}
      {!done && !checkingOut && count > 0 && (
        <div className="fixed inset-x-0 border-t bg-background/95 backdrop-blur px-4 py-3 z-40 bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] md:bottom-0">
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{count} item{count > 1 ? "s" : ""} selected</p>
                <p className="text-[11px] text-muted-foreground truncate">{cartLines.map(l => `${l.qty}× ${l.item.name}`).join(" · ")}</p>
                <p className="text-base font-semibold">{formatMoney(total, currency)}</p>
              </div>
              {tab ? (
                <Button className="gap-2 h-11" disabled={submitting} onClick={addToOpenTab}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                  {orderProcess ? "Place order" : "Add to my open tab"}
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
      <ProductScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        items={menu}
        onItem={(item) => bump(item.id, 1)}
      />
      {memberTipPending && <MemberAccountTipDialog
        subtotal={memberTipPending.target === "tab" && tab ? tab.subtotal ?? tab.total : total}
        staff={memberTipPending.staff}
        busy={checkingMembership}
        onClose={() => setMemberTipPending(null)}
        onConfirm={choice => chargeSignedInAccount(memberTipPending.target, memberTipPending.memberId, choice, memberTipPending.staff, memberTipPending.requestId)}
      />}
      {!member && identified && (
        <BarOtpDialog
          open={pinOpen}
          onOpenChange={(o) => { setPinOpen(o); if (!o) setIdentified(null); }}
          clubMemberId={identified.id}
          memberName={identified.display_name}
          amountLabel={formatMoney(accountChargeTarget === "tab" && tab ? tab.total : total, currency)}
          tabToken={tab?.token ?? null}
          onVerified={confirmGuestAccountCharge}
        />
      )}
      {member && (
        <BarOtpDialog
          open={pinOpen}
          onOpenChange={setPinOpen}
          clubMemberId={member.id}
          memberName={member.name}
          amountLabel={formatMoney(total, currency)}
          mode="self"
          onVerified={confirmAccountCharge}
        />
      )}
    </div>
  );
}

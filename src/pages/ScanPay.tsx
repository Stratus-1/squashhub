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
import { Loader2, Minus, Plus, CreditCard, Wallet, LogIn, CheckCircle2, ArrowLeft, ShoppingCart } from "lucide-react";
import { formatMoney } from "@/lib/qr-shortcodes";

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
  };
  item?: ScanItem | null;
  menu?: ScanItem[] | null;
}

export default function ScanPay() {
  const { code = "" } = useParams();
  const navigate = useNavigate();

  const [cart, setCart] = useState<Record<string, number>>({});
  const [visitorName, setVisitorName] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ total: number; itemName: string; onAccount: boolean; cardPaid?: boolean } | null>(null);
  const [verifying, setVerifying] = useState(false);

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
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(PENDING_SALE_KEY) : null;
    if (!raw) return;
    let pending: { saleId: string; itemName: string; total: number; code: string } | null = null;
    try { pending = JSON.parse(raw); } catch { localStorage.removeItem(PENDING_SALE_KEY); return; }
    if (!pending?.saleId || pending.code !== code) return;

    let cancelled = false;
    setVerifying(true);
    const poll = async (attempt = 0) => {
      if (cancelled) return;
      const { data: res } = await supabase.functions.invoke("bar-card-verify", {
        body: { sale_id: pending!.saleId },
      });
      const status = (res as any)?.status;
      if (status === "paid") {
        localStorage.removeItem(PENDING_SALE_KEY);
        setVerifying(false);
        setDone({ total: pending!.total, itemName: pending!.itemName, onAccount: false, cardPaid: true });
        return;
      }
      if (status === "failed" || attempt >= 6) {
        localStorage.removeItem(PENDING_SALE_KEY);
        setVerifying(false);
        if (status === "failed") toast.error("That card payment did not go through.");
        else toast.message("We're still waiting for the bank to confirm your card payment.");
        return;
      }
      setTimeout(() => poll(attempt + 1), 4000);
    };
    poll();
    return () => { cancelled = true; };
  }, [code]);

  const continueAsGuest = () => {
    localStorage.setItem(GUEST_PREF_KEY, "1");
    setGuestChosen(true);
  };

  const goLogin = () => {
    const next = `/s/${code}`;
    localStorage.removeItem(GUEST_PREF_KEY);
    navigate(`/auth?redirectTo=${encodeURIComponent(next)}`);
  };

  /** Real card checkout — sends the payer to the club's Stitch hosted page. */
  const payByCardNow = async () => {
    if (cartLines.length === 0) return;
    setSubmitting(true);
    // Reserve the tab while we still have the user gesture — Stitch Express
    // parks payers on its own completion screen, so we keep the app tab alive
    // and show our branded thank-you page there instead.
    prepareStitchPaymentWindow();
    try {
      const buyerName = member?.name || visitorName.trim() || null;
      const { data: res, error } = await supabase.functions.invoke("bar-card-pay", {
        body: {
          code,
          lines: cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty })),
          buyer_name: buyerName,
          return_url: `${window.location.origin}/s/${code}/success`,
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
          JSON.stringify({ saleId, itemName: cartLabel, total, code }),
        );
      }
      const keptAppTab = await openStitchPaymentWindow(redirect);
      if (keptAppTab) {
        setCart({});
        setSubmitting(false);
        navigate(`/s/${code}/success`);
      }
    } catch (err: any) {
      discardPreparedStitchPaymentWindow();
      toast.error(err.message || "Could not start the card payment");
      setSubmitting(false);
    }
  };


  const chargeToAccount = async () => {
    if (cartLines.length === 0 || !member || !club) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("bar_tab_entries").insert(
        cartLines.map((l) => ({
          club_id: club.id,
          club_member_id: member.id,
          bar_item_id: l.item.id,
          quantity: l.qty,
          unit_price: Number(l.item.price),
          total: l.line,
        })),
      );
      if (error) throw error;
      setDone({ total, itemName: cartLabel, onAccount: true });
      setCart({});
    } catch (err: any) {
      toast.error(err.message || "Could not charge your account");
    } finally {
      setSubmitting(false);
    }
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
        <div className="min-w-0">
          <h1 className="text-base font-semibold truncate">{club.name}</h1>
          <p className="text-[11px] text-muted-foreground">Scan to pay · Bar &amp; shop</p>
        </div>
      </header>

      <main className="px-4 py-4 max-w-md mx-auto space-y-4">
        {verifying ? (
          <Card className="p-6 text-center space-y-3">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
            <h2 className="text-base font-semibold">Confirming your card payment…</h2>
            <p className="text-sm text-muted-foreground">This takes a few seconds.</p>
          </Card>
        ) : done ? (
          <Card className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
            <h2 className="text-lg font-semibold">Thank you!</h2>
            <p className="text-sm text-muted-foreground">
              {done.itemName} · {formatMoney(done.total, currency)}
            </p>
            <p className="text-sm text-muted-foreground">
              {done.onAccount
                ? "Charged to your member account."
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
                        className={`relative p-2 flex flex-col items-center gap-1 cursor-pointer hover:bg-accent/50 ${qty > 0 ? "ring-2 ring-primary" : ""} ${out ? "opacity-50" : ""}`}
                        onClick={() => { if (!out) bump(m.id, 1); }}
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

                {member ? (
                  <div className="space-y-2">
                    <Button className="w-full gap-2" disabled={submitting} onClick={chargeToAccount}>
                      <Wallet className="w-4 h-4" /> Charge to my account
                    </Button>
                    <Button variant="outline" className="w-full gap-2" disabled={submitting} onClick={payByCardNow}>
                      <CreditCard className="w-4 h-4" /> Pay now by card
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Signed in as {member.name}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="visitor-name" className="text-xs">Your name</Label>
                      <Input
                        id="visitor-name"
                        value={visitorName}
                        onChange={(e) => setVisitorName(e.target.value)}
                        placeholder="Name for the bar record"
                        className="h-9"
                      />
                    </div>
                    <Button className="w-full gap-2" disabled={submitting || !visitorName.trim()} onClick={payByCardNow}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                      Pay {formatMoney(total, currency)} by card
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Card payments go through {club.name}&apos;s secure checkout.
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
                )}
              </Card>
            )}
          </>
        )}
      </main>

      {/* Sticky cart bar */}
      {!done && !verifying && !checkingOut && count > 0 && (
        <div className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur px-4 py-3">
          <div className="max-w-md mx-auto flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{count} item{count > 1 ? "s" : ""} in cart</p>
              <p className="text-base font-semibold">{formatMoney(total, currency)}</p>
            </div>
            <Button className="gap-2" onClick={() => setCheckingOut(true)}>
              <ShoppingCart className="w-4 h-4" /> Done — checkout
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Public Scan-to-Pay page — `/s/:code`
 *
 * Opened by scanning a club QR sticker (per product) or the venue poster
 * (whole menu). Works fully unauthenticated: guests record a card/cash sale,
 * members can charge the item to their club account instead.
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
import { Loader2, Minus, Plus, CreditCard, Wallet, LogIn, CheckCircle2, ArrowLeft } from "lucide-react";
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

  const [qty, setQty] = useState(1);
  const [visitorName, setVisitorName] = useState("");
  const [selected, setSelected] = useState<ScanItem | null>(null);
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

  const item = useMemo<ScanItem | null>(() => {
    if (data?.kind === "item") return (data.item as ScanItem) || null;
    return selected;
  }, [data, selected]);

  const total = item ? Number(item.price) * qty : 0;

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

  const payAsGuest = async (method: "card" | "cash") => {
    if (!item) return;
    setSubmitting(true);
    try {
      const { data: res, error } = await (supabase as any).rpc("qr_record_visitor_sale", {
        _code: code,
        _bar_item_id: item.id,
        _quantity: qty,
        _visitor_name: visitorName.trim() || null,
        _payment_method: method,
        _note: null,
      });
      if (error) throw error;
      setDone({ total: Number((res as any)?.total ?? total), itemName: item.name, onAccount: false });
    } catch (err: any) {
      toast.error(err.message || "Could not record the sale");
    } finally {
      setSubmitting(false);
    }
  };

  /** Real card checkout — sends the payer to the club's Stitch hosted page. */
  const payByCardNow = async () => {
    if (!item) return;
    setSubmitting(true);
    try {
      const buyerName = member?.name || visitorName.trim() || null;
      const { data: res, error } = await supabase.functions.invoke("bar-card-pay", {
        body: {
          code,
          bar_item_id: item.id,
          quantity: qty,
          buyer_name: buyerName,
          return_url: `${window.location.origin}/s/${code}`,
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
          JSON.stringify({ saleId, itemName: item.name, total, code }),
        );
      }
      window.location.href = redirect;
    } catch (err: any) {
      toast.error(err.message || "Could not start the card payment");
      setSubmitting(false);
    }
  };


  const chargeToAccount = async () => {
    if (!item || !member || !club) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("bar_tab_entries").insert({
        club_id: club.id,
        club_member_id: member.id,
        bar_item_id: item.id,
        quantity: qty,
        unit_price: Number(item.price),
        total: Number(item.price) * qty,
      });
      if (error) throw error;
      setDone({ total, itemName: item.name, onAccount: true });
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
    <div className="min-h-screen bg-background pb-16">
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
        {done ? (
          <Card className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
            <h2 className="text-lg font-semibold">Thank you!</h2>
            <p className="text-sm text-muted-foreground">
              {done.itemName} — {formatMoney(done.total, currency)}{" "}
              {done.onAccount ? "was charged to your club account." : "recorded at the bar."}
            </p>
            <Button variant="outline" className="w-full" onClick={() => { setDone(null); setQty(1); setSelected(null); }}>
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

            {!item ? (
              <>
                <h2 className="text-sm font-semibold">Bar menu</h2>
                <div className="grid grid-cols-3 gap-2">
                  {(data.menu || []).map((m) => (
                    <Card
                      key={m.id}
                      className="p-2 flex flex-col items-center gap-1 cursor-pointer hover:bg-accent/50"
                      onClick={() => { setSelected(m); setQty(1); }}
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
                    </Card>
                  ))}
                  {(data.menu || []).length === 0 && (
                    <p className="col-span-3 text-sm text-muted-foreground text-center py-6">
                      Nothing is in stock right now.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <Card className="p-4 space-y-4">
                {data.kind === "venue" && (
                  <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setSelected(null)}>
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to menu
                  </Button>
                )}

                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded bg-muted overflow-hidden flex items-center justify-center shrink-0">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">📦</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight break-words">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{formatMoney(Number(item.price), currency)} each</p>
                    {typeof item.stock_qty === "number" && item.stock_qty <= 0 && (
                      <Badge variant="destructive" className="text-[10px] mt-1">Out of stock</Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">Quantity</span>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span className="w-6 text-center font-semibold">{qty}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQty((q) => Math.min(50, q + 1))}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
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
                    <Button variant="ghost" size="sm" className="w-full" disabled={submitting} onClick={() => payAsGuest("cash")}>
                      I left cash in the tin
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
                      <CreditCard className="w-4 h-4" /> Pay now by card
                    </Button>
                    <Button variant="outline" className="w-full gap-2" disabled={submitting || !visitorName.trim()} onClick={() => payAsGuest("cash")}>
                      I left cash in the tin
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
    </div>
  );
}

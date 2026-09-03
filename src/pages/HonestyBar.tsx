import { useState } from "react";
import { createPortal } from "react-dom";
import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Beer, Wine, Coffee, Package, Plus, Minus, ShoppingCart, Receipt, Store, User, Users, CreditCard, QrCode } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { useClubContext } from "@/contexts/ClubContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useIsSuperAdmin } from "@/hooks/use-club";
import { QuickVisitorSaleDialog } from "@/components/QuickVisitorSaleDialog";
import { CounterSaleDialog } from "@/components/bar/CounterSaleDialog";
import { CounterModeCard } from "@/components/bar/CounterModeCard";
import { Link } from "react-router-dom";
import { BarMenuQrDialog } from "@/components/BarMenuQrDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useClubCurrency } from "@/hooks/use-currency";

interface BarItem {
  id: string;
  name: string;
  price: number;
  category: string;
  active: boolean;
  image_url?: string | null;
  stock_qty: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  soft_drinks: "🥤",
  water: "💧",
  energy: "⚡",
  beer_cider: "🍺",
  wine: "🍷",
  spirits: "🥃",
  hot_drinks: "☕",
  snacks: "🍿",
  meals: "🥪",
  other: "📦",
  // legacy values (existing items)
  drinks: "🥤",
  alcohol: "🍺",
};

interface BarTabEntry {
  id: string;
  bar_item_id: string;
  quantity: number;
  unit_price: number;
  total: number;
  settled: boolean;
  created_at: string;
  bar_items?: { name: string; category: string };
}

const CATEGORIES = [
  { value: "soft_drinks", label: "Soft Drinks", icon: Beer },
  { value: "water", label: "Water", icon: Beer },
  { value: "energy", label: "Energy & Sports", icon: Beer },
  { value: "beer_cider", label: "Beer & Cider", icon: Beer },
  { value: "wine", label: "Wine", icon: Wine },
  { value: "spirits", label: "Spirits", icon: Wine },
  { value: "hot_drinks", label: "Hot Drinks", icon: Coffee },
  { value: "snacks", label: "Snacks", icon: Coffee },
  { value: "meals", label: "Light Meals", icon: Coffee },
  { value: "other", label: "Other", icon: Package },
];

export default function HonestyBar() {
  const qc = useQueryClient();
  const { club } = useClubContext();
  const { activeMember, isAdmin } = useMemberContext();
  const isSuperAdmin = useIsSuperAdmin();
  const canSeeVisitors = false;
  const clubId = club?.id;
  const memberId = activeMember?.id;
  const { format: fmtMoney } = useClubCurrency();
  const money = (n: number) => fmtMoney(n, 2);


  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [visitorSaleOpen, setVisitorSaleOpen] = useState(false);
  const [counterSaleOpen, setCounterSaleOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("shop");
  const [qrOpen, setQrOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["bar-items", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_items")
        .select("*")
        .eq("club_id", clubId)
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data as BarItem[];
    },
    enabled: !!clubId,
  });

  const { data: myTab = [] } = useQuery({
    queryKey: ["my-bar-tab", clubId, memberId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_tab_entries")
        .select("*, bar_items:bar_item_id(name, category)")
        .eq("club_id", clubId)
        .eq("club_member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as BarTabEntry[];
    },
    enabled: !!clubId && !!memberId,
  });

  // Venue-wide QR code — reused to start an online card payment from in-app.
  const { data: venueCode } = useQuery({
    queryKey: ["bar-venue-code", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("qr_short_codes")
        .select("code")
        .eq("club_id", clubId)
        .eq("active", true)
        .is("bar_item_id", null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.code as string | undefined;
    },
    enabled: !!clubId,
  });

  const accountTabEnabled = (club as any)?.bar_account_tab_enabled !== false;
  const payOnlineEnabled = (club as any)?.bar_pay_online_enabled !== false
    && ["stitch", "yoco"].includes(String((club as any)?.payment_gateway || "").toLowerCase());
  const cardSwipeEnabled = (club as any)?.bar_card_swipe_enabled !== false;


  const { data: visitorSales = [] } = useQuery({
    queryKey: ["bar-visitor-sales", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_visitor_sales")
        .select("*, bar_items:bar_item_id(name, category), recorder:logged_by(name)")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!clubId && canSeeVisitors,
  });

  const cartTotal = Object.entries(cart).reduce((sum, [itemId, qty]) => {
    const item = items.find(i => i.id === itemId);
    return sum + (item ? item.price * qty : 0);
  }, 0);
  const cartCount = Object.values(cart).reduce((sum, q) => sum + q, 0);

  const updateCart = (itemId: string, delta: number) => {
    setCart(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const submitCart = async () => {
    if (cartCount === 0) return;
    if (!memberId || !clubId) {
      toast.error("We couldn't find your club membership — please reload and try again.");
      return;
    }
    setSubmitting(true);
    try {


      const entries = Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => {
          const item = items.find(i => i.id === itemId)!;
          return {
            club_id: clubId,
            club_member_id: memberId,
            bar_item_id: itemId,
            quantity: qty,
            unit_price: item.price,
            total: item.price * qty,
          };
        });
      const { error } = await fromExt("bar_tab_entries").insert(entries);
      if (error) throw error;
      toast.success(`R${cartTotal.toFixed(2)} added to your tab`);
      setCart({});
      qc.invalidateQueries({ queryKey: ["my-bar-tab"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to log items");
    } finally {
      setSubmitting(false);
    }
  };

  const cartLinePayload = () =>
    Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({ bar_item_id: itemId, quantity: qty }));

  /** Member confirms they already swiped at the club's card machine — recorded as paid. */
  const swipeAtClub = async () => {
    if (!clubId || cartCount === 0) return;
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("record_bar_terminal_sale", {
        _lines: cartLinePayload(),
        _code: null,
        _club_id: clubId,
        _buyer_name: activeMember?.name || null,
      });
      if (error) throw error;
      toast.success(`${money(cartTotal)} recorded as paid by card${(data as any)?.reference ? ` (${(data as any).reference})` : ""}`);
      setCart({});
    } catch (err: any) {
      toast.error(err.message || "Could not record your card payment");
    } finally {
      setSubmitting(false);
    }
  };


  /** Pay the cart online through the club's card checkout. */
  const payOnline = async () => {
    if (!clubId || cartCount === 0) return;
    if (!venueCode) {
      toast.error("Online card payments are not set up for this bar yet.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bar-card-pay", {
        body: {
          code: venueCode,
          lines: cartLinePayload(),
          buyer_name: activeMember?.name || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const redirect = (data as any)?.redirect_url;
      if (!redirect) throw new Error("Card payment could not be started");
      window.location.assign(redirect);
    } catch (err: any) {
      toast.error(err.message || "Could not start the card payment");
      setSubmitting(false);
    }
  };



  const inStock = items.filter(i => i.stock_qty > 0);
  const groupedByCategory = CATEGORIES.map(cat => ({
    ...cat,
    items: inStock.filter(i => i.category === cat.value),
  })).filter(g => g.items.length > 0);

  if (!clubId || !club?.honesty_bar_enabled) {
    return (
      <div className="bottom-nav-safe">
        <PageHeader title="Bar / POS" backTo="/" />
        <div className="px-4 mt-8 text-center text-muted-foreground">
          <p>The honesty bar is not currently available at your club.</p>
        </div>
        <BackToDashboard />
      </div>
    );
  }

  return (
    <div className="bottom-nav-safe">
      <SEO title="Bar / POS" description="Buy bar items — pay now or charge to your member account" path="/honesty-bar" noIndex />
      <PageHeader title="Bar / POS" backTo="/" />

      <div className="px-4 space-y-4 mt-2">
        {canSeeVisitors && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="w-full h-12 gap-2 text-sm font-semibold shadow-md"
                  onClick={() => setVisitorSaleOpen(true)}
                >
                  <CreditCard className="w-5 h-5" />
                  Record a visitor sale / Direct card machine sale
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px] text-center">
                Any member or visitor sales swiped with a card can be recorded here
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {canSeeVisitors && (
          <Button
            variant="outline"
            className="w-full h-11 gap-2 text-sm font-semibold"
            onClick={() => setCounterSaleOpen(true)}
          >
            <Store className="w-4 h-4" />
            Counter sale — member or visitor
          </Button>
        )}

        {canSeeVisitors && (
          <Button asChild variant="outline" className="w-full h-11 gap-2 text-sm font-semibold">
            <Link to="/bar/counter">
              <Receipt className="w-4 h-4" />
              Open tabs — counter view
            </Link>
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full h-10 gap-2 text-sm"
          onClick={() => setQrOpen(true)}
        >
          <QrCode className="w-4 h-4" />
          Show / share Menu QR code
        </Button>

        <BarPinSettingsCard />

        {canSeeVisitors && <CounterModeCard clubId={clubId} />}


        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid" style={{ gridTemplateColumns: canSeeVisitors ? "1fr 1fr 1fr" : "1fr 1fr" }}>
            <TabsTrigger value="shop" className="gap-1 text-xs">
              <Store className="w-3.5 h-3.5" />
              Shop
            </TabsTrigger>
            <TabsTrigger value="my-tab" className="gap-1 text-xs">
              <User className="w-3.5 h-3.5" />
              My Tab
            </TabsTrigger>
            {canSeeVisitors && (
              <TabsTrigger value="visitors" className="gap-1 text-xs">
                <Users className="w-3.5 h-3.5" />
                Visitors
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="shop" className="space-y-4 mt-4">
            {/* Item catalog */}
            {groupedByCategory.map(group => {
              const Icon = group.icon;
              return (
                <div key={group.value}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">{group.label}</h3>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                    {group.items.map(item => {
                      const qty = cart[item.id] || 0;
                      return (
                        <Card
                          key={item.id}
                          className={`relative p-1.5 flex flex-col items-center gap-1 cursor-pointer hover:bg-accent/50 transition-colors ${qty > 0 ? "ring-2 ring-primary" : ""}`}
                          onClick={() => updateCart(item.id, 1)}
                        >
                          <div className="w-full aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <span className="text-2xl">{CATEGORY_ICONS[item.category] || "📦"}</span>
                            )}
                          </div>
                          <p className="text-[11px] font-medium leading-tight text-center truncate w-full">{item.name}</p>
                          <p className="text-[11px] text-muted-foreground leading-none">{money(item.price)}</p>
                          {qty > 0 && (
                            <>
                              <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                                {qty}
                              </span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="absolute top-1 left-1 h-5 w-5"
                                onClick={(e) => { e.stopPropagation(); updateCart(item.id, -1); }}
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Render outside the tab/layout tree so ancestor overflow or transforms cannot
                push the checkout controls back into the normal document flow. */}
            {typeof document !== "undefined" && createPortal(
              <AnimatePresence>
                {cartCount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className="fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+5rem)] z-[60] md:inset-x-auto md:right-4 md:top-24 md:w-80"
                  >
                    <Card className="p-3 space-y-2 shadow-lg border-primary/40 bg-background/95 backdrop-blur">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          {cartCount} item{cartCount > 1 ? "s" : ""} selected
                        </p>
                        <p className="text-base font-semibold">{money(cartTotal)}</p>
                      </div>
                      {accountTabEnabled && (
                        <Button className="w-full h-11 text-sm gap-2" onClick={submitCart} disabled={submitting}>
                          <ShoppingCart className="w-4 h-4" /> Add to my account tab
                        </Button>
                      )}
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                        {payOnlineEnabled && (
                          <Button variant="outline" className="min-h-11 h-auto text-xs gap-1.5" onClick={payOnline} disabled={submitting}>
                            <CreditCard className="w-3.5 h-3.5 shrink-0" /> Pay with card online
                          </Button>
                        )}
                        {cardSwipeEnabled && (
                          <Button variant="outline" className="min-h-11 h-auto text-xs gap-1.5 whitespace-normal" onClick={swipeAtClub} disabled={submitting}>
                            <Receipt className="w-3.5 h-3.5 shrink-0" /> I swiped at the card machine
                          </Button>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 text-[11px] text-muted-foreground"
                        onClick={() => setCart({})}
                      >
                        Clear selection
                      </Button>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>,
              document.body,
            )}

          </TabsContent>

          <TabsContent value="my-tab" className="space-y-3 mt-4">
            {myTab.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No items on your tab yet.</p>
            ) : (
              <div className="space-y-1.5">
                {myTab.slice(0, 50).map(entry => (
                  <Card key={entry.id} className="p-2.5 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.quantity}× {(entry.bar_items as any)?.name || "Item"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(entry.created_at), "dd MMM yyyy, HH:mm")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-medium">{money(entry.total)}</span>
                      <Badge variant="secondary" className="text-[10px]">On account</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {canSeeVisitors && (
            <TabsContent value="visitors" className="space-y-3 mt-4">
              {visitorSales.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No visitor sales recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {visitorSales.map((sale: any) => (
                    <Card key={sale.id} className="p-2.5 flex items-center justify-between">
                      <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                          {sale.quantity}× {(sale.bar_items as any)?.name || "Item"}
                          {sale.visitor_name ? ` · ${sale.visitor_name}` : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {format(new Date(sale.created_at), "dd MMM yyyy, HH:mm")}
                          {sale.recorder?.name ? ` · ${sale.recorder.name}` : ""}
                          {sale.note ? ` · ${sale.note}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-medium">{money(Number(sale.total))}</span>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] capitalize ${
                            sale.payment_method === "cash" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" :
                            sale.payment_method === "card" ? "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300" :
                            "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                          }`}
                        >
                          {sale.payment_method}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      <QuickVisitorSaleDialog
        open={visitorSaleOpen}
        onOpenChange={setVisitorSaleOpen}
        items={items}
        clubId={clubId!}
        loggedByMemberId={memberId}
      />

      <CounterSaleDialog
        open={counterSaleOpen}
        onOpenChange={setCounterSaleOpen}
        items={items as any}
        clubId={clubId!}
      />

      <BarMenuQrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        clubId={clubId}
        clubName={club?.name}
        subdomain={(club as any)?.subdomain}
      />



      <BackToDashboard />
    </div>
  );
}

import { spiritMixers, withSpiritMixers } from "@/lib/bar-spirit-menu";
import { showBarChargeError } from "@/lib/bar-charge-toast";
import { useAccountChargePreview } from "@/hooks/use-account-charge-preview";
import { AccountChargeWarning } from "@/components/bar/AccountChargeWarning";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Beer, Plus, Minus, ShoppingCart, Receipt, Store, User, Users, CreditCard, QrCode, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { useClubContext } from "@/contexts/ClubContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useIsSuperAdmin } from "@/hooks/use-club";
import { QuickVisitorSaleDialog } from "@/components/QuickVisitorSaleDialog";
import { CounterSaleDialog } from "@/components/bar/CounterSaleDialog";
import { CounterModeCard } from "@/components/bar/CounterModeCard";
import { Link, useNavigate } from "react-router-dom";
import { openMemberCounterTab, placeMemberCounterOrder } from "@/lib/bar/member-tab-handoff";
import { BarMenuQrDialog } from "@/components/BarMenuQrDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { addToTab, loadOpenTab, openTabStorageKey, pruneTab, saveOpenTab, tabCount } from "@/lib/bar/open-tab";
import { useClubCurrency } from "@/hooks/use-currency";
import {
  BAR_CATEGORY_EMOJI,
  barProductEmoji,
  categoriesForDivision,
  useBarDivisions,
  useBarCategories,
  type BarDivision,
} from "@/lib/bar-categories";
import { groupForPos, onMenu, type InventoryItem } from "@/lib/bar-inventory";

interface BarItem {
  id: string;
  name: string;
  price: number;
  category: string;
  division?: string;
  active: boolean;
  image_url?: string | null;
  stock_qty: number;
  item_kind?: string | null;
  stock_parent_id?: string | null;
}

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

export default function HonestyBar() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { club } = useClubContext();
  const { activeMember, isAdmin } = useMemberContext();
  const isSuperAdmin = useIsSuperAdmin();
  const canSeeVisitors = false;
  const clubId = club?.id;
  const memberId = activeMember?.id;
  const { format: fmtMoney } = useClubCurrency();
  const money = (n: number) => fmtMoney(n, 2);
  const { data: orderProcess, isLoading: orderModeLoading, isError: orderModeError } = useQuery({
    queryKey: ["bar-order-process", clubId],
    enabled: !!clubId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_order_process_status", { _club_id: clubId ?? "" });
      if (error) throw error;
      if (typeof data !== "boolean") throw new Error("Could not check the bar's order settings");
      return data;
    },
  });


  // OPEN tab for this visit — device-local, never posted until settled.
  const tabKey = clubId && memberId ? openTabStorageKey(clubId, memberId) : null;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!tabKey) return;
    setCart(loadOpenTab(tabKey));
    setLoadedKey(tabKey);
  }, [tabKey]);
  useEffect(() => {
    if (tabKey && loadedKey === tabKey) saveOpenTab(tabKey, cart);
  }, [cart, tabKey, loadedKey]);
  const [submitting, setSubmitting] = useState(false);
  const accountRequest = useRef<{ signature: string; id: string } | null>(null);
  const [visitorSaleOpen, setVisitorSaleOpen] = useState(false);
  const [counterSaleOpen, setCounterSaleOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("shop");
  const [qrOpen, setQrOpen] = useState(false);
  const [division, setDivision] = useState<BarDivision>("bar");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

  // Full history: account charges plus cash/card/online purchases.
  const { data: myTab = [] } = useQuery({
    queryKey: ["my-bar-purchases", clubId, memberId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("my_bar_purchases", {
        _club_id: clubId, _club_member_id: memberId,
      });
      if (error) throw error;
      return (data as { id: string; created_at: string; item_name: string; quantity: number; total: number; method: string }[]) ?? [];
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
    && ["stitch", "yoco", "payfast"].includes(String((club as any)?.payment_gateway || "").toLowerCase());
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

  // Drop items that are no longer on sale once the catalogue loads.
  const itemIdsSig = items.map(i => i.id).join(",");
  useEffect(() => {
    if (!items.length) return;
    const valid = new Set(items.map(i => i.id));
    setCart(prev => {
      const pruned = pruneTab(prev, valid);
      return Object.keys(pruned).length === Object.keys(prev).length ? prev : pruned;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIdsSig]);

  const cartTotal = Object.entries(cart).reduce((sum, [itemId, qty]) => {
    const item = items.find(i => i.id === itemId);
    return sum + (item ? item.price * qty : 0);
  }, 0);
  const cartCount = tabCount(cart);
  const cartLines = useMemo(() => Object.entries(cart)
    .map(([id, qty]) => ({ item: items.find(i => i.id === id), qty }))
    .filter((l): l is { item: BarItem; qty: number } => !!l.item && l.qty > 0), [cart, items]);

  const accountPreview = useAccountChargePreview(accountTabEnabled ? memberId : null,
    cartLines.map(({ item, qty }) => ({ division: (item as any).division, total: item.price * qty })));
  const updateCart = (itemId: string, delta: number) => setCart(prev => addToTab(prev, itemId, delta));

  // Product taps only change the local selection; saving requires explicit confirmation.
  const addLineToTab = (itemId: string) => {
    if (submitting) return;
    updateCart(itemId, 1);
  };

  // Mixer ("buddy") choices for spirit + mixer orders: in-stock soft-drink
  // items (Coke, soda, tonic, etc.). Word-boundary match so "Chocolates"
  // never counts as "cola".
  const buddyItems = useMemo(() => {
    const candidates = spiritMixers(items).filter(i =>
      !(i as unknown as InventoryItem).archived_at &&
      (typeof i.stock_qty !== "number" || i.stock_qty > 0)
    );
    return candidates.sort((a, b) => Number(a.price) - Number(b.price));
  }, [items]);


  /** Send an unpaid order first; settlement stays on the shared tab. */
  const submitCart = async () => {
    if (cartCount === 0 || submitting) return;
    if (!memberId || !clubId) {
      toast.error("We couldn't find your club membership — please reload and try again.");
      return;
    }
    setSubmitting(true);
    try {


      const lines = Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => {
          const item = items.find(i => i.id === itemId);
          if (!item) throw new Error("An item is no longer available. Please check your tab.");
          return { bar_item_id: itemId, quantity: qty };
        });
      const signature = JSON.stringify([clubId, memberId, lines]);
      if (accountRequest.current?.signature !== signature) {
        accountRequest.current = { signature, id: crypto.randomUUID() };
      }
      const destination = await placeMemberCounterOrder(clubId, memberId, cart, accountRequest.current.id);
      toast.success(orderProcess ? "Order sent to the bar" : "Your tab is ready");
      accountRequest.current = null;
      setCart({});
      if (tabKey) saveOpenTab(tabKey, {});
      qc.invalidateQueries({ queryKey: ["my-bar-tab"] });
      qc.invalidateQueries({ queryKey: ["bar-account-charge-preview"] });
      qc.invalidateQueries({ queryKey: ["bar-counter-orders"] });
      navigate(destination);
    } catch (err: any) {
      showBarChargeError(err, "Failed to log items");
    } finally {
      setSubmitting(false);
    }
  };

  // Items already saved on the member's open tab (e.g. after leaving the payment page).
  const unpaidOpenTotal = myTab.filter(e => e.method === "unpaid").reduce((sum, e) => sum + Number(e.total || 0), 0);
  const resumeOpenTab = async () => {
    if (!clubId || !memberId || submitting) return;
    setSubmitting(true);
    try {
      navigate(await openMemberCounterTab(clubId, memberId, {}));
    } catch (err: any) {
      toast.error(err.message || "Could not open your tab");
      setSubmitting(false);
    }
  };

  const cartLinePayload = () =>
    Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({ bar_item_id: itemId, quantity: qty }));

  /** Send the order to the counter to pay on the card machine; staff confirm it once the card is approved. */
  const swipeAtClub = async () => {
    if (!clubId || cartCount === 0 || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("record_bar_terminal_sale", {
        _lines: cartLinePayload(),
        _code: null,
        _club_id: clubId,
        _buyer_name: activeMember?.name || null,
      });
      if (error) throw error;
      toast.success(`Order sent to the bar${(data as any)?.reference ? ` (${(data as any).reference})` : ""} — pay ${money(cartTotal)} on the card machine at the counter. It is not paid until the bar confirms.`, { duration: 8000 });
      setCart({});
    } catch (err: any) {
      toast.error(err.message || "Could not record your card payment");
    } finally {
      setSubmitting(false);
    }
  };


  /** Pay the cart online through the club's card checkout. */
  const payOnline = async () => {
    if (!clubId || cartCount === 0 || submitting) return;
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
      // The open tab is cleared only once the bank confirms (see BarPaymentSuccess).
      if ((data as any)?.sale_id) {
        localStorage.setItem("sh.scanpay.pendingSale", JSON.stringify({ saleId: (data as any).sale_id, code: venueCode, openTabKey: tabKey }));
      }
      window.location.assign(redirect);
    } catch (err: any) {
      toast.error(err.message || "Could not start the card payment");
      setSubmitting(false);
    }
  };



  const { data: customCategories = [] } = useBarCategories(clubId);
  const { divisions } = useBarDivisions(clubId);
  const activeDivision = divisions.some(d => d.key === division) ? division : (divisions[0]?.key || "bar");
  const menuItems = items.filter(i => onMenu(i as unknown as InventoryItem));
  const inStock = menuItems.filter(i => (i.division || "bar") === activeDivision);
  const specials = inStock.filter(i => (i as any).item_kind === "special");
  const regular = inStock.filter(i => (i as any).item_kind !== "special");
  const divisionCategories = categoriesForDivision(customCategories, activeDivision);
  const groupedByCategory = divisionCategories.map(cat => ({
    ...cat,
    items: withSpiritMixers(regular.filter(i => i.category === cat.value), buddyItems, cat.value),
  })).filter(g => g.items.length > 0);
  // Items whose category isn't in the current list (legacy values) still show, under their own heading.
  const knownValues = new Set(divisionCategories.map(c => c.value));
  const uncategorised = regular.filter(i => !knownValues.has(i.category));
  if (uncategorised.length > 0) {
    groupedByCategory.push({ value: "_legacy", label: "Other items", division: activeDivision, items: uncategorised });
  }
  if (specials.length > 0) {
    groupedByCategory.unshift({ value: "_specials", label: "Specials", division: activeDivision, items: specials });
  }
  const visibleCategory = groupedByCategory.find(g => g.value === selectedCategory) ?? groupedByCategory[0];

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
        {canSeeVisitors && cardSwipeEnabled && (
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

        {canSeeVisitors && <CounterModeCard clubId={clubId} />}


        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid sticky top-0 z-20" style={{ gridTemplateColumns: canSeeVisitors ? "1fr 1fr 1fr" : "1fr 1fr" }}>
            <TabsTrigger value="shop" className="gap-1 text-xs">
              <ShoppingCart className="w-3.5 h-3.5" />
              Buy
            </TabsTrigger>
            <TabsTrigger
              value="my-tab"
              aria-label={cartCount > 0 ? `My Tab, ${cartCount} item${cartCount === 1 ? "" : "s"} open` : "My Tab"}
              className={`gap-1 text-xs ${cartCount > 0 ? "bg-accent text-accent-foreground font-bold data-[state=active]:bg-accent data-[state=active]:text-accent-foreground ring-2 ring-accent" : ""}`}
            >
              <User className="w-3.5 h-3.5" />
              My Tab{cartCount > 0 ? ` (${cartCount})` : ""}
              {cartCount > 0 && <span className="ml-1 tabular-nums">· {money(cartTotal)}</span>}
            </TabsTrigger>
            {canSeeVisitors && (
              <TabsTrigger value="visitors" className="gap-1 text-xs">
                <Users className="w-3.5 h-3.5" />
                Visitors
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="shop" className="space-y-4 mt-4">
            <AccountChargeWarning show={accountPreview.blocked} />
            {/* Choose which kind of item to browse. */}
            <div className="grid gap-1 rounded-lg bg-muted p-1" style={{ gridTemplateColumns: `repeat(${Math.max(divisions.length, 1)}, minmax(0, 1fr))` }}>
              {divisions.map(d => (
                <Button
                  key={d.key}
                  type="button"
                  variant="ghost"
                  aria-pressed={activeDivision === d.key}
                   onClick={() => { setDivision(d.key); setSelectedCategory(null); }}
                  className={`h-9 flex items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors ${
                    activeDivision === d.key ? "bg-background shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {d.key === "bar" ? <Beer className="w-3.5 h-3.5" /> : <Store className="w-3.5 h-3.5" />}
                  {d.label}
                </Button>
              ))}
            </div>
             {/* Pick one category at a time; keep the cart when switching. */}
             {groupedByCategory.length > 0 && (
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-2" role="group" aria-label="Product categories">
                {groupedByCategory.map(g => (
                   <Button
                    key={g.value}
                    type="button"
                     variant={visibleCategory?.value === g.value ? "default" : "outline"}
                     aria-pressed={visibleCategory?.value === g.value}
                     onClick={() => setSelectedCategory(g.value)}
                     className="h-auto min-h-14 xl:min-h-11 min-w-0 gap-2 px-2 py-2 text-[13px] xl:text-xs leading-tight whitespace-normal text-center"
                  >
                     <span className="text-2xl xl:text-xl shrink-0" aria-hidden="true">{g.value === "_specials" ? "⭐" : BAR_CATEGORY_EMOJI[g.value] || "📦"}</span>
                     <span className="min-w-0 break-words">{g.label}</span>
                   </Button>
                ))}
              </div>
            )}
            {inStock.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No {(divisions.find(d => d.key === activeDivision)?.label || activeDivision).toLowerCase()} items available yet.
              </p>
            )}
            {/* Item catalog */}
             {visibleCategory && [visibleCategory].map(group => {
              return (
                 <div key={group.value}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{BAR_CATEGORY_EMOJI[group.value] || "📦"}</span>
                    <h3 className="text-sm font-semibold">{group.label}</h3>
                  </div>
                   <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-9 gap-2 xl:gap-1.5">
                    {[...groupForPos(group.items.filter(i => !buddyItems.some(b => b.id === i.id)) as unknown as InventoryItem[], items as unknown as InventoryItem[]),
                      ...group.items.filter(i => buddyItems.some(b => b.id === i.id)).map(item => ({ key: `m:${item.id}`, title: item.name, options: [{ item: item as unknown as InventoryItem, label: item.name }], isSpecial: false }))].map(entry => {
                      const first = entry.options[0].item;
                      const multi = entry.options.length > 1;
                      return (
                        <Card
                          key={entry.key}
                          className={`relative p-1.5 xl:p-1 flex flex-col items-center gap-1 xl:gap-0.5 transition-colors ${multi ? "" : "cursor-pointer hover:bg-accent/50"}`}
                          onClick={multi ? undefined : () => addLineToTab(first.id)}
                        >
                          <div className="w-full aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
                            {first.image_url ? (
                              <img src={first.image_url} alt={entry.title} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                               <span className="text-2xl xl:text-lg">{barProductEmoji({ ...first, item_kind: entry.isSpecial ? "special" : first.item_kind })}</span>
                            )}
                          </div>
                           <p className="text-[11px] xl:text-[10px] font-medium leading-tight text-center line-clamp-2 min-h-7 xl:min-h-5 w-full">{entry.title}</p>
                          {multi ? (
                             <div className="flex flex-col gap-1 w-full">
                              {entry.options.map(o => (
                                <div key={o.item.id} className="flex gap-1 w-full">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                     className="h-8 xl:h-7 flex-1 min-w-0 px-2 text-[11px] xl:text-[10px] leading-tight justify-between gap-1"
                                    onClick={() => addLineToTab(o.item.id)}
                                  >
                                     <span className="truncate">{o.label}</span>
                                     <span className="shrink-0">{money(o.item.price)}</span>
                                  </Button>
                                  {(cart[o.item.id] || 0) > 0 && (
                                    <>
                                      <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" disabled={submitting} aria-label={`One less ${o.item.name} ${o.label}`} onClick={() => updateCart(o.item.id, -1)}><Minus className="h-3.5 w-3.5" /></Button>
                                      <span className="w-5 shrink-0 self-center text-center text-xs tabular-nums">{cart[o.item.id]}</span>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <>
                              <p className="text-[11px] xl:text-[10px] text-muted-foreground leading-none">{money(first.price)}</p>
                              <div className="flex items-center justify-center gap-1 w-full" onClick={event => event.stopPropagation()}>
                                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label={`One less ${entry.title}`} disabled={submitting || !cart[first.id]} onClick={() => updateCart(first.id, -1)}><Minus className="h-3.5 w-3.5" /></Button>
                                <span className="w-6 text-center text-xs font-semibold tabular-nums">{cart[first.id] || 0}</span>
                                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label={`One more ${entry.title}`} disabled={submitting} onClick={() => addLineToTab(first.id)}><Plus className="h-3.5 w-3.5" /></Button>
                              </div>
                            </>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {cartCount > 0 && (
              <Button className="w-full h-11 text-sm gap-2" onClick={submitCart} disabled={submitting || !memberId || orderModeLoading || orderModeError || typeof orderProcess !== "boolean"}>
              <ShoppingCart className="w-4 h-4" /> {submitting ? "Adding…" : orderProcess ? "Place order" : "Add to my tab"} · {money(cartTotal)}
              </Button>
            )}
          </TabsContent>

          <TabsContent value="my-tab" className="space-y-3 mt-4">
            <Card className={`p-3 space-y-2 ${cartCount > 0 ? "border-accent ring-1 ring-accent" : ""}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Selected items{cartCount > 0 ? ` (${cartCount})` : ""}</h3>
                <span className="text-base font-semibold tabular-nums">{money(cartTotal)}</span>
              </div>
              {cartLines.length === 0 ? (
                unpaidOpenTotal > 0 ? (
                  <div className="space-y-2 py-1">
                    <p className="text-xs text-muted-foreground text-center">
                      You have {money(unpaidOpenTotal)} waiting on your open tab (listed below).
                    </p>
                    <Button className="w-full h-11 text-sm gap-2" onClick={resumeOpenTab} disabled={submitting || !memberId}>
                      <ShoppingCart className="w-4 h-4" /> {submitting ? "Loading my tab…" : "View payment options"} · {money(unpaidOpenTotal)}
                    </Button>
                  </div>
                ) : (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  Your tab is empty. Tap items on Buy to add them — nothing is charged until you settle.
                </p>
                )
              ) : (
                <>
                  <div className="divide-y">
                    {cartLines.map(({ item, qty }) => (
                      <div key={item.id} className="flex items-center gap-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-[11px] text-muted-foreground">{money(item.price)} each</p>
                        </div>
                        <Button size="icon" variant="outline" className="h-8 w-8" disabled={submitting} aria-label={`One less ${item.name}`} onClick={() => updateCart(item.id, -1)}>
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
                        <Button size="icon" variant="outline" className="h-8 w-8" disabled={submitting} aria-label={`One more ${item.name}`} onClick={() => updateCart(item.id, 1)}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-16 text-right text-sm tabular-nums">{money(item.price * qty)}</span>
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={submitting} aria-label={`Remove ${item.name}`} onClick={() => updateCart(item.id, -qty)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                    <Button className="w-full h-11 text-sm gap-2" onClick={submitCart} disabled={submitting || !memberId || orderModeLoading || orderModeError || typeof orderProcess !== "boolean"}>
                      <ShoppingCart className="w-4 h-4" /> {submitting ? "Adding…" : orderProcess ? "Place order" : "Add to my tab"} · {money(cartTotal)}
                    </Button>
                  <Button variant="ghost" size="sm" className="w-full h-7 text-[11px] text-muted-foreground" onClick={() => setCart({})} disabled={submitting}>
                    Clear selection
                  </Button>
                </>
              )}
            </Card>

            <h3 className="text-xs font-semibold text-muted-foreground pt-2">My purchases</h3>
            {myTab.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No purchases yet.</p>
            ) : (
              <div className="space-y-1.5">
                {myTab.slice(0, 100).map(entry => (
                  <Card key={entry.id} className="p-2.5 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.quantity}× {entry.item_name || "Item"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(entry.created_at), "dd MMM yyyy, HH:mm")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-medium">{money(entry.total)}</span>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] capitalize ${
                          entry.method === "cash" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" :
                          entry.method === "card" ? "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300" :
                          entry.method === "online" ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300" :
                          entry.method === "account" ? "" :
                          "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                        }`}
                      >
                        {entry.method === "account" ? "On account" : entry.method === "unpaid" ? "Unpaid · open tab" : entry.method}
                      </Badge>
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
        clubId={clubId}
        loggedByMemberId={memberId}
      />

      <CounterSaleDialog
        open={counterSaleOpen}
        onOpenChange={setCounterSaleOpen}
        items={items as any}
        clubId={clubId}
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

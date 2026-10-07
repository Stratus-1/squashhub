import { useEffect, useMemo, useState } from "react";
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
import { Link } from "react-router-dom";
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
  const qc = useQueryClient();
  const { club } = useClubContext();
  const { activeMember, isAdmin } = useMemberContext();
  const isSuperAdmin = useIsSuperAdmin();
  const canSeeVisitors = false;
  const clubId = club?.id;
  const memberId = activeMember?.id;
  const { format: fmtMoney } = useClubCurrency();
  const money = (n: number) => fmtMoney(n, 2);


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

  const updateCart = (itemId: string, delta: number) => setCart(prev => addToTab(prev, itemId, delta));

  /** Settlement: post the final open tab to the member account (the only path that journals). */
  const submitCart = async () => {
    if (cartCount === 0 || submitting) return;
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
      toast.success(`${money(cartTotal)} posted to your member account`);
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
    items: regular.filter(i => i.category === cat.value),
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
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" role="group" aria-label="Product categories">
                {groupedByCategory.map(g => (
                   <Button
                    key={g.value}
                    type="button"
                     variant={visibleCategory?.value === g.value ? "default" : "outline"}
                     aria-pressed={visibleCategory?.value === g.value}
                     onClick={() => setSelectedCategory(g.value)}
                     className="h-auto min-h-14 min-w-0 gap-2 px-2 py-2 text-[13px] leading-tight whitespace-normal text-center"
                  >
                     <span className="text-2xl shrink-0" aria-hidden="true">{g.value === "_specials" ? "⭐" : BAR_CATEGORY_EMOJI[g.value] || "📦"}</span>
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
                   <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {groupForPos(group.items as unknown as InventoryItem[], items as unknown as InventoryItem[]).map(entry => {
                      const first = entry.options[0].item;
                      const qty = entry.options.reduce((n, o) => n + (cart[o.item.id] || 0), 0);
                      const multi = entry.options.length > 1;
                      return (
                        <Card
                          key={entry.key}
                          className={`relative p-1.5 flex flex-col items-center gap-1 transition-colors ${multi ? "" : "cursor-pointer hover:bg-accent/50"} ${qty > 0 ? "ring-2 ring-primary" : ""}`}
                          onClick={multi ? undefined : () => updateCart(first.id, 1)}
                        >
                          <div className="w-full aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
                            {first.image_url ? (
                              <img src={first.image_url} alt={entry.title} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                               <span className="text-2xl">{barProductEmoji({ ...first, item_kind: entry.isSpecial ? "special" : first.item_kind })}</span>
                            )}
                          </div>
                           <p className="text-[11px] font-medium leading-tight text-center line-clamp-2 min-h-7 w-full">{entry.title}</p>
                          {multi ? (
                             <div className="flex flex-col gap-1 w-full">
                              {entry.options.map(o => (
                                <Button
                                  key={o.item.id}
                                  size="sm"
                                  variant={cart[o.item.id] ? "default" : "outline"}
                                   className="h-8 w-full min-w-0 px-2 text-[11px] leading-tight justify-between gap-1"
                                  onClick={() => updateCart(o.item.id, 1)}
                                >
                                   <span className="truncate">{o.label}</span>
                                   <span className="shrink-0">{money(o.item.price)}{cart[o.item.id] ? ` ×${cart[o.item.id]}` : ""}</span>
                                </Button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground leading-none">{money(first.price)}</p>
                          )}
                          {qty > 0 && (
                            <>
                              <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                                {qty}
                              </span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="absolute top-1 left-1 h-5 w-5"
                                aria-label="Remove one"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const last = [...entry.options].reverse().find(o => cart[o.item.id]);
                                  if (last) updateCart(last.item.id, -1);
                                }}
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

          </TabsContent>

          <TabsContent value="my-tab" className="space-y-3 mt-4">
            <Card className={`p-3 space-y-2 ${cartCount > 0 ? "border-accent ring-1 ring-accent" : ""}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Open tab{cartCount > 0 ? ` (${cartCount})` : ""}</h3>
                <span className="text-base font-semibold tabular-nums">{money(cartTotal)}</span>
              </div>
              {cartLines.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  Your tab is empty. Tap items on Buy to add them — nothing is charged until you settle.
                </p>
              ) : (
                <>
                  <div className="divide-y">
                    {cartLines.map(({ item, qty }) => (
                      <div key={item.id} className="flex items-center gap-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-[11px] text-muted-foreground">{money(item.price)} each</p>
                        </div>
                        <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`One less ${item.name}`} onClick={() => updateCart(item.id, -1)}>
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
                        <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`One more ${item.name}`} onClick={() => updateCart(item.id, 1)}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-16 text-right text-sm tabular-nums">{money(item.price * qty)}</span>
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remove ${item.name}`} onClick={() => updateCart(item.id, -qty)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-medium pt-1">Settle tab — choose how to pay</p>
                  {accountTabEnabled && (
                    <Button className="w-full h-11 text-sm gap-2" onClick={submitCart} disabled={submitting}>
                      <ShoppingCart className="w-4 h-4" /> Add {money(cartTotal)} to my member account
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {payOnlineEnabled && (
                      <Button variant="outline" className="min-h-11 h-auto text-xs gap-1.5 whitespace-normal" onClick={payOnline} disabled={submitting}>
                        <CreditCard className="w-3.5 h-3.5 shrink-0" /> Pay now by card
                      </Button>
                    )}
                    {cardSwipeEnabled && (
                      <Button variant="outline" className="min-h-11 h-auto text-xs gap-1.5 whitespace-normal" onClick={swipeAtClub} disabled={submitting}>
                        <Receipt className="w-3.5 h-3.5 shrink-0" /> I swiped at the card machine
                      </Button>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="w-full h-7 text-[11px] text-muted-foreground" onClick={() => setCart({})} disabled={submitting}>
                    Clear tab
                  </Button>
                </>
              )}
            </Card>

            <h3 className="text-xs font-semibold text-muted-foreground pt-2">Posted to my member account</h3>
            {myTab.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nothing posted to your account yet.</p>
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

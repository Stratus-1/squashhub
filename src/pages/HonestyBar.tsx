import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Beer, Wine, Coffee, Package, Plus, Minus, ShoppingCart, Receipt, Store, User, Users } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useIsSuperAdmin } from "@/hooks/use-club";
import { QuickVisitorSaleDialog } from "@/components/QuickVisitorSaleDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

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
  const canSeeVisitors = true;
  const clubId = club?.id;
  const memberId = activeMember?.id;


  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [visitorSaleOpen, setVisitorSaleOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("shop");

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
    if (!memberId || !clubId || cartCount === 0) return;
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

  const inStock = items.filter(i => i.stock_qty > 0);
  const groupedByCategory = CATEGORIES.map(cat => ({
    ...cat,
    items: inStock.filter(i => i.category === cat.value),
  })).filter(g => g.items.length > 0);

  if (!clubId || !club?.honesty_bar_enabled) {
    return (
      <div className="bottom-nav-safe">
        <PageHeader title="Honesty Bar" backTo="/" />
        <div className="px-4 mt-8 text-center text-muted-foreground">
          <p>The honesty bar is not currently available at your club.</p>
        </div>
        <BackToDashboard />
      </div>
    );
  }

  return (
    <div className="bottom-nav-safe">
      <SEO title="Honesty Bar" description="Log your bar items" path="/honesty-bar" noIndex />
      <PageHeader title="Honesty Bar" backTo="/" />

      <div className="px-4 space-y-4 mt-2">
        {canSeeVisitors && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setVisitorSaleOpen(true)}
            >
              <Receipt className="w-3.5 h-3.5" />
              Visitor sale / Direct card machine sale
            </Button>
          </div>
        )}


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
                          <p className="text-[11px] text-muted-foreground leading-none">R{item.price.toFixed(2)}</p>
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

            {/* Sticky cart submit */}
            <AnimatePresence>
              {cartCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="sticky bottom-20 z-40"
                >
                  <Button
                    className="w-full h-12 text-sm gap-2"
                    onClick={submitCart}
                    disabled={submitting}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Add {cartCount} item{cartCount > 1 ? "s" : ""} to Tab — R{cartTotal.toFixed(2)}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
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
                      <span className="text-sm font-medium">R{entry.total.toFixed(2)}</span>
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
                          {sale.note ? ` · ${sale.note}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-medium">R{Number(sale.total).toFixed(2)}</span>
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

      <BackToDashboard />
    </div>
  );
}

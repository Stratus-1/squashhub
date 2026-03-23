import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Beer, Wine, Coffee, Package, Plus, Minus, ShoppingCart, Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface BarItem {
  id: string;
  name: string;
  price: number;
  category: string;
  active: boolean;
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

const CATEGORIES = [
  { value: "drinks", label: "Drinks", icon: Beer },
  { value: "alcohol", label: "Alcohol", icon: Wine },
  { value: "snacks", label: "Snacks", icon: Coffee },
  { value: "other", label: "Other", icon: Package },
];

export default function HonestyBar() {
  const qc = useQueryClient();
  const { club } = useClubContext();
  const { activeMember } = useMemberContext();
  const clubId = club?.id;
  const memberId = activeMember?.id;

  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

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

  const unsettledTotal = myTab.filter(e => !e.settled).reduce((sum, e) => sum + e.total, 0);
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

  const groupedByCategory = CATEGORIES.map(cat => ({
    ...cat,
    items: items.filter(i => i.category === cat.value),
  })).filter(g => g.items.length > 0);

  if (!clubId || !(club as any)?.honesty_bar_enabled) {
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
        {/* Outstanding balance */}
        {unsettledTotal > 0 && (
          <Card className="p-3 bg-destructive/10 border-destructive/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Outstanding Balance</span>
              <Badge variant="destructive">R{unsettledTotal.toFixed(2)}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Pay at the bar or via your account.</p>
          </Card>
        )}

        {/* Item catalog */}
        {groupedByCategory.map(group => {
          const Icon = group.icon;
          return (
            <div key={group.value}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{group.label}</h3>
              </div>
              <div className="space-y-1.5">
                {group.items.map(item => {
                  const qty = cart[item.id] || 0;
                  return (
                    <Card key={item.id} className="p-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">R{item.price.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {qty > 0 && (
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateCart(item.id, -1)}>
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {qty > 0 && (
                          <span className="w-6 text-center text-sm font-medium">{qty}</span>
                        )}
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateCart(item.id, 1)}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
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

        {/* My tab history */}
        <div className="pt-2">
          <h3 className="text-sm font-semibold mb-2">My Tab History</h3>
          {myTab.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items on your tab yet.</p>
          ) : (
            <div className="space-y-1.5">
              {myTab.slice(0, 20).map(entry => (
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
                    {entry.settled ? (
                      <Badge variant="secondary" className="text-[10px]"><Check className="w-3 h-3 mr-0.5" />Paid</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">Owing</Badge>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <BackToDashboard />
    </div>
  );
}

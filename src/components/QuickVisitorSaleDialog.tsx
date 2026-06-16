import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Banknote, CreditCard, Building2, Minus, ShoppingCart, X } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface BarItem {
  id: string;
  name: string;
  price: number;
  category: string;
  image_url?: string | null;
  stock_qty: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  soft_drinks: "🥤", water: "💧", energy: "⚡", beer_cider: "🍺", wine: "🍷",
  spirits: "🥃", hot_drinks: "☕", snacks: "🍿", meals: "🥪", other: "📦",
  drinks: "🥤", alcohol: "🍺",
};

type PaymentMethod = "cash" | "card" | "eft";

const METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "eft", label: "EFT", icon: Building2 },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BarItem[];
  clubId: string;
  loggedByMemberId?: string | null;
}

export function QuickVisitorSaleDialog({ open, onOpenChange, items, clubId, loggedByMemberId }: Props) {
  const qc = useQueryClient();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [visitorName, setVisitorName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inStock = useMemo(() => items.filter(i => i.stock_qty > 0), [items]);

  const cartLines = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => {
      const item = items.find(i => i.id === id)!;
      return { item, qty, line: item.price * qty };
    });
  const total = cartLines.reduce((s, l) => s + l.line, 0);
  const count = cartLines.reduce((s, l) => s + l.qty, 0);

  const bump = (id: string, delta: number) => {
    setCart(prev => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      if (next === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const reset = () => {
    setCart({});
    setVisitorName("");
    setMethod("card");
  };

  const submit = async () => {
    if (count === 0) return;
    setSubmitting(true);
    try {
      const rows = cartLines.map(l => ({
        club_id: clubId,
        bar_item_id: l.item.id,
        quantity: l.qty,
        unit_price: l.item.price,
        total: l.line,
        payment_method: method,
        visitor_name: visitorName.trim() || null,
        logged_by: loggedByMemberId || null,
      }));
      const { error } = await fromExt("bar_visitor_sales").insert(rows);
      if (error) throw error;
      toast.success(`R${total.toFixed(2)} ${method.toUpperCase()} sale recorded`);
      reset();
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["bar-items"] });
      qc.invalidateQueries({ queryKey: ["bar-visitor-sales"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to record sale");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" /> Visitor / Walk-in Sale
          </DialogTitle>
          <DialogDescription className="text-xs">
            Tap an item to add. Tap again to add more. Paid on the spot — posts to bank &amp; bar income.
          </DialogDescription>
        </DialogHeader>

        {/* Item grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {inStock.map(item => {
            const qty = cart[item.id] || 0;
            return (
              <Card
                key={item.id}
                onClick={() => bump(item.id, 1)}
                className={`relative p-1.5 cursor-pointer hover:bg-accent/50 transition-colors ${qty > 0 ? "ring-2 ring-primary" : ""}`}
              >
                <div className="w-full aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-2xl">{CATEGORY_ICONS[item.category] || "📦"}</span>
                  )}
                </div>
                <p className="text-[11px] font-medium leading-tight text-center truncate mt-1">{item.name}</p>
                <p className="text-[11px] text-muted-foreground text-center leading-none">R{item.price.toFixed(2)}</p>
                {qty > 0 && (
                  <>
                    <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                      {qty}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="absolute top-1 left-1 h-5 w-5"
                      onClick={(e) => { e.stopPropagation(); bump(item.id, -1); }}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </Card>
            );
          })}
        </div>

        {/* Cart summary */}
        {cartLines.length > 0 && (
          <div className="border rounded-md p-2 space-y-1 bg-muted/30">
            {cartLines.map(l => (
              <div key={l.item.id} className="flex items-center justify-between text-xs">
                <span className="truncate">{l.qty}× {l.item.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">R{l.line.toFixed(2)}</span>
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => bump(l.item.id, -l.qty)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payment method */}
        <div className="space-y-1.5">
          <Label className="text-xs">Payment method</Label>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(m => {
              const Icon = m.icon;
              const selected = method === m.value;
              return (
                <Button
                  key={m.value}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  className="h-10 gap-1.5"
                  onClick={() => setMethod(m.value)}
                >
                  <Icon className="w-4 h-4" /> {m.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Optional visitor name */}
        <div className="space-y-1.5">
          <Label htmlFor="visitor-name" className="text-xs">Visitor name <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            id="visitor-name"
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            placeholder="e.g. John (guest)"
            className="h-9 text-xs"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Badge variant="secondary" className="text-sm py-1 px-2">
            Total: R{total.toFixed(2)} {count > 0 && `· ${count} item${count > 1 ? "s" : ""}`}
          </Badge>
          <Button onClick={submit} disabled={count === 0 || submitting} className="h-10">
            {submitting ? "Recording…" : `Record ${method.toUpperCase()} sale`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

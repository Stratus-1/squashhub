/**
 * Staff Counter Sale — bar & shop till.
 *
 * Only reachable by signed-in staff with the Bar/POS permission for the club
 * they are working at. Member search is server-side and hard-scoped to that
 * same club; staff can never approve a member-account charge themselves — the
 * member enters their own Bar PIN (or a one-time code) on the device.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useClubCurrency } from "@/hooks/use-currency";
import { BarPinDialog } from "@/components/bar/BarPinDialog";
import { rememberPayReturnTarget } from "@/lib/stitch-checkout";
import { CreditCard, Loader2, Minus, Search, ShoppingCart, User, Users, Wallet, X } from "lucide-react";
import { toast } from "sonner";

interface BarItem {
  id: string;
  name: string;
  price: number;
  category: string;
  image_url?: string | null;
  stock_qty: number;
}

interface MemberHit {
  id: string;
  name: string;
  club_member_number: string | null;
  phone_hint: string | null;
  has_pin: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  soft_drinks: "🥤", water: "💧", energy: "⚡", beer_cider: "🍺", wine: "🍷",
  spirits: "🥃", hot_drinks: "☕", snacks: "🍿", meals: "🥪", other: "📦",
  drinks: "🥤", alcohol: "🍺",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BarItem[];
  clubId: string;
}

export function CounterSaleDialog({ open, onOpenChange, items, clubId }: Props) {
  const qc = useQueryClient();
  const { format: fmtMoney } = useClubCurrency();
  const money = (n: number) => fmtMoney(n, 2);

  const [customer, setCustomer] = useState<"member" | "visitor">("member");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [idMode, setIdMode] = useState<"number" | "search">("number");
  const [memberNumber, setMemberNumber] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  const [selected, setSelected] = useState<MemberHit | null>(null);
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  const inStock = useMemo(() => items.filter((i) => i.stock_qty > 0), [items]);

  const cartLines = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => {
      const item = items.find((i) => i.id === id)!;
      return { item, qty, line: Number(item.price) * qty };
    });
  const total = cartLines.reduce((s, l) => s + l.line, 0);
  const count = cartLines.reduce((s, l) => s + l.qty, 0);
  const lines = cartLines.map((l) => ({ bar_item_id: l.item.id, quantity: l.qty }));

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["bar-member-search", clubId, search],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("bar_search_members", { _club_id: clubId, _q: search });
      if (error) throw error;
      return (data || []) as MemberHit[];
    },
    enabled: open && customer === "member" && search.trim().length >= 2,
  });

  const bump = (id: string, delta: number) =>
    setCart((prev) => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      if (next === 0) {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });

  const reset = () => {
    setCart({});
    setSearch("");
    setMemberNumber("");
    setSelected(null);
    setVisitorName("");
    setVisitorPhone("");
  };

  /**
   * Member identifies himself: he types his own membership number, which
   * resolves to exactly one member of this club. A PIN alone is never used to
   * identify a person — two members could share the same digits — so the PIN
   * only ever approves the charge once the number has named the account.
   */
  const lookupByNumber = async () => {
    const num = memberNumber.trim();
    if (num.length < 1) return toast.error("Enter the membership number digits");
    setLookingUp(true);
    try {
      const { data, error } = await (supabase as any).rpc("bar_resolve_member_by_number", {
        _club_id: clubId,
        _number: num,
      });
      if (error) throw error;
      const hit = (data || [])[0] as MemberHit | undefined;
      if (!hit) throw new Error("No active member has that membership number");
      setSelected(hit);
    } catch (err: any) {
      toast.error(err.message || "Could not find that member");
    } finally {
      setLookingUp(false);
    }
  };


  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["bar-items"] });
    qc.invalidateQueries({ queryKey: ["bar-visitor-sales"] });
    qc.invalidateQueries({ queryKey: ["my-bar-tab"] });
  };

  /** Member account charge — posted only after the member verifies. */
  const chargeMemberAccount = async ({ secret, method, signature }: { secret: string; method: "pin" | "otp"; signature?: string | null }) => {
    const { error } = await (supabase as any).rpc("charge_bar_to_member", {
      _club_member_id: selected!.id,
      _lines: lines,
      _secret: secret,
      _method: method,
      _source: "counter",
      _signature: signature || null,
    });
    if (error) throw error;
    toast.success(`${money(total)} charged to ${selected!.name}'s account.`);
    setPinOpen(false);
    reset();
    onOpenChange(false);
    refresh();
  };

  /** Card swiped on the club's machine at the counter. */
  const cardAtCounter = async () => {
    if (count === 0) return;
    setBusy(true);
    try {
      if (customer === "visitor") {
        const { error } = await (supabase as any).rpc("record_bar_counter_visitor_sale", {
          _club_id: clubId,
          _lines: lines,
          _visitor_name: visitorName.trim(),
          _visitor_phone: visitorPhone.trim() || null,
          _payment_method: "card",
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).rpc("record_bar_counter_visitor_sale", {
          _club_id: clubId,
          _lines: lines,
          _visitor_name: selected!.name,
          _visitor_phone: null,
          _payment_method: "card",
        });
        if (error) throw error;
      }
      toast.success(`${money(total)} card sale recorded.`);
      reset();
      onOpenChange(false);
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Could not record the sale");
    } finally {
      setBusy(false);
    }
  };

  /** Online card checkout on the customer's device / the till browser. */
  const payOnline = async () => {
    if (count === 0) return;
    setBusy(true);
    try {
      rememberPayReturnTarget(`${window.location.origin}/bar`);
      const { data, error } = await supabase.functions.invoke("bar-card-pay", {
        body: {
          club_id: clubId,
          lines,
          buyer_name: customer === "member" ? selected?.name : visitorName.trim(),
          buyer_phone: customer === "visitor" ? visitorPhone.trim() || null : null,
          source: "counter",
          return_url: "https://squashhub.co.za/pay/return",
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const redirect = (data as any)?.redirect_url;
      if (!redirect) throw new Error("Card payment could not be started");
      window.open(String(redirect), "_blank", "noopener");
      toast.success("Card checkout opened — complete the payment to finish the sale.");
    } catch (err: any) {
      toast.error(err.message || "Could not start the card payment");
    } finally {
      setBusy(false);
    }
  };

  const customerReady =
    customer === "member" ? !!selected : visitorName.trim().length > 1 && visitorPhone.trim().length >= 6;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="w-4 h-4" /> Counter sale
            </DialogTitle>
            <DialogDescription className="text-xs">
              Build the basket, choose the customer, then take payment. Member account charges must be
              approved by the member on this device.
            </DialogDescription>
          </DialogHeader>

          {/* Basket */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {inStock.map((item) => {
              const qty = cart[item.id] || 0;
              return (
                <Card
                  key={item.id}
                  onClick={() => bump(item.id, 1)}
                  className={`relative p-1.5 cursor-pointer active:scale-95 transition-all hover:bg-accent/50 ${qty > 0 ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="w-full aspect-square rounded-md overflow-hidden bg-muted flex items-center justify-center">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-2xl">{CATEGORY_ICONS[item.category] || "📦"}</span>
                    )}
                  </div>
                  <p className="text-[11px] font-medium leading-tight text-center truncate mt-1">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground text-center leading-none">{money(Number(item.price))}</p>
                  {qty > 0 && (
                    <>
                      <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                        {qty}
                      </span>
                      <Button
                        size="icon" variant="outline" className="absolute top-1 left-1 h-5 w-5"
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

          {cartLines.length > 0 && (
            <div className="border rounded-md p-2 space-y-1 bg-muted/30">
              {cartLines.map((l) => (
                <div key={l.item.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">{l.qty}× {l.item.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{money(l.line)}</span>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => bump(l.item.id, -l.qty)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Separator />

          {/* Customer */}
          <Tabs value={customer} onValueChange={(v) => { setCustomer(v as any); setSelected(null); }}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="member" className="gap-1.5 text-xs"><User className="w-3.5 h-3.5" /> Member</TabsTrigger>
              <TabsTrigger value="visitor" className="gap-1.5 text-xs"><Users className="w-3.5 h-3.5" /> Visitor</TabsTrigger>
            </TabsList>

            <TabsContent value="member" className="space-y-2 mt-3">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-muted/50">
                <Button
                  type="button" size="sm"
                  variant={idMode === "number" ? "default" : "ghost"}
                  className="h-8 text-[11px]"
                  onClick={() => { setIdMode("number"); setSelected(null); }}
                >
                  Member identifies himself
                </Button>
                <Button
                  type="button" size="sm"
                  variant={idMode === "search" ? "default" : "ghost"}
                  className="h-8 text-[11px]"
                  onClick={() => { setIdMode("search"); setSelected(null); }}
                >
                  Staff search
                </Button>
              </div>

              {idMode === "number" ? (
                <div className="space-y-1">
                  <Label className="text-xs">Membership number</Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-9 text-sm"
                      placeholder="Digits only, e.g. 0036"
                      value={memberNumber}
                      onChange={(e) => { setMemberNumber(e.target.value); setSelected(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") lookupByNumber(); }}
                    />
                    <Button size="sm" className="h-9" disabled={lookingUp} onClick={lookupByNumber}>
                      {lookingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Look up"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    The member types just the digits of their membership number (the club prefix is matched
                    automatically), then approves the charge with their Bar PIN — the PIN on its own is never
                    used to identify anybody.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Search this club's active members</Label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-9 pl-8 text-sm"
                      placeholder="Name, surname, membership number or phone"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
                    />
                  </div>
                </div>
              )}

              {selected ? (
                <div className="flex items-center justify-between border rounded-md p-2 bg-primary/5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{selected.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {selected.club_member_number || "No membership number"} ·{" "}
                      {selected.has_pin ? "Bar PIN set" : "No Bar PIN — will verify by code"}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Change</Button>
                </div>
              ) : idMode === "search" ? (
                <div className="max-h-44 overflow-y-auto space-y-1">

                  {isFetching && <p className="text-[11px] text-muted-foreground px-1">Searching…</p>}
                  {hits.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelected(m)}
                      className="w-full text-left border rounded-md p-2 hover:bg-accent/50"
                    >
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {m.club_member_number || "No membership number"}
                        {m.has_pin ? "" : " · no Bar PIN yet"}
                      </p>
                    </button>
                  ))}
                  {!isFetching && search.trim().length >= 2 && hits.length === 0 && (
                    <p className="text-[11px] text-muted-foreground px-1">No active members match that search.</p>
                  )}
                </div>
              ) : null}

            </TabsContent>

            <TabsContent value="visitor" className="space-y-2 mt-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Visitor name</Label>
                  <Input className="h-9 text-sm" value={visitorName} onChange={(e) => setVisitorName(e.target.value)} maxLength={80} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mobile number</Label>
                  <Input className="h-9 text-sm" inputMode="tel" value={visitorPhone} onChange={(e) => setVisitorPhone(e.target.value)} maxLength={20} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Visitors cannot charge a member account.
              </p>
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-sm py-1 px-2">
              {money(total)}{count > 0 ? ` · ${count} item${count > 1 ? "s" : ""}` : ""}
            </Badge>
          </div>

          <div className="space-y-2">
            {customer === "member" && (
              <Button
                className="w-full h-11 gap-2"
                disabled={busy || count === 0 || !selected}
                onClick={() => setPinOpen(true)}
              >
                <Wallet className="w-4 h-4" /> Charge to member account
              </Button>
            )}
            <Button
              variant="outline" className="w-full h-11 gap-2"
              disabled={busy || count === 0 || !customerReady}
              onClick={payOnline}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Pay online
            </Button>
            <Button
              variant="outline" className="w-full h-11 gap-2"
              disabled={busy || count === 0 || !customerReady}
              onClick={cardAtCounter}
            >
              <CreditCard className="w-4 h-4" /> Card paid at counter
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {selected && (
        <BarPinDialog
          open={pinOpen}
          onOpenChange={setPinOpen}
          clubMemberId={selected.id}
          memberName={selected.name}
          amountLabel={money(total)}
          mode="counter"
          captureSignature
          onVerified={chargeMemberAccount}
        />
      )}
    </>
  );
}

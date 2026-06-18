import { useRef, useState } from "react";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Beer, Wine, Coffee, Package, ImageIcon, AlertTriangle, PackagePlus, FileText, X, Upload, Sparkles, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClubMembers, useUpdateClub, Club } from "@/hooks/use-club";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";

interface BarItem {
  id: string;
  club_id: string;
  name: string;
  price: number;
  category: string;
  active: boolean;
  sort_order: number;
  image_url?: string | null;
  stock_qty: number;
  low_stock_threshold: number;
  cost_price: number;
}

interface BarTabEntry {
  id: string;
  club_id: string;
  club_member_id: string;
  bar_item_id: string;
  quantity: number;
  unit_price: number;
  total: number;
  settled: boolean;
  created_at: string;
  bar_items?: { name: string; category: string };
  club_members?: { name: string };
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

export function HonestyBarTab({ club, clubId }: { club: Club; clubId: string }) {
  const qc = useQueryClient();
  const updateClub = useUpdateClub();
  const { data: members = [] } = useClubMembers(clubId);

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["bar-items", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_items")
        .select("*")
        .eq("club_id", clubId)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data as BarItem[];
    },
  });

  const { data: recentEntries = [] } = useQuery({
    queryKey: ["bar-tab-recent", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_tab_entries")
        .select("*, bar_items:bar_item_id(name, category), club_members:club_member_id(name)")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as BarTabEntry[];
    },
  });

  const { data: recentVisitorSales = [] } = useQuery({
    queryKey: ["bar-visitor-sales-recent", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_visitor_sales")
        .select("*, bar_items:bar_item_id(name, category), recorder:logged_by(name)")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: stockPurchases = [] } = useQuery({
    queryKey: ["bar-stock-purchases", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_stock_purchases")
        .select("*, bar_items:bar_item_id(name, category)")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const toggleBarEnabled = async () => {
    try {
      await updateClub.mutateAsync({ id: club.id, honesty_bar_enabled: !club.honesty_bar_enabled });
      toast.success(club.honesty_bar_enabled ? "Honesty bar disabled" : "Honesty bar enabled");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const enabled = !!club.honesty_bar_enabled;

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">Honesty Bar</h3>
            <p className="text-sm text-muted-foreground">
              When enabled, members see the self-service bar tab and items are charged to their account.
              Disable it to set up products and stock without exposing the bar to members.
            </p>
            <p className="text-xs mt-2">
              Status:{" "}
              <span className={enabled ? "text-emerald-600 font-medium" : "text-muted-foreground font-medium"}>
                {enabled ? "Live to members" : "Hidden from members (admin setup mode)"}
              </span>
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={toggleBarEnabled}
          />
        </div>
      </Card>

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-10">
          <TabsTrigger value="items" className="text-xs sm:text-sm">Items</TabsTrigger>
          <TabsTrigger value="stock-purchases" className="text-xs sm:text-sm">Stock Purchases</TabsTrigger>
          <TabsTrigger value="member-sales" className="text-xs sm:text-sm">Member Sales</TabsTrigger>
          <TabsTrigger value="card-sales" className="text-xs sm:text-sm">Card Sales</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4 space-y-4">
          <ItemManager clubId={clubId} items={items} loading={itemsLoading} />
        </TabsContent>

        <TabsContent value="stock-purchases" className="mt-4 space-y-4">
          <PurchaseInvoice clubId={clubId} items={items} />
          <Card className="p-6 space-y-4">
            <h3 className="font-semibold">Recent Stock Purchases</h3>
            <p className="text-sm text-muted-foreground">Recorded supplier invoices and stock restocking.</p>

            {stockPurchases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stock purchases recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {stockPurchases.slice(0, 20).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.supplier || "Supplier"} {p.invoice_number ? `#${p.invoice_number}` : ""}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.quantity}× {p.bar_items?.name || "Item"} @ R{Number(p.unit_cost).toFixed(2)} · {format(new Date(p.created_at), "dd MMM yyyy")}
                        {p.payment_method ? ` · ${p.payment_method}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">R{Number(p.total_cost).toFixed(2)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="member-sales" className="mt-4 space-y-4">
          {enabled ? (
            <>
              <Card className="p-6 space-y-4">
                <h3 className="font-semibold">Recent Bar Charges</h3>
                <p className="text-sm text-muted-foreground">Bar items are charged directly to each member account.</p>

                {recentEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bar charges yet.</p>
                ) : (
                  <div className="space-y-2">
                    {recentEntries.slice(0, 20).map(e => (
                      <div key={e.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{(e.club_members as any)?.name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {e.quantity}× {(e.bar_items as any)?.name || "Item"} · {format(new Date(e.created_at), "dd MMM HH:mm")}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-xs">R{e.total.toFixed(2)}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <AdminAddCharge clubId={clubId} items={items} members={members} />
            </>
          ) : (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">
                Honesty bar is currently disabled. Enable it above to see member sales.
              </p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="card-sales" className="mt-4 space-y-4">
          {enabled ? (
            <Card className="p-6 space-y-4">
              <h3 className="font-semibold">Recent Visitor / Direct Card Machine Sales</h3>
              <p className="text-sm text-muted-foreground">Sales paid directly via the card machine at the club (not charged to a member account).</p>

              {recentVisitorSales.length === 0 ? (
                <p className="text-sm text-muted-foreground">No visitor / direct card sales yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentVisitorSales.slice(0, 20).map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.visitor_name || "Visitor"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {s.quantity}× {s.bar_items?.name || "Item"} · {format(new Date(s.created_at), "dd MMM HH:mm")}
                          {s.recorder?.name ? ` · ${s.recorder.name}` : ""}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-xs">R{Number(s.total).toFixed(2)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">
                Honesty bar is currently disabled. Enable it above to see card machine sales.
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}


/* ─── Item Manager with edit support ─── */
function ItemManager({ clubId, items, loading }: { clubId: string; items: BarItem[]; loading: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editItem, setEditItem] = useState<BarItem | null>(null);
  const [form, setForm] = useState({ name: "", price: "", category: "soft_drinks", image_url: "", low_stock_threshold: "5", cost_price: "", opening_stock: "0" });

  const resetForm = () => setForm({ name: "", price: "", category: "soft_drinks", image_url: "", low_stock_threshold: "5", cost_price: "", opening_stock: "0" });

  const openEdit = (item: BarItem) => {
    setEditItem(item);
    setForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      image_url: item.image_url || "",
      low_stock_threshold: String(item.low_stock_threshold),
      cost_price: item.cost_price ? String(item.cost_price) : "",
      opening_stock: String(item.stock_qty ?? 0),
    });
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.price) return;
    const { error } = await fromExt("bar_items").insert({
      club_id: clubId,
      name: form.name.trim(),
      price: parseFloat(form.price),
      category: form.category,
      sort_order: items.length,
      image_url: form.image_url.trim() || null,
      low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
      cost_price: parseFloat(form.cost_price) || 0,
      stock_qty: parseInt(form.opening_stock) || 0,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Item added");
      resetForm();
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["bar-items"] });
    }
  };

  const handleUpdate = async () => {
    if (!editItem || !form.name.trim() || !form.price) return;
    const { error } = await fromExt("bar_items").update({
      name: form.name.trim(),
      price: parseFloat(form.price),
      category: form.category,
      image_url: form.image_url.trim() || null,
      low_stock_threshold: parseInt(form.low_stock_threshold) || 5,
      cost_price: parseFloat(form.cost_price) || 0,
      stock_qty: parseInt(form.opening_stock) || 0,
    }).eq("id", editItem.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Item updated");
      setEditItem(null);
      resetForm();
      qc.invalidateQueries({ queryKey: ["bar-items"] });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this bar item?")) return;
    const { error } = await fromExt("bar_items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Item removed"); qc.invalidateQueries({ queryKey: ["bar-items"] }); }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    const { error } = await fromExt("bar_items").update({ active: !active }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bar-items"] });
  };

  const CATEGORY_EMOJI: Record<string, string> = {
    soft_drinks: "🥤", water: "💧", energy: "⚡", beer_cider: "🍺", wine: "🍷", spirits: "🥃", hot_drinks: "☕", snacks: "🍿", meals: "🥪", other: "📦", drinks: "🥤", alcohol: "🍺",
  };

  const itemForm = (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Item name</Label>
          <Input
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Castle Lager"
          />
        </div>
        <div>
          <Label className="text-xs">Sell Price (R)</Label>
          <Input
            type="number" min={0} step={0.5}
            value={form.price}
            onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label className="text-xs">Cost Price (R)</Label>
          <Input
            type="number" min={0} step={0.01}
            value={form.cost_price}
            onChange={e => setForm(p => ({ ...p, cost_price: e.target.value }))}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label className="text-xs">Min Stock Level</Label>
          <Input
            type="number" min={0}
            value={form.low_stock_threshold}
            onChange={e => setForm(p => ({ ...p, low_stock_threshold: e.target.value }))}
            placeholder="5"
          />
        </div>
        <div>
          <Label className="text-xs">{editItem ? "Current Stock Level" : "Opening Stock"}</Label>
          <Input
            type="number" min={0}
            value={form.opening_stock}
            onChange={e => setForm(p => ({ ...p, opening_stock: e.target.value }))}
            placeholder="0"
          />
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Item image</Label>
          <ImageField
            value={form.image_url}
            onChange={(url) => setForm(p => ({ ...p, image_url: url }))}
            clubId={clubId}
            itemName={form.name}
            category={form.category}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={editItem ? handleUpdate : handleAdd}>
          {editItem ? "Save Changes" : "Add Item"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setAdding(false); setEditItem(null); resetForm(); }}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Bar Items ({items.length})</h3>
        {!adding && !editItem && (
          <Button size="sm" variant="outline" onClick={() => { setAdding(true); resetForm(); }}>
            <Plus className="w-3.5 h-3.5 mr-1" />Add Item
          </Button>
        )}
      </div>

      {(adding || editItem) && itemForm}

      <div className="space-y-2">
        {items.map(item => {
          const cat = CATEGORIES.find(c => c.value === item.category);
          const isLowStock = item.stock_qty > 0 && item.stock_qty <= item.low_stock_threshold;
          const isOutOfStock = item.stock_qty <= 0;
          return (
            <div key={item.id} className="flex items-start sm:items-center gap-2 sm:gap-3 rounded-lg border p-2.5">
              <div className="w-8 h-8 rounded overflow-hidden bg-muted flex items-center justify-center shrink-0">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm">{CATEGORY_EMOJI[item.category] || "📦"}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${!item.active ? "line-through text-muted-foreground" : ""}`}>
                  {item.name}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                  <span className="text-xs text-muted-foreground">R{item.price.toFixed(2)}</span>
                  {item.cost_price > 0 && (
                    <span className="text-xs text-muted-foreground">(cost R{item.cost_price.toFixed(2)})</span>
                  )}
                  {isOutOfStock ? (
                    <Badge variant="destructive" className="text-[10px] gap-0.5">
                      <AlertTriangle className="w-3 h-3" /> Out
                    </Badge>
                  ) : isLowStock ? (
                    <Badge variant="secondary" className="text-[10px] gap-0.5 border-orange-300 text-orange-700 dark:text-orange-400">
                      <AlertTriangle className="w-3 h-3" /> {item.stock_qty} (min {item.low_stock_threshold})
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">{item.stock_qty} in stock</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">{cat?.label}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit item" onClick={() => openEdit(item)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Switch
                  checked={item.active}
                  onCheckedChange={() => handleToggleActive(item.id, item.active)}
                  className="scale-75"
                />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {items.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">No items yet — add your first bar item above.</p>
        )}
      </div>
    </Card>
  );
}

/* ─── Purchase Invoice ─── */
interface InvoiceLine {
  bar_item_id: string;
  quantity: string;
  unit_cost: string;
}

function PurchaseInvoice({ clubId, items }: { clubId: string; items: BarItem[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [lines, setLines] = useState<InvoiceLine[]>([{ bar_item_id: "", quantity: "1", unit_cost: "" }]);
  const [submitting, setSubmitting] = useState(false);

  const addLine = () => setLines(prev => [...prev, { bar_item_id: "", quantity: "1", unit_cost: "" }]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: keyof InvoiceLine, value: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const invoiceTotal = lines.reduce((sum, l) => {
    const qty = parseInt(l.quantity) || 0;
    const cost = parseFloat(l.unit_cost) || 0;
    return sum + qty * cost;
  }, 0);

  const handleSubmit = async () => {
    const validLines = lines.filter(l => l.bar_item_id && parseInt(l.quantity) > 0);
    if (validLines.length === 0) { toast.error("Add at least one item line"); return; }

    setSubmitting(true);
    try {
      const supplierNote = [
        supplier ? `Supplier: ${supplier}` : null,
        invoiceNumber ? `Inv #${invoiceNumber}` : null,
        paymentMethod ? `Paid: ${paymentMethod}` : null,
      ].filter(Boolean).join(" | ");

      const purchases = validLines.map(l => ({
        club_id: clubId,
        bar_item_id: l.bar_item_id,
        quantity: parseInt(l.quantity),
        unit_cost: parseFloat(l.unit_cost) || 0,
        total_cost: (parseInt(l.quantity)) * (parseFloat(l.unit_cost) || 0),
        supplier: supplier.trim() || null,
        supplier_note: supplierNote || null,
        invoice_number: invoiceNumber.trim() || null,
        invoice_date: invoiceDate,
        payment_method: paymentMethod,
      }));

      const { error } = await fromExt("bar_stock_purchases").insert(purchases);
      if (error) throw error;

      toast.success(`Invoice recorded — R${invoiceTotal.toFixed(2)} across ${validLines.length} item(s)`);
      setOpen(false);
      setInvoiceNumber("");
      setSupplier("");
      setInvoiceDate(format(new Date(), "yyyy-MM-dd"));
      setPaymentMethod("cash");
      setLines([{ bar_item_id: "", quantity: "1", unit_cost: "" }]);
      qc.invalidateQueries({ queryKey: ["bar-items"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to record purchase");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="p-6 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Record Stock Purchase</h3>
            <p className="text-sm text-muted-foreground">Log a supplier invoice to add stock and record the expense.</p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <FileText className="w-3.5 h-3.5 mr-1" />New Invoice
          </Button>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Purchase Invoice</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Supplier */}
            <div>
              <Label className="text-xs">Supplier</Label>
              <Input
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                placeholder="e.g. Makro, SAB, Coca-Cola"
                maxLength={120}
              />
            </div>
            {/* Invoice header */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Invoice Number</Label>
                <Input
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-2026-001"
                />
              </div>
              <div>
                <Label className="text-xs">Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="eft">EFT</SelectItem>
                    <SelectItem value="account">Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold">Line Items</Label>
                <Button size="sm" variant="outline" onClick={addLine} className="h-6 text-xs">
                  <Plus className="w-3 h-3 mr-1" />Add Line
                </Button>
              </div>
              <div className="space-y-2">
                {lines.map((line, idx) => {
                  const selectedItem = items.find(i => i.id === line.bar_item_id);
                  const lineTotal = (parseInt(line.quantity) || 0) * (parseFloat(line.unit_cost) || 0);
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_80px_100px_60px_30px] gap-2 items-end">
                      <div>
                        {idx === 0 && <Label className="text-[10px] text-muted-foreground">Item</Label>}
                        <Select value={line.bar_item_id} onValueChange={v => {
                          updateLine(idx, "bar_item_id", v);
                          const item = items.find(i => i.id === v);
                          if (item?.cost_price) updateLine(idx, "unit_cost", String(item.cost_price));
                        }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select item" /></SelectTrigger>
                          <SelectContent>
                            {items.map(i => (
                              <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        {idx === 0 && <Label className="text-[10px] text-muted-foreground">Qty</Label>}
                        <Input
                          type="number" min={1} className="h-8 text-xs"
                          value={line.quantity}
                          onChange={e => updateLine(idx, "quantity", e.target.value)}
                        />
                      </div>
                      <div>
                        {idx === 0 && <Label className="text-[10px] text-muted-foreground">Cost (R)</Label>}
                        <Input
                          type="number" min={0} step={0.01} className="h-8 text-xs"
                          value={line.unit_cost}
                          onChange={e => updateLine(idx, "unit_cost", e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="text-xs text-right font-medium pb-1">
                        {idx === 0 && <Label className="text-[10px] text-muted-foreground block">Total</Label>}
                        R{lineTotal.toFixed(2)}
                      </div>
                      <div>
                        {lines.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLine(idx)}>
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Invoice total */}
            <div className="flex justify-end border-t pt-3">
              <span className="text-sm font-semibold">Invoice Total: R{invoiceTotal.toFixed(2)}</span>
            </div>

            <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
              <PackagePlus className="w-4 h-4 mr-1.5" />
              {submitting ? "Recording..." : "Record Purchase"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Admin Add Charge ─── */
function AdminAddCharge({ clubId, items, members }: { clubId: string; items: BarItem[]; members: any[] }) {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const activeItems = items.filter(i => i.active);
  const selectedItem = activeItems.find(i => i.id === itemId);

  const handleAdd = async () => {
    if (!memberId || !itemId || !selectedItem) return;
    const total = selectedItem.price * quantity;
    const { error } = await fromExt("bar_tab_entries").insert({
      club_id: clubId,
      club_member_id: memberId,
      bar_item_id: itemId,
      quantity,
      unit_price: selectedItem.price,
      total,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Charge added");
      setMemberId("");
      setItemId("");
      setQuantity(1);
      qc.invalidateQueries({ queryKey: ["bar-tab-recent"] });
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <h3 className="font-semibold">Add Charge for Member</h3>
      <p className="text-sm text-muted-foreground">Manually log a bar item on behalf of a member.</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Select value={memberId} onValueChange={setMemberId}>
          <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
          <SelectContent>
            {members.map(m => (
              <SelectItem key={m.id} value={m.id}>
                {m.name || m.profiles?.name || m.email || "Unknown"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
          <SelectContent>
            {activeItems.map(i => (
              <SelectItem key={i.id} value={i.id}>
                {i.name} — R{i.price.toFixed(2)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={1}
          value={quantity}
          onChange={e => setQuantity(parseInt(e.target.value) || 1)}
          placeholder="Qty"
        />
        <Button onClick={handleAdd} disabled={!memberId || !itemId}>
          Add Charge{selectedItem ? ` (R${(selectedItem.price * quantity).toFixed(2)})` : ""}
        </Button>
      </div>
    </Card>
  );
}

/* ─── Image Field with upload + AI generate ─── */
function ImageField({
  value, onChange, clubId, itemName, category,
}: {
  value: string;
  onChange: (url: string) => void;
  clubId: string;
  itemName: string;
  category: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${clubId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("bar-items").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("bar-items").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!itemName.trim()) { toast.error("Enter an item name first"); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-bar-item-image", {
        body: { name: itemName.trim(), category, clubId },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No image returned");
      onChange(data.url);
      toast.success("Image generated");
    } catch (err: any) {
      toast.error(err.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-14 h-14 rounded border bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {value ? (
            <img src={value} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
            Upload
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleGenerate} disabled={generating || !itemName.trim()}>
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
            Generate with AI
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
              <X className="w-3.5 h-3.5 mr-1" /> Remove
            </Button>
          )}
        </div>
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…or paste an image URL"
        className="text-xs h-8"
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
      />
    </div>
  );
}

import { useState } from "react";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Beer, Wine, Coffee, Package, ImageIcon, AlertTriangle, PackagePlus, FileText, X } from "lucide-react";
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
  { value: "drinks", label: "Drinks", icon: Beer },
  { value: "alcohol", label: "Alcohol", icon: Wine },
  { value: "snacks", label: "Snacks", icon: Coffee },
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

  const { data: unsettledEntries = [] } = useQuery({
    queryKey: ["bar-tab-unsettled", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_tab_entries")
        .select("*, bar_items:bar_item_id(name, category), club_members:club_member_id(name)")
        .eq("club_id", clubId)
        .eq("settled", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BarTabEntry[];
    },
  });

  const memberTabs = unsettledEntries.reduce((acc, entry) => {
    const memberId = entry.club_member_id;
    if (!acc[memberId]) {
      acc[memberId] = {
        name: (entry.club_members as any)?.name || "Unknown",
        entries: [],
        total: 0,
      };
    }
    acc[memberId].entries.push(entry);
    acc[memberId].total += entry.total;
    return acc;
  }, {} as Record<string, { name: string; entries: BarTabEntry[]; total: number }>);

  const toggleBarEnabled = async () => {
    try {
      await updateClub.mutateAsync({ id: club.id, honesty_bar_enabled: !club.honesty_bar_enabled });
      toast.success(club.honesty_bar_enabled ? "Honesty bar disabled" : "Honesty bar enabled");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Honesty Bar</h3>
            <p className="text-sm text-muted-foreground">
              Enable self-service bar tab for members. Items consumed are added to their account.
            </p>
          </div>
          <Switch
            checked={!!club.honesty_bar_enabled}
            onCheckedChange={toggleBarEnabled}
          />
        </div>
      </Card>

      {club.honesty_bar_enabled && (
        <>
          <ItemManager clubId={clubId} items={items} loading={itemsLoading} />

          {/* Record Purchase Invoice */}
          <PurchaseInvoice clubId={clubId} items={items} />

          <Card className="p-6 space-y-4">
            <h3 className="font-semibold">Outstanding Tabs ({Object.keys(memberTabs).length} members)</h3>
            <p className="text-sm text-muted-foreground">Members with unsettled bar items.</p>

            {Object.keys(memberTabs).length === 0 ? (
              <p className="text-sm text-muted-foreground">No outstanding tabs 🎉</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(memberTabs)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([memberId, tab]) => (
                    <div key={memberId} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{tab.name}</span>
                        <Badge variant="destructive" className="text-xs">
                          R{tab.total.toFixed(2)}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {tab.entries.map(e => (
                          <div key={e.id} className="flex justify-between text-xs text-muted-foreground">
                            <span>{e.quantity}× {(e.bar_items as any)?.name}</span>
                            <span>R{e.total.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs h-7"
                        onClick={async () => {
                          const entryIds = tab.entries.map(e => e.id);
                          for (const id of entryIds) {
                            await fromExt("bar_tab_entries")
                              .update({ settled: true, settled_at: new Date().toISOString() })
                              .eq("id", id);
                          }
                          toast.success(`Settled R${tab.total.toFixed(2)} for ${tab.name}`);
                          qc.invalidateQueries({ queryKey: ["bar-tab-unsettled"] });
                        }}
                      >
                        Mark as Settled
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </Card>

          <AdminAddCharge clubId={clubId} items={items} members={members} />
        </>
      )}
    </div>
  );
}

/* ─── Item Manager with edit support ─── */
function ItemManager({ clubId, items, loading }: { clubId: string; items: BarItem[]; loading: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editItem, setEditItem] = useState<BarItem | null>(null);
  const [form, setForm] = useState({ name: "", price: "", category: "drinks", image_url: "", low_stock_threshold: "5", cost_price: "" });

  const resetForm = () => setForm({ name: "", price: "", category: "drinks", image_url: "", low_stock_threshold: "5", cost_price: "" });

  const openEdit = (item: BarItem) => {
    setEditItem(item);
    setForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      image_url: item.image_url || "",
      low_stock_threshold: String(item.low_stock_threshold),
      cost_price: item.cost_price ? String(item.cost_price) : "",
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
    drinks: "🥤", alcohol: "🍺", snacks: "🍿", other: "📦",
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
        <div>
          <Label className="text-xs">Image URL (optional)</Label>
          <Input
            value={form.image_url}
            onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))}
            placeholder="https://..."
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
            <div key={item.id} className="flex items-center gap-3 rounded-lg border p-2.5">
              <div className="w-8 h-8 rounded overflow-hidden bg-muted flex items-center justify-center shrink-0">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm">{CATEGORY_EMOJI[item.category] || "📦"}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${!item.active ? "line-through text-muted-foreground" : ""}`}>
                  {item.name}
                </span>
                <span className="text-xs text-muted-foreground ml-2">R{item.price.toFixed(2)}</span>
                {item.cost_price > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">(cost R{item.cost_price.toFixed(2)})</span>
                )}
              </div>
              {/* Stock indicator */}
              <div className="flex items-center gap-1">
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
              </div>
              <Badge variant="outline" className="text-[10px]">{cat?.label}</Badge>
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
        invoiceNumber ? `Inv #${invoiceNumber}` : null,
        paymentMethod ? `Paid: ${paymentMethod}` : null,
      ].filter(Boolean).join(" | ");

      const purchases = validLines.map(l => ({
        club_id: clubId,
        bar_item_id: l.bar_item_id,
        quantity: parseInt(l.quantity),
        unit_cost: parseFloat(l.unit_cost) || 0,
        total_cost: (parseInt(l.quantity)) * (parseFloat(l.unit_cost) || 0),
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
      qc.invalidateQueries({ queryKey: ["bar-tab-unsettled"] });
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

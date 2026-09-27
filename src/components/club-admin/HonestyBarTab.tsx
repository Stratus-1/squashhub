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
import { SetupSteps, SetupStepNav, type SetupStep } from "./setup/SetupSteps";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Package, ImageIcon, AlertTriangle, PackagePlus, FileText, X, Upload, Sparkles, Loader2, QrCode, ScanBarcode } from "lucide-react";
import { BarQrLabelsDialog } from "./BarQrLabelsDialog";
import { ProductScanDialog } from "@/components/bar/ProductScanDialog";
import { CounterModeCard } from "@/components/bar/CounterModeCard";
import { StockLevelsTab } from "./bar/StockLevelsTab";
import { CostingTab } from "./bar/CostingTab";
import { OpenTabsTab } from "./bar/OpenTabsTab";
import { BarMenuQrDialog } from "@/components/BarMenuQrDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClubMembers, useUpdateClub, Club } from "@/hooks/use-club";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { useClubCurrency } from "@/hooks/use-currency";
import {
  BAR_CATEGORY_EMOJI,
  categoriesForDivision,
  useBarCategories,
  useBarDivisions,
} from "@/lib/bar-categories";
import {
  DEFAULT_TOTS_PER_BOTTLE, WEEKDAYS, formatStock, splitUnits, validitySummary, unitsPerSale,
  type InventoryItem, type SpecialComponent,
} from "@/lib/bar-inventory";
import { CategoryManagerDialog } from "./bar/CategoryManagerDialog";
import { ImportItemsDialog } from "./bar/ImportItemsDialog";
import { ComponentPicker } from "./bar/ComponentPicker";
import { categoryLabel } from "@/lib/bar-categories";

interface BarItem {
  id: string;
  club_id: string;
  name: string;
  price: number;
  category: string;
  division?: string;
  active: boolean;
  sort_order: number;
  image_url?: string | null;
  stock_qty: number;
  low_stock_threshold: number;
  cost_price: number;
  barcode?: string | null;
  item_kind?: "stock" | "option" | "special" | null;
  stock_parent_id?: string | null;
  consume_units?: number | null;
  unit_yield?: number | null;
  unit_label?: string | null;
  stock_unit_label?: string | null;
  stock_units?: number | null;
  sellable?: boolean | null;
  product_group?: string | null;
  variant_label?: string | null;
  archived_at?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  valid_days?: number[] | null;
  valid_start_time?: string | null;
  valid_end_time?: string | null;
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

export function HonestyBarTab({ club, clubId }: { club: Club; clubId: string }) {
  const { format: money } = useClubCurrency();
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
      toast.success(club.honesty_bar_enabled ? "Self-service bar disabled" : "Self-service bar enabled");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const enabled = !!club.honesty_bar_enabled;
  const [step, setStep] = useState("items");
  const [qrOpen, setQrOpen] = useState(false);
  const [menuQrOpen, setMenuQrOpen] = useState(false);
  const [qrItemId, setQrItemId] = useState<string | null>(null);
  const openQrLabels = (itemId?: string) => {
    setQrItemId(itemId || null);
    setQrOpen(true);
  };

  const barSteps: SetupStep[] = [
    { id: "items", label: "Items & prices", description: "List everything on sale at the bar with its selling price and current stock — this is the menu customers see when they scan.", complete: items.length > 0 },
    { id: "stock-purchases", label: "Stock purchases", description: "Record supplier invoices so stock levels and bar cost of sales stay accurate.", complete: stockPurchases.length > 0 },
    { id: "stock-levels", label: "Stock levels", description: "See stock on hand on any date and run a stock take to find differences.", complete: items.length > 0 },
    { id: "costing", label: "Costing & margins", description: "Optional average-cost tracking with cost of sales, gross profit and margin.", complete: false },
    { id: "member-sales", label: "Member sales", description: "Purchases charged to a member's account tab — and a way to add a charge on a member's behalf.", complete: enabled },
    { id: "card-sales", label: "Card sales", description: "Visitor, walk-in and scan-to-pay sales paid by card instead of a member account.", complete: enabled },
    { id: "open-tabs", label: "Open tabs", description: "See which guest tabs are still open or unpaid, who is serving them, and what is outstanding.", complete: enabled },
  ];



  return (
    <div className="space-y-6 mt-4">
      <CounterModeCard clubId={clubId} />
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">Self-service Bar &amp; POS</h3>
            <p className="text-sm text-muted-foreground">
              Let members and visitors buy from the bar without staff assistance. Share one Menu QR for the full
              product list, or print individual Product QR labels for quick item-by-item purchases. Visitors can
              select items and pay by card; members can also charge purchases to their member account.
              Turn it off to set up products and stock without opening the bar to customers.
            </p>
            <p className="text-xs mt-2">
              Status:{" "}
              <span className={enabled ? "text-emerald-600 font-medium" : "text-muted-foreground font-medium"}>
                {enabled
                  ? "Self-service purchasing is live for members and visitors"
                  : "Self-service purchasing is off (admin setup mode)"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setMenuQrOpen(true)}>
              <QrCode className="w-3.5 h-3.5 mr-1" /> Menu QR
            </Button>
            <Button size="sm" variant="outline" onClick={() => openQrLabels()}>
              <QrCode className="w-3.5 h-3.5 mr-1" /> Product QR labels
            </Button>
            <Switch
              checked={enabled}
              onCheckedChange={toggleBarEnabled}
            />
          </div>
        </div>

        {/* Which checkout options customers may use at this club */}
        <div className="mt-3 pt-3 border-t grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { key: "bar_account_tab_enabled", label: "Add to member account", hint: "Members charge to their tab", defaultOff: false },
            { key: "bar_pay_online_enabled", label: "Pay with card online", hint: "Card checkout via your gateway", defaultOff: false },
            { key: "bar_card_swipe_enabled", label: "Swipe card at the club", hint: "Order sent to the club card machine", defaultOff: false },
            { key: "bar_cash_enabled", label: "Cash at the bar", hint: "Guests can settle their tab in cash", defaultOff: true },
          ].map((opt) => (
            <div key={opt.key} className="flex items-start justify-between gap-2 rounded-md border p-2">
              <div className="min-w-0">
                <p className="text-xs font-medium leading-tight">{opt.label}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{opt.hint}</p>
              </div>
              <Switch
                disabled={updateClub.isPending}
                checked={opt.defaultOff ? (club as any)?.[opt.key] === true : (club as any)?.[opt.key] !== false}
                onCheckedChange={async (v) => {
                  try {
                    await updateClub.mutateAsync({ id: club.id, [opt.key]: v } as any);
                    toast.success(`${opt.label} ${v ? "switched on" : "switched off"}`);
                  } catch (err: any) {
                    toast.error(err?.message || `Could not change "${opt.label}"`);
                  }
                }}
              />
            </div>
          ))}
        </div>
      </Card>


      <SetupSteps steps={barSteps} value={step} onChange={setStep} />


      {step === "items" && (
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Scan-to-pay QR codes</h3>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Menu QR</span> — one code (poster or screen) that opens
                your full bar menu: anyone can pick items and pay by card, members can charge to their account.{" "}
                <span className="font-medium text-foreground">Product QR labels</span> — a club-specific sticker per
                product so a customer scans straight to that item and buys it in a tap.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setMenuQrOpen(true)}>
                <QrCode className="w-3.5 h-3.5 mr-1" /> Menu QR
              </Button>
              <Button size="sm" variant="outline" onClick={() => openQrLabels()}>
                <QrCode className="w-3.5 h-3.5 mr-1" /> Product QR labels
              </Button>
            </div>
          </Card>
          <ItemManager clubId={clubId} items={items} loading={itemsLoading} onQrLabels={openQrLabels} />
        </div>
      )}

      <BarMenuQrDialog
        open={menuQrOpen}
        onOpenChange={setMenuQrOpen}
        clubId={clubId}
        clubName={club.name}
        subdomain={(club as any).subdomain}
      />

      <BarQrLabelsDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        clubId={clubId}
        clubName={club.name}
        subdomain={(club as any).subdomain}
        items={items}
        focusItemId={qrItemId}
      />



      {step === "stock-purchases" && (
        <div className="space-y-4">
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
                        {p.quantity}× {p.bar_items?.name || "Item"} @ {money(Number(p.unit_cost))} · {format(new Date(p.created_at), "dd MMM yyyy")}
                        {p.payment_method ? ` · ${p.payment_method}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">{money(Number(p.total_cost))}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {step === "stock-levels" && <StockLevelsTab clubId={clubId} />}

      {step === "costing" && <CostingTab clubId={clubId} />}

      {step === "open-tabs" && <OpenTabsTab clubId={clubId} />}

      {step === "member-sales" && (
        <div className="space-y-4">

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
                        <Badge variant="secondary" className="text-xs">{money(e.total)}</Badge>
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
        </div>
      )}

      {step === "card-sales" && (
        <div className="space-y-4">

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
                      <Badge variant="secondary" className="text-xs">{money(Number(s.total))}</Badge>
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
        </div>
      )}

      <SetupStepNav steps={barSteps} value={step} onChange={setStep} />

    </div>
  );
}


/* ─── Item Manager: products, variants, selling options, specials ─── */
type ItemKind = "stock" | "option" | "special";
interface ComponentLine { component_item_id: string; quantity: string }

const emptyForm = (division = "bar", category = "") => ({
  name: "", price: "", category, division, image_url: "", low_stock_threshold: "5", cost_price: "",
  opening_stock: "0", open_units: "0", barcode: "",
  item_kind: "stock" as ItemKind, unit_yield: "1", unit_label: "tot", stock_unit_label: "bottle", stock_measure: "count" as "count" | "bottle" | "volume", opening_litres: "0", sellable: true,
  product_group: "", variant_label: "", stock_parent_id: "", consume_units: "1",
  valid_from: "", valid_to: "", valid_days: [] as number[], valid_start_time: "", valid_end_time: "",
});

function ItemManager({ clubId, items: allItems, loading, onQrLabels }: { clubId: string; items: BarItem[]; loading: boolean; onQrLabels?: (itemId?: string) => void }) {
  const { format: money } = useClubCurrency();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editItem, setEditItem] = useState<BarItem | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [barcodeScanOpen, setBarcodeScanOpen] = useState(false);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { data: customCategories = [] } = useBarCategories(clubId);
  const { divisions } = useBarDivisions(clubId);
  const [form, setForm] = useState(emptyForm());
  const [components, setComponents] = useState<ComponentLine[]>([]);
  const items = allItems.filter(i => showArchived || !i.archived_at);
  const liveItems = allItems.filter(i => !i.archived_at);
  const stockItems = liveItems.filter(i => (i.item_kind || "stock") === "stock");
  const formCategories = categoriesForDivision(customCategories, form.division);
  const yieldN = Math.max(1, parseInt(form.unit_yield) || 1);

  const { data: allComponents = [] } = useQuery({
    queryKey: ["bar-special-components", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_special_components").select("special_item_id, component_item_id, quantity").eq("club_id", clubId);
      if (error) throw error;
      return data as SpecialComponent[];
    },
  });

  const resetForm = () => {
    const div = divisions[0]?.key || "bar";
    setForm(emptyForm(div, categoriesForDivision(customCategories, div)[0]?.value || "other"));
    setComponents([]);
  };

  const openEdit = (item: BarItem) => {
    setEditItem(item);
    const y = Math.max(1, item.unit_yield || 1);
    const { whole, open } = splitUnits(item.stock_units ?? item.stock_qty, y);
    setForm({
      ...emptyForm(item.division || "bar", item.category),
      name: item.name, price: String(item.price), image_url: item.image_url || "",
      low_stock_threshold: String(item.low_stock_threshold), cost_price: item.cost_price ? String(item.cost_price) : "",
      opening_stock: String(whole), open_units: String(open), barcode: item.barcode ?? "",
      item_kind: (item.item_kind || "stock") as ItemKind, unit_yield: String(y),
      unit_label: item.unit_label || "tot", stock_unit_label: item.stock_unit_label || "bottle",
      stock_measure: ((item as { stock_measure?: string }).stock_measure as "count" | "bottle" | "volume") || (y > 1 ? "bottle" : "count"),
      opening_litres: String((item.stock_units ?? 0) / y),
      sellable: item.sellable !== false, product_group: item.product_group || "", variant_label: item.variant_label || "",
      stock_parent_id: item.stock_parent_id || "", consume_units: String(item.consume_units || 1),
      valid_from: item.valid_from || "", valid_to: item.valid_to || "", valid_days: item.valid_days || [],
      valid_start_time: (item.valid_start_time || "").slice(0, 5), valid_end_time: (item.valid_end_time || "").slice(0, 5),
    });
    setComponents(allComponents.filter(c => c.special_item_id === item.id)
      .map(c => ({ component_item_id: c.component_item_id, quantity: String(c.quantity) })));
  };

  const buildPayload = () => {
    const base: Record<string, unknown> = {
      name: form.name.trim(), price: parseFloat(form.price) || 0, category: form.category, division: form.division,
      image_url: form.image_url.trim() || null, low_stock_threshold: parseInt(form.low_stock_threshold) || 0,
      cost_price: parseFloat(form.cost_price) || 0, barcode: form.barcode.trim() || null,
      item_kind: form.item_kind, product_group: form.product_group.trim() || null, variant_label: form.variant_label.trim() || null,
      stock_parent_id: null, consume_units: 1, unit_yield: 1, sellable: true,
      valid_from: null, valid_to: null, valid_days: null, valid_start_time: null, valid_end_time: null,
    };
    if (form.item_kind === "stock") {
      Object.assign(base, {
        unit_yield: yieldN, sellable: form.sellable,
        unit_label: yieldN > 1 ? form.unit_label.trim() || "tot" : null,
        stock_unit_label: yieldN > 1 ? form.stock_unit_label.trim() || "bottle" : null,
        stock_measure: form.stock_measure === "volume" ? "volume" : yieldN > 1 ? "bottle" : "count",
        stock_units: form.stock_measure === "volume"
          ? Math.max(0, Math.round((parseFloat(form.opening_litres) || 0) * yieldN))
          : (parseInt(form.opening_stock) || 0) * yieldN + (yieldN > 1 ? Math.min(yieldN - 1, parseInt(form.open_units) || 0) : 0),
      });
    } else if (form.item_kind === "option") {
      Object.assign(base, { stock_parent_id: form.stock_parent_id || null, consume_units: Math.max(1, parseInt(form.consume_units) || 1) });
    } else {
      Object.assign(base, {
        valid_from: form.valid_from || null, valid_to: form.valid_to || null,
        valid_days: form.valid_days.length ? form.valid_days : null,
        valid_start_time: form.valid_start_time || null, valid_end_time: form.valid_end_time || null,
      });
    }
    return base;
  };

  const saveComponents = async (specialId: string) => {
    const wanted = components.filter(c => c.component_item_id && parseInt(c.quantity) > 0);
    const { error: delErr } = await fromExt("bar_special_components").delete().eq("special_item_id", specialId);
    if (delErr) throw delErr;
    if (wanted.length) {
      const merged = new Map<string, number>();
      wanted.forEach(c => merged.set(c.component_item_id, (merged.get(c.component_item_id) || 0) + parseInt(c.quantity)));
      const { error } = await fromExt("bar_special_components").insert(
        [...merged].map(([component_item_id, quantity]) => ({ club_id: clubId, special_item_id: specialId, component_item_id, quantity })),
      );
      if (error) throw error;
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Give the item a name");
    if (form.item_kind !== "stock" || form.sellable) { if (!form.price) return toast.error("Enter a selling price"); }
    if (form.item_kind === "option" && !form.stock_parent_id) return toast.error("Choose the stock product this option sells from");
    if (form.item_kind === "special" && !components.some(c => c.component_item_id && parseInt(c.quantity) > 0))
      return toast.error("Add at least one component to the special");
    try {
      const payload = buildPayload();
      let id = editItem?.id;
      if (editItem) {
        const { error } = await fromExt("bar_items").update(payload).eq("id", editItem.id);
        if (error) throw error;
      } else {
        const { data, error } = await fromExt("bar_items").insert({ ...payload, club_id: clubId, sort_order: allItems.length }).select("id").single();
        if (error) throw error;
        id = (data as any).id;
      }
      if (form.item_kind === "special" && id) await saveComponents(id);
      toast.success(editItem ? "Item updated" : "Item added");
      setAdding(false); setEditItem(null); resetForm();
      qc.invalidateQueries({ queryKey: ["bar-items"] });
      qc.invalidateQueries({ queryKey: ["bar-special-components", clubId] });
    } catch (e: any) {
      toast.error(e?.message || "Could not save item");
    }
  };

  /** Items with sales or purchase history can't be deleted — archive them instead. */
  const handleDelete = async (item: BarItem) => {
    if (!confirm(`Remove "${item.name}"? Items with sales history are archived instead so records stay intact.`)) return;
    const { error } = await fromExt("bar_items").delete().eq("id", item.id);
    if (!error) { toast.success("Item removed"); qc.invalidateQueries({ queryKey: ["bar-items"] }); return; }
    const { error: e2 } = await fromExt("bar_items").update({ archived_at: new Date().toISOString(), active: false }).eq("id", item.id);
    if (e2) toast.error(e2.message);
    else { toast.success("Item archived — its sales history is kept"); qc.invalidateQueries({ queryKey: ["bar-items"] }); }
  };

  const handleRestore = async (item: BarItem) => {
    const { error } = await fromExt("bar_items").update({ archived_at: null, active: true }).eq("id", item.id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["bar-items"] });
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    const { error } = await fromExt("bar_items").update({ active: !active }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["bar-items"] });
  };

  const byId = new Map(allItems.map(i => [i.id, i as unknown as InventoryItem]));
  // Special components come from the same division as the special — a Spirits
  // (bar) special must never offer shop products like racquets or shoes.
  const componentChoices = liveItems.filter(i => (i.item_kind || "stock") !== "special" && i.id !== editItem?.id
    && (i.division || "bar") === (form.division || "bar"));
  const specials = items.filter(i => i.item_kind === "special");

  /** Plain-language description of what one sale of a special consumes for a component line. */
  const componentHint = (componentId: string, qty: number): string => {
    const ci = byId.get(componentId);
    if (!ci || qty <= 0) return "";
    const root = ci.stock_parent_id ? byId.get(ci.stock_parent_id) : ci;
    if (!root) return "";
    const units = qty * unitsPerSale(ci);
    const label = root.unit_label || "unit";
    const measure = (root as { stock_measure?: string }).stock_measure;
    if (measure === "volume") {
      const serv = ci.item_kind === "option" ? ` (${qty} serving${qty > 1 ? "s" : ""})` : "";
      return `Uses ${units} ml = ${(units / 1000).toFixed(2)} L of ${root.name}${serv}`;
    }
    if ((root.unit_yield || 1) > 1) {
      const warn = ci.item_kind !== "option" ? " — whole bottles; pick the Single option to count tots" : "";
      return `Uses ${units} ${label}${units > 1 ? "s" : ""} of ${root.name} (${root.unit_yield} per ${root.stock_unit_label || "bottle"})${warn}`;
    }
    return `Uses ${units} × ${root.name}`;
  };
  const recipeSummary = (specialId: string) =>
    allComponents.filter(c => c.special_item_id === specialId)
      .map(c => componentHint(c.component_item_id, c.quantity).replace(/^Uses /, "").replace(/ —.*$/, ""))
      .filter(Boolean).join(" + ") || "No components yet";

  const itemForm = (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">What is this?</Label>
        <Select value={form.item_kind} onValueChange={v => setForm(p => ({ ...p, item_kind: v as ItemKind }))} disabled={!!editItem}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="stock">Product — holds stock (beer, Buddy, balls, shoes, a spirit bottle)</SelectItem>
            <SelectItem value="option">Selling option — sold from a product's stock (Single / Double tot)</SelectItem>
            <SelectItem value="special">Special / combo — a bundle of products at one price</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Name</Label>
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder={form.item_kind === "special" ? "e.g. Friday Night Special" : form.item_kind === "option" ? "e.g. Klipdrift · Double" : "e.g. Castle Lite"} />
        </div>
        <div>
          <Label className="text-xs">Sell price (R){form.item_kind === "stock" && !form.sellable ? " — not sold directly" : ""}</Label>
          <Input type="number" min={0} step={0.5} value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0.00" />
        </div>
        <div>
          <Label className="text-xs">Division</Label>
          <Select value={form.division} onValueChange={div => setForm(p => {
            const cats = categoriesForDivision(customCategories, div);
            return { ...p, division: div, category: cats.some(c => c.value === p.category) ? p.category : cats[0]?.value || "other" };
          })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{divisions.map(d => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
            <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{formCategories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {form.item_kind === "stock" && (
        <div className="rounded-md border p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">Sold by measure (e.g. spirits by the tot)</p>
              <p className="text-[11px] text-muted-foreground">Leave at 1 for items sold one-for-one.</p>
            </div>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => setForm(p => ({ ...p, stock_measure: "bottle", unit_yield: String(DEFAULT_TOTS_PER_BOTTLE), unit_label: "tot", stock_unit_label: "bottle", sellable: false }))}>
              Spirit (bottle → tots)
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => setForm(p => ({ ...p, stock_measure: "volume", unit_yield: "1000", unit_label: "ml", stock_unit_label: "litre", sellable: false }))}>
              Bulk mixer (litres)
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[11px]">Measures per {form.stock_unit_label || "unit"}</Label>
              <Input type="number" min={1} max={1000} value={form.unit_yield} onChange={e => setForm(p => ({ ...p, unit_yield: e.target.value }))} />
            </div>
            {yieldN > 1 && (
              <>
                <div>
                  <Label className="text-[11px]">Stock unit</Label>
                  <Input value={form.stock_unit_label} onChange={e => setForm(p => ({ ...p, stock_unit_label: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-[11px]">Measure</Label>
                  <Input value={form.unit_label} onChange={e => setForm(p => ({ ...p, unit_label: e.target.value }))} />
                </div>
              </>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Sell this product directly (e.g. by the whole {form.stock_unit_label || "item"})</Label>
            <Switch checked={form.sellable} onCheckedChange={v => setForm(p => ({ ...p, sellable: v }))} />
          </div>
          {yieldN > 1 && form.stock_measure !== "volume" && (
            <p className="text-[11px] text-muted-foreground">Set tots per bottle for this spirit (e.g. 28 or 30). After saving, add Single (1) / Double (2) as "Selling option" items.</p>
          )}
          {form.stock_measure === "volume" && (
            <p className="text-[11px] text-muted-foreground">Stock is kept in litres (any bottle size). After saving, add a "Selling option" such as Glass that uses e.g. 250 ml (= 4 servings per litre).</p>
          )}
        </div>
      )}

      {form.item_kind === "stock" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className={form.stock_measure === "volume" ? "hidden" : ""}>
            <Label className="text-xs">{editItem ? "Stock on hand" : "Opening stock"} ({yieldN > 1 ? `full ${form.stock_unit_label}s` : "units"})</Label>
            <Input type="number" min={0} value={form.opening_stock} onChange={e => setForm(p => ({ ...p, opening_stock: e.target.value }))} />
          </div>
          {form.stock_measure === "volume" ? (
            <div>
              <Label className="text-xs">Litres on hand (e.g. 5.5)</Label>
              <Input type="number" min={0} step={0.1} value={form.opening_litres} onChange={e => setForm(p => ({ ...p, opening_litres: e.target.value }))} />
            </div>
          ) : yieldN > 1 ? (
            <div>
              <Label className="text-xs">+ open {form.stock_unit_label} ({form.unit_label}s left, 0–{yieldN - 1})</Label>
              <Input type="number" min={0} max={yieldN - 1} value={form.open_units} onChange={e => setForm(p => ({ ...p, open_units: e.target.value }))} />
            </div>
          ) : (
            <div>
              <Label className="text-xs">Min stock level</Label>
              <Input type="number" min={0} value={form.low_stock_threshold} onChange={e => setForm(p => ({ ...p, low_stock_threshold: e.target.value }))} />
            </div>
          )}
          <div>
            <Label className="text-xs">Cost price per {yieldN > 1 ? form.stock_unit_label : "unit"} (R)</Label>
            <Input type="number" min={0} step={0.01} value={form.cost_price} onChange={e => setForm(p => ({ ...p, cost_price: e.target.value }))} placeholder="0.00" />
          </div>
          <div>
            <Label className="text-xs">Product barcode (optional)</Label>
            <div className="flex gap-1.5">
              <Input value={form.barcode} onChange={e => setForm(p => ({ ...p, barcode: e.target.value }))} inputMode="numeric" className="flex-1" />
              <Button type="button" variant="outline" size="icon" title="Scan barcode with camera" onClick={() => setBarcodeScanOpen(true)}>
                <ScanBarcode className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Variant of (optional)</Label>
            <Input value={form.product_group} onChange={e => setForm(p => ({ ...p, product_group: e.target.value }))} placeholder="e.g. Asics Gel Court Hunter" />
          </div>
          <div>
            <Label className="text-xs">Variant (size / model / colour)</Label>
            <Input value={form.variant_label} onChange={e => setForm(p => ({ ...p, variant_label: e.target.value }))} placeholder="e.g. UK 9" />
          </div>
        </div>
      )}

      {form.item_kind === "option" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-md border p-2.5">
          <div className="sm:col-span-3">
            <Label className="text-xs">Sells from product</Label>
            <Select value={form.stock_parent_id} onValueChange={v => {
              const parent = stockItems.find(i => i.id === v);
              setForm(p => ({ ...p, stock_parent_id: v, product_group: p.product_group || parent?.name.replace(/\s*\d+\s*ml$/i, "") || "",
                division: parent?.division || p.division, category: parent?.category || p.category }));
            }}>
              <SelectTrigger><SelectValue placeholder="Choose the stock product" /></SelectTrigger>
              <SelectContent>{stockItems.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Uses ({stockItems.find(i => i.id === form.stock_parent_id)?.unit_label || "units"})</Label>
            <Input type="number" min={1} value={form.consume_units} onChange={e => setForm(p => ({ ...p, consume_units: e.target.value }))} />
            {stockItems.find(i => i.id === form.stock_parent_id)?.unit_label === "ml" && (
              <p className="text-[10px] text-muted-foreground mt-0.5">= {(1000 / Math.max(1, parseInt(form.consume_units) || 1)).toFixed(1)} servings per litre</p>
            )}
          </div>
          <div>
            <Label className="text-xs">Button label</Label>
            <Input value={form.variant_label} onChange={e => setForm(p => ({ ...p, variant_label: e.target.value }))} placeholder="Single / Double" />
          </div>
          <div>
            <Label className="text-xs">Shown as</Label>
            <Input value={form.product_group} onChange={e => setForm(p => ({ ...p, product_group: e.target.value }))} placeholder="Klipdrift Brandy" />
          </div>
        </div>
      )}

      {form.item_kind === "special" && (
        <div className="space-y-2 rounded-md border p-2.5">
          <p className="text-xs font-medium">Components (stock is deducted from these when the special is sold)</p>
          <p className="text-[11px] text-muted-foreground">The special holds no stock of its own. For spirits pick the tot option (e.g. "Klipdrift · Single") and enter the number of tots; for mixers pick the glass/serving option or a can.</p>
          {components.map((c, idx) => (
            <div key={idx} className="space-y-0.5">
            <div className="grid grid-cols-[1fr_70px_32px] gap-2">
              <Select value={c.component_item_id} onValueChange={v => setComponents(prev => prev.map((x, i) => i === idx ? { ...x, component_item_id: v } : x))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Product or option" /></SelectTrigger>
                <SelectContent>{componentChoices.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" min={1} className="h-8 text-xs" aria-label="Quantity per sale" value={c.quantity} onChange={e => setComponents(prev => prev.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove component" onClick={() => setComponents(prev => prev.filter((_, i) => i !== idx))}><X className="w-3 h-3" /></Button>
            </div>
            {c.component_item_id && <p className="text-[10px] text-muted-foreground">{componentHint(c.component_item_id, parseInt(c.quantity) || 0)}</p>}
            </div>
          ))}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setComponents(prev => [...prev, { component_item_id: "", quantity: "1" }])}>
            <Plus className="w-3 h-3 mr-1" />Add component
          </Button>
          <p className="text-xs font-medium pt-2">When is it available? (leave blank for always)</p>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[11px]">From date</Label><Input type="date" value={form.valid_from} onChange={e => setForm(p => ({ ...p, valid_from: e.target.value }))} /></div>
            <div><Label className="text-[11px]">To date</Label><Input type="date" value={form.valid_to} onChange={e => setForm(p => ({ ...p, valid_to: e.target.value }))} /></div>
            <div><Label className="text-[11px]">From time</Label><Input type="time" value={form.valid_start_time} onChange={e => setForm(p => ({ ...p, valid_start_time: e.target.value }))} /></div>
            <div><Label className="text-[11px]">To time</Label><Input type="time" value={form.valid_end_time} onChange={e => setForm(p => ({ ...p, valid_end_time: e.target.value }))} /></div>
          </div>
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((d, i) => {
              const on = form.valid_days.includes(i);
              return (
                <Button key={d} type="button" size="sm" variant={on ? "default" : "outline"} className="h-7 px-2 text-xs"
                  onClick={() => setForm(p => ({ ...p, valid_days: on ? p.valid_days.filter(x => x !== i) : [...p.valid_days, i].sort() }))}>{d}</Button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs">Item image</Label>
        <ImageField value={form.image_url} onChange={(url) => setForm(p => ({ ...p, image_url: url }))} clubId={clubId} itemName={form.name} category={form.category} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave}>{editItem ? "Save Changes" : form.item_kind === "special" ? "Create special" : "Add Item"}</Button>
        <Button size="sm" variant="outline" onClick={() => { setAdding(false); setEditItem(null); resetForm(); }}>Cancel</Button>
      </div>
      <ProductScanDialog open={barcodeScanOpen} onOpenChange={setBarcodeScanOpen} items={liveItems} onItem={() => {}}
        onCode={(code) => { setForm(p => ({ ...p, barcode: code })); toast.success(`Barcode ${code} captured`); }} />
    </div>
  );

  const kindBadge = (i: BarItem) => {
    const k = i.item_kind || "stock";
    if (k === "special") return <Badge className="text-[10px]">Special · {validitySummary(i as unknown as InventoryItem)}</Badge>;
    if (k === "option") {
      const parent = byId.get(i.stock_parent_id || "");
      return <Badge variant="secondary" className="text-[10px]">{i.consume_units} {parent?.unit_label || "unit"}{(i.consume_units || 1) > 1 ? "s" : ""} of {parent?.name || "?"}</Badge>;
    }
    if (i.variant_label) return <Badge variant="secondary" className="text-[10px]">{i.variant_label}</Badge>;
    return null;
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Bar &amp; Shop Items ({liveItems.length})</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCatManagerOpen(true)}>
            <Package className="w-3.5 h-3.5 mr-1" />Divisions &amp; categories
          </Button>
          {onQrLabels && (
            <Button size="sm" variant="outline" onClick={() => onQrLabels()}>
              <QrCode className="w-3.5 h-3.5 mr-1" />Product QR labels
            </Button>
          )}
          {!adding && !editItem && (
            <Button size="sm" variant="outline" onClick={() => { setAdding(true); resetForm(); }}>
              <Plus className="w-3.5 h-3.5 mr-1" />Add Item
            </Button>
          )}
          {!adding && !editItem && (
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="w-3.5 h-3.5 mr-1" />Import Items
            </Button>
          )}
          {!adding && !editItem && (
            <Button size="sm" onClick={() => {
              resetForm();
              setForm(p => ({ ...p, item_kind: "special" }));
              setComponents([{ component_item_id: "", quantity: "1" }]);
              setAdding(true);
            }}>
              <Plus className="w-3.5 h-3.5 mr-1" />Add Special / Bundle
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={showArchived} onCheckedChange={setShowArchived} className="scale-75" /> Show archived items
      </div>

      <ImportItemsDialog clubId={clubId} open={importOpen} onOpenChange={setImportOpen} existing={allItems as any} />

      <CategoryManagerDialog
        clubId={clubId}
        open={catManagerOpen}
        onOpenChange={setCatManagerOpen}
        usedCategories={new Set(liveItems.map(i => i.category))}
        usedDivisions={new Set(allItems.map(i => i.division || "bar"))}
      />

      <Dialog open={!!adding || !!editItem} onOpenChange={(v) => { if (!v) { setAdding(false); setEditItem(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.item_kind === "special" ? (editItem ? "Edit special / bundle" : "Add special / bundle") : editItem ? "Edit item" : "Add item"}</DialogTitle></DialogHeader>
          {itemForm}
        </DialogContent>
      </Dialog>

      <div className="space-y-1.5 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">⭐ Specials &amp; bundles ({specials.filter(s => !s.archived_at).length})</p>
          <p className="text-[11px] text-muted-foreground">No stock of their own — each sale uses the recipe below</p>
        </div>
        {specials.length === 0 && <p className="text-xs text-muted-foreground">No specials yet — use "Add Special / Bundle" above.</p>}
        {specials.map(s => (
          <div key={s.id} className="flex items-start sm:items-center gap-2 rounded-md border p-2">
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${!s.active ? "line-through text-muted-foreground" : ""}`}>{s.name}{s.archived_at ? " (archived)" : ""} · {money(s.price)}</div>
              <div className="text-[11px] text-muted-foreground">{recipeSummary(s.id)}</div>
              <div className="text-[10px] text-muted-foreground">{s.active ? "Active" : "Inactive"} · {validitySummary(s as unknown as InventoryItem)}</div>
            </div>
            {!s.archived_at && (
              <div className="flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit special" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Switch checked={s.active} onCheckedChange={() => handleToggleActive(s.id, s.active)} className="scale-75" aria-label="Active" />
              </div>
            )}
          </div>
        ))}
      </div>

      {divisions.map(div => {
        const divItems = items.filter(i => (i.division || "bar") === div.key);
        if (divItems.length === 0) return null;
        const cats = categoriesForDivision(customCategories, div.key);
        const known = new Set(cats.map(c => c.value));
        const groups = [
          ...cats.map(c => ({ value: c.value, label: c.label, list: divItems.filter(i => i.category === c.value) })),
          { value: "_other", label: "Other / archived categories", list: divItems.filter(i => !known.has(i.category)) },
        ].filter(g => g.list.length > 0);
        return (
          <div key={div.key} className="space-y-3">
            <h4 className="text-sm font-semibold border-b pb-1">{div.label}</h4>
            {groups.map(g => (
              <div key={g.value} className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{BAR_CATEGORY_EMOJI[g.value] || "📦"} {g.label}</p>
                {g.list.map(item => {
                  const kind = item.item_kind || "stock";
                  const isLowStock = kind === "stock" && item.stock_qty > 0 && item.stock_qty <= item.low_stock_threshold;
                  const isOutOfStock = item.stock_qty <= 0;
                  return (
                    <div key={item.id} className="flex items-start sm:items-center gap-2 sm:gap-3 rounded-lg border p-2.5">
                      <div className="w-8 h-8 rounded overflow-hidden bg-muted flex items-center justify-center shrink-0">
                        {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                          : <span className="text-sm">{kind === "special" ? "⭐" : BAR_CATEGORY_EMOJI[item.category] || "📦"}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${!item.active ? "line-through text-muted-foreground" : ""}`}>
                          {item.name}{item.archived_at ? " (archived)" : ""}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          {(kind !== "stock" || item.sellable !== false)
                            ? <span className="text-xs text-muted-foreground">{money(item.price)}</span>
                            : <span className="text-xs text-muted-foreground">Sold via options only</span>}
                          {item.cost_price > 0 && <span className="text-xs text-muted-foreground">(cost {money(item.cost_price)})</span>}
                          {kindBadge(item)}
                          {isOutOfStock ? (
                            <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertTriangle className="w-3 h-3" /> {kind === "stock" ? "Out" : "Unavailable"}</Badge>
                          ) : kind === "stock" ? (
                            <Badge variant={isLowStock ? "secondary" : "outline"} className="text-[10px]">
                              {isLowStock && <AlertTriangle className="w-3 h-3 mr-0.5" />}{formatStock(item as unknown as InventoryItem)} in stock
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">{item.stock_qty} can be sold</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {onQrLabels && !item.archived_at && (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onQrLabels(item.id)}>
                            <QrCode className="w-3.5 h-3.5 mr-1" /> QR
                          </Button>
                        )}
                        {item.archived_at ? (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => handleRestore(item)}>Restore</Button>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit item" onClick={() => openEdit(item)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Switch checked={item.active} onCheckedChange={() => handleToggleActive(item.id, item.active)} className="scale-75" />
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remove or archive" onClick={() => handleDelete(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
      {items.filter(i => !divisions.some(d => d.key === (i.division || "bar"))).length > 0 && (
        <p className="text-xs text-muted-foreground">
          Some items belong to an archived division — restore the division under "Divisions &amp; categories" to see them.
        </p>
      )}
      {liveItems.length === 0 && !loading && <p className="text-sm text-muted-foreground">No items yet — add your first item above.</p>}
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
  const { format: money } = useClubCurrency();
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
    const qty = parseFloat(l.quantity) || 0;
    const cost = parseFloat(l.unit_cost) || 0;
    return sum + qty * cost;
  }, 0);

  const handleSubmit = async () => {
    const validLines = lines.filter(l => l.bar_item_id && parseFloat(l.quantity) > 0);
    if (validLines.length === 0) { toast.error("Add at least one item line"); return; }

    setSubmitting(true);
    try {
      const supplierNote = [
        supplier ? `Supplier: ${supplier}` : null,
        invoiceNumber ? `Inv #${invoiceNumber}` : null,
        paymentMethod ? `Paid: ${paymentMethod}` : null,
      ].filter(Boolean).join(" | ");

      const purchases = validLines.map(l => {
        const it = items.find(i => i.id === l.bar_item_id) as (BarItem & { stock_measure?: string }) | undefined;
        const isVol = it?.stock_measure === "volume";
        const q = parseFloat(l.quantity) || 0;
        return {
        club_id: clubId,
        bar_item_id: l.bar_item_id,
        quantity: isVol ? Math.max(1, Math.ceil(q)) : parseInt(l.quantity),
        quantity_units: isVol ? Math.max(1, Math.round(q * Math.max(1, it?.unit_yield || 1000))) : null,
        unit_cost: parseFloat(l.unit_cost) || 0,
        total_cost: q * (parseFloat(l.unit_cost) || 0),
        supplier: supplier.trim() || null,
        supplier_note: supplierNote || null,
        invoice_number: invoiceNumber.trim() || null,
        invoice_date: invoiceDate,
        payment_method: paymentMethod,
      }; });

      const { error } = await fromExt("bar_stock_purchases").insert(purchases);
      if (error) throw error;

      toast.success(`Invoice recorded — ${money(invoiceTotal)} across ${validLines.length} item(s)`);
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
                            {items.filter(i => !i.archived_at && (i.item_kind || "stock") === "stock").map(i => (
                              <SelectItem key={i.id} value={i.id}>{i.name}{(i as { stock_measure?: string }).stock_measure === "volume" ? " (litres)" : (i.unit_yield || 1) > 1 ? ` (per ${i.stock_unit_label || "bottle"})` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        {idx === 0 && <Label className="text-[10px] text-muted-foreground">Qty</Label>}
                        <Input
                          type="number" min={0.1} step="any" className="h-8 text-xs"
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
                        {money(lineTotal)}
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
              <span className="text-sm font-semibold">Invoice Total: {money(invoiceTotal)}</span>
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
  const { format: money } = useClubCurrency();
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
                {i.name} — {money(i.price)}
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
          Add Charge{selectedItem ? ` (${money(selectedItem.price * quantity)})` : ""}
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

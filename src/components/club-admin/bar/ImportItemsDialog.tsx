import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, Upload } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { useBarCategories, useBarDivisions } from "@/lib/bar-categories";
import {
  IMPORT_FIELDS, TEMPLATE_CSV, autoMap, parseCsv, planImport,
  type ExistingItem, type ImportField, type Mapping, type PlannedRow, type RowAction,
} from "@/lib/bar-import";

type Step = "upload" | "map" | "preview" | "done";
interface Result { created: number; updated: number; skipped: number; failed: { row: number; name: string; error: string }[] }

const NONE = "__none";

export function ImportItemsDialog({ clubId, open, onOpenChange, existing }: {
  clubId: string; open: boolean; onOpenChange: (v: boolean) => void; existing: ExistingItem[];
}) {
  const qc = useQueryClient();
  const { data: customCategories = [] } = useBarCategories(clubId);
  const { divisions } = useBarDivisions(clubId);
  const { data: settings } = useQuery({
    queryKey: ["bar-costing-settings", clubId],
    enabled: open,
    queryFn: async () => (await fromExt("club_bar_settings").select("*").eq("club_id", clubId).maybeSingle()).data as any,
  });
  const costing = !!settings?.costing_enabled;

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [overrides, setOverrides] = useState<Record<number, RowAction>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const reset = () => { setStep("upload"); setFileName(""); setHeaders([]); setRows([]); setMapping({}); setOverrides({}); setResult(null); };
  const close = (v: boolean) => { if (!busy) { onOpenChange(v); if (!v) reset(); } };

  const plan = useMemo<PlannedRow[]>(() => step === "preview" || step === "done"
    ? planImport(rows, mapping, { existing, divisions, customCategories }).map(p => ({ ...p, action: p.errors.length ? "skip" : overrides[p.row] ?? p.action }))
    : [], [step, rows, mapping, existing, divisions, customCategories, overrides]);

  const counts = plan.reduce((a, p) => ({ ...a, [p.action]: a[p.action] + 1, errors: a.errors + (p.errors.length ? 1 : 0) }),
    { create: 0, update: 0, skip: 0, errors: 0 });

  const onFile = async (f: File) => {
    try {
      let table: string[][];
      if (/\.xlsx$/i.test(f.name)) {
        const { default: readXlsx } = await import("read-excel-file");
        const data = await readXlsx(f);
        table = data.map(r => r.map(c => (c == null ? "" : String(c).trim()))).filter(r => r.some(Boolean));
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        table = parseCsv(await f.text());
      } else return toast.error("Use a CSV or Excel (.xlsx) file");
      if (table.length < 2) return toast.error("The file needs a header row and at least one item");
      if (table.length > 1001) return toast.error("Import up to 1000 items at a time");
      const width = Math.max(...table.map(r => r.length));
      setFileName(f.name);
      setHeaders(table[0].map((h, i) => h || `Column ${i + 1}`).concat(Array(Math.max(0, width - table[0].length)).fill("").map((_, i) => `Column ${table[0].length + i + 1}`)));
      setRows(table.slice(1));
      setMapping(autoMap(table[0]));
      setStep("map");
    } catch (e: any) {
      toast.error(e?.message || "Could not read that file");
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "bar-items-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  /** Execute the approved plan. Every write is scoped to this club. */
  const runImport = async () => {
    setBusy(true);
    const res: Result = { created: 0, updated: 0, skipped: 0, failed: [] };
    try {
      // 1. Create only the new categories that approved rows actually use.
      const cats = new Map<string, { value: string; label: string; division: string }>();
      plan.filter(p => p.action !== "skip" && p.newCategory).forEach(p => cats.set(`${p.newCategory!.division}|${p.newCategory!.value}`, p.newCategory!));
      for (const c of cats.values()) {
        const { error } = await fromExt("club_bar_categories").insert({ club_id: clubId, division: c.division, label: c.label, value: c.value, sort_order: 0 });
        if (error && !/duplicate/i.test(error.message)) throw new Error(`Category "${c.label}": ${error.message}`);
      }

      const { data: opts } = await fromExt("bar_items").select("id, stock_parent_id, consume_units").eq("club_id", clubId).eq("item_kind", "option").is("archived_at", null);
      let sort = existing.length;

      const upsertOption = async (parentId: string, parentName: string, label: string, units: number, price: number, p: PlannedRow) => {
        const found = (opts as any[] || []).find(o => o.stock_parent_id === parentId && o.consume_units === units);
        if (found) {
          const { error } = await fromExt("bar_items").update({ price }).eq("id", found.id).eq("club_id", clubId);
          if (error) throw error;
        } else {
          const { error } = await fromExt("bar_items").insert({
            club_id: clubId, name: `${parentName} · ${label}`, price, category: p.category, division: p.division,
            item_kind: "option", stock_parent_id: parentId, consume_units: units, unit_yield: 1, sellable: true,
            low_stock_threshold: 0, sort_order: sort++,
          });
          if (error) throw error;
        }
      };

      for (const p of plan) {
        if (p.action === "skip") { res.skipped++; continue; }
        try {
          let id = p.matchId;
          if (p.action === "create") {
            const payload: Record<string, unknown> = {
              club_id: clubId, name: p.name, price: p.price ?? 0, category: p.category, division: p.division,
              item_kind: "stock", unit_yield: p.yield, sellable: p.type === "unit" || p.price != null,
              unit_label: p.type === "bottle" ? "tot" : p.type === "litre" ? "ml" : null,
              stock_unit_label: p.type === "bottle" ? "bottle" : p.type === "litre" ? "litre" : null,
              stock_measure: p.type === "litre" ? "volume" : p.type === "bottle" ? "bottle" : "count",
              stock_units: p.stockUnits ?? 0, cost_price: p.cost ?? 0, low_stock_threshold: p.lowStock ?? 5,
              barcode: p.barcode, product_group: p.productGroup, variant_label: p.variant, sort_order: sort++,
            };
            const { data, error } = await fromExt("bar_items").insert(payload).select("id").single();
            if (error) throw error;
            id = (data as any).id;
          } else {
            const upd: Record<string, unknown> = {};
            if (p.price != null) upd.price = p.price;
            if (mapping.category != null) upd.category = p.category;
            if (mapping.division != null) upd.division = p.division;
            if (p.cost != null) upd.cost_price = p.cost;
            if (p.lowStock != null) upd.low_stock_threshold = p.lowStock;
            if (p.barcode) upd.barcode = p.barcode;
            if (p.productGroup) upd.product_group = p.productGroup;
            if (Object.keys(upd).length) {
              const { error } = await fromExt("bar_items").update(upd).eq("id", id!).eq("club_id", clubId);
              if (error) throw error;
            }
          }
          if (p.type === "bottle") {
            if (p.singlePrice != null) await upsertOption(id!, p.name, "Single", 1, p.singlePrice, p);
            if (p.doublePrice != null) await upsertOption(id!, p.name, "Double", 2, p.doublePrice, p);
          }
          if (p.type === "litre" && p.servingMl && p.servingPrice != null)
            await upsertOption(id!, p.name, `Glass (${p.servingMl}ml)`, Math.round(p.servingMl), p.servingPrice, p);
          const existingAvg = existing.find(e => e.id === id)?.avg_unit_cost;
          if (costing && p.cost != null && (p.action === "create" || existingAvg == null)) {
            const { error } = await fromExt("bar_items").select("id").limit(0); void error;
            const { error: cErr } = await (await import("@/integrations/supabase/client")).supabase
              .rpc("bar_set_average_cost" as any, { _item: id, _cost_per_purchase_unit: p.cost, _note: "Opening cost from item import" });
            if (cErr) throw new Error(`saved, but opening cost not set: ${cErr.message}`);
          }
          p.action === "create" ? res.created++ : res.updated++;
        } catch (e: any) {
          res.failed.push({ row: p.row, name: p.name, error: e?.message || "Failed" });
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Import stopped");
    } finally {
      setBusy(false);
      setResult(res);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["bar-items"] });
      qc.invalidateQueries({ queryKey: ["club-bar-categories", clubId] });
      qc.invalidateQueries({ queryKey: ["bar-costing-items", clubId] });
    }
  };

  const typeLabel = (p: PlannedRow) => p.type === "bottle" ? `Spirit · ${p.yield} tots` : p.type === "litre" ? "Bulk mixer (litres)" : "Unit";
  const stockLabel = (p: PlannedRow) => p.stockUnits == null ? "—" : p.type === "bottle" ? `${(p.stockUnits / p.yield).toFixed(2)} btl` : p.type === "litre" ? `${(p.stockUnits / 1000).toFixed(2)} L` : String(p.stockUnits);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Import items {fileName && <span className="text-xs font-normal text-muted-foreground">· {fileName}</span>}</DialogTitle></DialogHeader>

        {step === "upload" && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground text-xs">
              Upload a CSV or Excel (.xlsx) list with one item per row and a header row. You'll match the columns, check every row and confirm before anything is saved.
              Spirits use stock type <b>bottle</b> (opening stock in bottles, 2.5 allowed) with tots per bottle and Single/Double prices; bulk mixers use <b>litre</b> with a serving size and price.
              Specials/combos are not imported — add them with "Add Special / Bundle".
            </p>
            <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer hover:bg-muted/40">
              <Upload className="w-6 h-6 text-muted-foreground" />
              <span className="font-medium">Choose file</span>
              <span className="text-xs text-muted-foreground">CSV or .xlsx, up to 1000 items</span>
              <input type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
            </label>
            <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="w-3.5 h-3.5 mr-1" />Download example template</Button>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Match your columns ({rows.length} rows found). Leave a field on "Not in file" if you don't have it.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {IMPORT_FIELDS.map(f => (
                <div key={f.key} className="flex items-center gap-2">
                  <div className="w-40 shrink-0">
                    <div className="text-xs font-medium">{f.label}</div>
                    {f.help && <div className="text-[10px] text-muted-foreground">{f.help}</div>}
                  </div>
                  <Select value={mapping[f.key] == null ? NONE : String(mapping[f.key])}
                    onValueChange={v => setMapping(m => { const n = { ...m }; if (v === NONE) delete n[f.key as ImportField]; else n[f.key as ImportField] = Number(v); return n; })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not in file</SelectItem>
                      {headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h}{rows[0]?.[i] ? ` — e.g. ${rows[0][i]}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={reset}>Back</Button>
              <Button size="sm" disabled={mapping.name == null} onClick={() => { setOverrides({}); setStep("preview"); }}>Check rows</Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge>{counts.create} new</Badge>
              <Badge variant="secondary">{counts.update} update existing</Badge>
              <Badge variant="outline">{counts.skip} skip</Badge>
              {counts.errors > 0 && <Badge variant="destructive">{counts.errors} with errors (will be skipped)</Badge>}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Nothing is saved yet. Existing items are matched by name (+ variant) or barcode in this club only. Updates change prices, category and cost price, never the stock count.
              {costing ? " Costing is on: cost becomes the opening average cost for new items." : " Costing is off: cost is saved as the item's cost price only."}
            </p>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left">
                  <tr><th className="p-1.5">Row</th><th className="p-1.5">Item</th><th className="p-1.5">Type</th><th className="p-1.5">Price</th><th className="p-1.5">Stock</th><th className="p-1.5">Cost</th><th className="p-1.5">Action</th></tr>
                </thead>
                <tbody>
                  {plan.map(p => (
                    <tr key={p.row} className={`border-t align-top ${p.errors.length ? "bg-destructive/5" : ""}`}>
                      <td className="p-1.5 text-muted-foreground">{p.row}</td>
                      <td className="p-1.5">
                        <div className="font-medium">{p.name || "—"}{p.variant ? ` · ${p.variant}` : ""}</div>
                        {p.matchName && <div className="text-[10px] text-muted-foreground">Matches existing "{p.matchName}"</div>}
                        {p.errors.map((e, i) => <div key={i} className="text-[10px] text-destructive">✕ {e}</div>)}
                        {p.warnings.map((w, i) => <div key={i} className="text-[10px] text-muted-foreground">⚠ {w}</div>)}
                      </td>
                      <td className="p-1.5 whitespace-nowrap">{typeLabel(p)}</td>
                      <td className="p-1.5 whitespace-nowrap">
                        {p.price != null && <div>{p.price}</div>}
                        {p.singlePrice != null && <div>Single {p.singlePrice}</div>}
                        {p.doublePrice != null && <div>Double {p.doublePrice}</div>}
                        {p.servingPrice != null && <div>{p.servingMl}ml {p.servingPrice}</div>}
                      </td>
                      <td className="p-1.5 whitespace-nowrap">{stockLabel(p)}</td>
                      <td className="p-1.5">{p.cost ?? "—"}</td>
                      <td className="p-1.5">
                        {p.errors.length ? <span className="text-destructive">Skip</span> : (
                          <Select value={p.action} onValueChange={v => setOverrides(o => ({ ...o, [p.row]: v as RowAction }))}>
                            <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {p.matchId ? <SelectItem value="update">Update</SelectItem> : <SelectItem value="create">Create</SelectItem>}
                              <SelectItem value="skip">Skip</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep("map")} disabled={busy}>Back</Button>
              <Button size="sm" disabled={busy || counts.create + counts.update === 0} onClick={runImport}>
                {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                Import {counts.create + counts.update} item{counts.create + counts.update === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>{result.created} created</Badge>
              <Badge variant="secondary">{result.updated} updated</Badge>
              <Badge variant="outline">{result.skipped} skipped</Badge>
              <Badge variant={result.failed.length ? "destructive" : "outline"}>{result.failed.length} failed</Badge>
            </div>
            {result.failed.map(f => <div key={f.row} className="text-xs text-destructive">Row {f.row} ({f.name}): {f.error}</div>)}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={reset}>Import another file</Button>
              <Button size="sm" onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

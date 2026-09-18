/**
 * Bar stock levels & stock takes.
 *
 * Shows what every product's stock was on a chosen date (worked back from
 * today's stock using sales and purchases since then), and lets bar staff run
 * a stock take for that date: download a count sheet, capture counted
 * quantities (typed in or uploaded), see the differences, and finalise —
 * optionally correcting stock on hand to the counted figures.
 */
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { useClubCurrency } from "@/hooks/use-currency";
import { ClipboardList, Download, Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface Level {
  bar_item_id: string;
  name: string;
  category: string | null;
  cost_price: number;
  price: number;
  current_qty: number;
  qty_on_date: number;
}

interface TakeLine {
  bar_item_id: string;
  expected_qty: number;
  counted_qty: number | null;
}

const today = () => format(new Date(), "yyyy-MM-dd");

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function StockLevelsTab({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { format: money } = useClubCurrency();
  const [date, setDate] = useState(today());
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: levels = [], isLoading } = useQuery({
    queryKey: ["bar-stock-levels", clubId, date],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_stock_levels_on", {
        _club_id: clubId, _date: date,
      } as any);
      if (error) throw error;
      return (data ?? []) as unknown as Level[];
    },
  });

  /** The draft stock take for this date, if one has been started. */
  const { data: take, refetch: refetchTake } = useQuery({
    queryKey: ["bar-stock-take", clubId, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bar_stock_takes" as any)
        .select("*, lines:bar_stock_take_lines(bar_item_id, expected_qty, counted_qty)")
        .eq("club_id", clubId)
        .eq("take_date", date)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data as any[])?.[0] ?? null) as any;
    },
  });

  const takeLines: TakeLine[] = take?.lines ?? [];
  const expectedFor = (id: string) =>
    takeLines.find((l) => l.bar_item_id === id)?.expected_qty ??
    levels.find((l) => l.bar_item_id === id)?.qty_on_date ?? 0;

  const rows = useMemo(
    () =>
      levels.map((l) => {
        const saved = takeLines.find((t) => t.bar_item_id === l.bar_item_id)?.counted_qty ?? null;
        const typed = counts[l.bar_item_id];
        const counted = typed !== undefined && typed !== "" ? Number(typed) : saved;
        const expected = expectedFor(l.bar_item_id);
        return {
          ...l,
          expected,
          counted: counted === null || Number.isNaN(counted as number) ? null : (counted as number),
          variance: counted === null || Number.isNaN(counted as number) ? null : (counted as number) - expected,
        };
      }),
    [levels, takeLines, counts],
  );

  const counted = rows.filter((r) => r.counted !== null);
  const deviations = counted.filter((r) => (r.variance ?? 0) !== 0);
  const varianceValue = deviations.reduce((s, r) => s + (r.variance ?? 0) * Number(r.cost_price || 0), 0);
  const finalised = take?.status === "finalised";

  async function startTake() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_stock_take_start", { _club_id: clubId, _date: date } as any);
      if (error) throw error;
      await refetchTake();
      toast.success(`Stock take prepared for ${format(new Date(date), "d MMM yyyy")}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not prepare the stock take");
    } finally {
      setBusy(false);
    }
  }

  async function saveCounts() {
    if (!take?.id) return;
    setBusy(true);
    try {
      const lines = rows
        .filter((r) => counts[r.bar_item_id] !== undefined)
        .map((r) => ({
          bar_item_id: r.bar_item_id,
          counted_qty: counts[r.bar_item_id] === "" ? null : Number(counts[r.bar_item_id]),
        }));
      const { error } = await supabase.rpc("bar_stock_take_save", {
        _take_id: take.id, _lines: lines, _notes: notes || null,
      } as any);
      if (error) throw error;
      setCounts({});
      await refetchTake();
      toast.success("Counted quantities saved");
    } catch (e: any) {
      toast.error(e.message ?? "Could not save the counts");
    } finally {
      setBusy(false);
    }
  }

  async function finalise(adjust: boolean) {
    if (!take?.id) return;
    setBusy(true);
    try {
      if (Object.keys(counts).length) await saveCounts();
      const { error } = await supabase.rpc("bar_stock_take_finalise", {
        _take_id: take.id, _adjust: adjust,
      } as any);
      if (error) throw error;
      await refetchTake();
      qc.invalidateQueries({ queryKey: ["bar-items"] });
      qc.invalidateQueries({ queryKey: ["bar-stock-levels"] });
      toast.success(adjust ? "Stock take finalised — stock corrected to the counted figures" : "Stock take finalised");
    } catch (e: any) {
      toast.error(e.message ?? "Could not finalise the stock take");
    } finally {
      setBusy(false);
    }
  }

  function downloadSheet() {
    const header = ["Item", "Category", "Expected qty", "Counted qty"];
    const body = rows.map((r) => [r.name, r.category ?? "", r.expected, r.counted ?? ""]);
    const csv = [header, ...body].map((line) => line.map(csvEscape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-count-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadVariances() {
    const header = ["Item", "Expected qty", "Counted qty", "Difference", "Value"];
    const body = deviations.map((r) => [
      r.name, r.expected, r.counted ?? "", r.variance ?? "",
      ((r.variance ?? 0) * Number(r.cost_price || 0)).toFixed(2),
    ]);
    const csv = [header, ...body].map((line) => line.map(csvEscape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-differences-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Read back a completed count sheet: match on item name, take the last column. */
  async function uploadSheet(file: File) {
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const byName = new Map(levels.map((l) => [l.name.trim().toLowerCase(), l.bar_item_id]));
      const next: Record<string, string> = {};
      let matched = 0;
      let unmatched = 0;
      for (const line of lines.slice(1)) {
        const cells = line.match(/("([^"]|"")*"|[^,]*)/g)?.filter((_, i) => i % 2 === 0) ?? [];
        const name = (cells[0] ?? "").replace(/^"|"$/g, "").replace(/""/g, '"').trim().toLowerCase();
        const raw = (cells[3] ?? "").replace(/[^0-9-]/g, "");
        if (!name || raw === "") continue;
        const id = byName.get(name);
        if (!id) { unmatched += 1; continue; }
        next[id] = String(Math.max(0, Number(raw)));
        matched += 1;
      }
      if (!matched) throw new Error("No matching product names found in that file");
      setCounts((c) => ({ ...c, ...next }));
      toast.success(`${matched} counted quantit${matched === 1 ? "y" : "ies"} read in${unmatched ? ` · ${unmatched} unknown product${unmatched === 1 ? "" : "s"} skipped` : ""}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not read that file");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Stock levels
          </h3>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Stock on hand for every product on the chosen date, worked back from today using sales and purchases
            since then. Prepare a stock take to capture what was actually counted and see the differences.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[11px]">Date</Label>
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="h-9" />
          </div>
          {!take ? (
            <Button className="h-9" disabled={busy || isLoading} onClick={startTake}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Prepare stock take"}
            </Button>
          ) : (
            <Badge variant={finalised ? "secondary" : "default"} className="h-9 px-3 flex items-center">
              {finalised ? "Finalised" : "Stock take in progress"}
            </Badge>
          )}
        </div>
      </Card>

      {take && !finalised && (
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={downloadSheet}>
            <Download className="w-3.5 h-3.5 mr-1" /> Download count sheet
          </Button>
          <input
            ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadSheet(e.target.files[0])}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Upload completed sheet
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" disabled={busy || !Object.keys(counts).length} onClick={saveCounts}>
            Save counts
          </Button>
          <Button size="sm" disabled={busy || counted.length === 0} onClick={() => finalise(true)}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Finalise &amp; correct stock
          </Button>
          <Button size="sm" variant="ghost" disabled={busy || counted.length === 0} onClick={() => finalise(false)}>
            Finalise without changing stock
          </Button>
        </Card>
      )}

      {take && deviations.length > 0 && (
        <Card className="p-3 space-y-2 border-amber-500/40">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              {deviations.length} difference{deviations.length === 1 ? "" : "s"} · {money(varianceValue, 2)} at cost
            </div>
            <Button size="sm" variant="outline" onClick={downloadVariances}>
              <Download className="w-3.5 h-3.5 mr-1" /> Download report
            </Button>
          </div>
          <div className="text-xs grid gap-1">
            {deviations.map((r) => (
              <div key={r.bar_item_id} className="flex justify-between gap-2">
                <span className="truncate">{r.name}</span>
                <span className={(r.variance ?? 0) < 0 ? "text-destructive" : "text-emerald-600"}>
                  expected {r.expected} · counted {r.counted} · {(r.variance ?? 0) > 0 ? "+" : ""}{r.variance}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 text-[11px] font-medium text-muted-foreground border-b">
          <span>Item</span>
          <span className="text-right w-16">On {format(new Date(date), "d MMM")}</span>
          <span className="text-right w-16">Now</span>
          <span className="text-right w-24">Counted</span>
          <span className="text-right w-20">Difference</span>
        </div>
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading stock levels…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No active bar products yet.</div>
        ) : (
          rows.map((r) => (
            <div key={r.bar_item_id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-1.5 text-xs items-center border-b last:border-0">
              <span className="truncate">{r.name}</span>
              <span className="text-right w-16 tabular-nums">{r.expected}</span>
              <span className="text-right w-16 tabular-nums text-muted-foreground">{r.current_qty}</span>
              <span className="w-24 text-right">
                {take && !finalised ? (
                  <Input
                    inputMode="numeric"
                    className="h-7 text-right text-xs"
                    value={counts[r.bar_item_id] ?? (r.counted !== null ? String(r.counted) : "")}
                    onChange={(e) =>
                      setCounts((c) => ({ ...c, [r.bar_item_id]: e.target.value.replace(/[^0-9]/g, "") }))
                    }
                  />
                ) : (
                  <span className="tabular-nums">{r.counted ?? "—"}</span>
                )}
              </span>
              <span
                className={`text-right w-20 tabular-nums ${
                  r.variance === null || r.variance === 0
                    ? "text-muted-foreground"
                    : r.variance < 0
                      ? "text-destructive"
                      : "text-emerald-600"
                }`}
              >
                {r.variance === null ? "—" : `${r.variance > 0 ? "+" : ""}${r.variance}`}
              </span>
            </div>
          ))
        )}
      </Card>

      {take && !finalised && (
        <Card className="p-3 space-y-1.5">
          <Label className="text-[11px]">Notes for this stock take</Label>
          <Textarea
            value={notes || take?.notes || ""}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. breakages, staff drinks, damaged stock written off"
            className="text-xs min-h-[60px]"
          />
        </Card>
      )}
    </div>
  );
}

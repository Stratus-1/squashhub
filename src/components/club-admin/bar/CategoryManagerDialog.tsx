/**
 * Club-configurable divisions and categories for the bar/shop.
 * Built-in categories can be renamed, moved, reordered or archived per club (stored as override rows).
 * Nothing referenced by items or history is hard-deleted: divisions/categories in use are archived.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Check, Pencil, Trash2 } from "lucide-react";
import {
  allCategories,
  categoryValueFromLabel,
  divisionKeyFromLabel,
  useBarCategories,
  useBarDivisions,
  BAR_DIVISIONS,
  BAR_CATEGORY_EMOJI,
  type BarCategory,
} from "@/lib/bar-categories";

interface Props {
  clubId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Category values / division keys currently used by items (in-use rows are archived, not deleted). */
  usedCategories: Set<string>;
  usedDivisions: Set<string>;
}

export function CategoryManagerDialog({ clubId, open, onOpenChange, usedCategories, usedDivisions }: Props) {
  const qc = useQueryClient();
  const { data: rows = [] } = useBarCategories(clubId);
  const { rows: divRows, divisions: allDivs } = useBarDivisions(clubId, true);
  const activeDivs = allDivs.filter(d => !d.archived);
  const cats = allCategories(rows, true);
  const [newDiv, setNewDiv] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newCatDiv, setNewCatDiv] = useState("bar");
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["club-bar-categories", clubId] });
    qc.invalidateQueries({ queryKey: ["club-bar-divisions", clubId] });
    qc.invalidateQueries({ queryKey: ["bar-items"] });
  };
  const fail = (e: any) => toast.error(e?.message || "Could not save");

  /** Divisions become club-owned rows the first time the club edits them. */
  const ensureDivisionRows = async () => {
    if (divRows.length > 0) return;
    const { error } = await fromExt("club_bar_divisions").insert(
      BAR_DIVISIONS.map(d => ({ club_id: clubId, key: d.key, label: d.label, sort_order: d.sort_order })),
    );
    if (error && !String(error.message).includes("duplicate")) throw error;
  };

  const saveDivision = async (key: string, patch: Record<string, unknown>) => {
    try {
      await ensureDivisionRows();
      const { error } = await fromExt("club_bar_divisions").update({ ...patch, updated_at: new Date().toISOString() })
        .eq("club_id", clubId).eq("key", key);
      if (error) throw error;
      refresh();
    } catch (e) { fail(e); }
  };

  const addDivision = async () => {
    const label = newDiv.trim();
    if (!label) return;
    try {
      await ensureDivisionRows();
      const { error } = await fromExt("club_bar_divisions").insert({
        club_id: clubId, key: divisionKeyFromLabel(label), label, sort_order: allDivs.length,
      });
      if (error) throw error;
      setNewDiv("");
      refresh();
    } catch (e: any) { fail(String(e?.message).includes("duplicate") ? { message: "That division already exists" } : e); }
  };

  const moveDivision = async (idx: number, dir: -1 | 1) => {
    const list = [...allDivs];
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    try {
      await ensureDivisionRows();
      for (let i = 0; i < list.length; i++) {
        await fromExt("club_bar_divisions").update({ sort_order: i }).eq("club_id", clubId).eq("key", list[i].key);
      }
      refresh();
    } catch (e) { fail(e); }
  };

  const removeDivision = async (key: string) => {
    if (usedDivisions.has(key) || cats.some(c => c.division === key && !c.archived)) {
      await saveDivision(key, { archived_at: new Date().toISOString() });
      toast.success("Division archived — its items and history are kept");
      return;
    }
    try {
      await ensureDivisionRows();
      const { error } = await fromExt("club_bar_divisions").delete().eq("club_id", clubId).eq("key", key);
      if (error) throw error;
      refresh();
    } catch (e) { fail(e); }
  };

  const toggleShop = async (archived: boolean) => {
    await saveDivision("shop", { archived_at: archived ? new Date().toISOString() : null });
  };

  /** Upsert a category row (built-in overrides share the built-in value). */
  const saveCategory = async (c: BarCategory, patch: Partial<{ label: string; division: string; sort_order: number; archived_at: string | null }>) => {
    const row = {
      club_id: clubId, value: c.value, label: patch.label ?? c.label, division: patch.division ?? c.division,
      sort_order: patch.sort_order ?? c.sort_order ?? 0,
      archived_at: patch.archived_at !== undefined ? patch.archived_at : (c.archived ? new Date().toISOString() : null),
    };
    const { error } = c.id
      ? await fromExt("club_bar_categories").update({ ...row, updated_at: new Date().toISOString() }).eq("id", c.id)
      : await fromExt("club_bar_categories").insert(row);
    if (error) return fail(error);
    // Moving a category to another division moves its items with it.
    if (patch.division && patch.division !== c.division) {
      const { error: e2 } = await fromExt("bar_items").update({ division: patch.division }).eq("club_id", clubId).eq("category", c.value);
      if (e2) return fail(e2);
    }
    refresh();
  };

  const addCategory = async () => {
    const label = newCat.trim();
    if (!label) return;
    const { error } = await fromExt("club_bar_categories").insert({
      club_id: clubId, division: newCatDiv, label, value: categoryValueFromLabel(label),
      sort_order: cats.filter(c => c.division === newCatDiv).length,
    });
    if (error) return fail(String(error.message).includes("duplicate") ? { message: "That category already exists" } : error);
    setNewCat("");
    refresh();
  };

  const moveCategory = async (list: BarCategory[], idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[idx], next[j]] = [next[j], next[idx]];
    for (let i = 0; i < next.length; i++) {
      if ((next[i].sort_order ?? -1) !== i || !next[i].id) await saveCategory(next[i], { sort_order: i });
    }
  };

  const removeCategory = async (c: BarCategory) => {
    if (usedCategories.has(c.value) || !c.custom || !c.id) {
      await saveCategory(c, { archived_at: new Date().toISOString() });
      toast.success(usedCategories.has(c.value) ? "Category archived — its items and history are kept" : "Category hidden");
      return;
    }
    const { error } = await fromExt("club_bar_categories").delete().eq("id", c.id);
    if (error) return fail(error);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Divisions &amp; categories</DialogTitle></DialogHeader>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Divisions</h4>
          <p className="text-xs text-muted-foreground">The top-level tabs on the POS (e.g. Bar, Shop). Divisions in use are archived rather than deleted.</p>
          {allDivs.some(d => d.key === "shop") && (
            <div className="flex items-center justify-between gap-2 rounded-md border p-2">
              <span className="text-sm">Show Shop on the menu</span>
              <Button size="sm" variant="outline" aria-pressed={!allDivs.find(d => d.key === "shop")?.archived}
                onClick={() => toggleShop(!allDivs.find(d => d.key === "shop")?.archived)}>
                {allDivs.find(d => d.key === "shop")?.archived ? "Show Shop" : "Hide Shop"}
              </Button>
            </div>
          )}
          {allDivs.map((d, idx) => (
            <div key={d.key} className="flex items-center gap-1.5 rounded-md border p-2">
              {editing === `d:${d.key}` ? (
                <>
                  <Input className="h-7 text-sm flex-1" value={editLabel} onChange={e => setEditLabel(e.target.value)} />
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Save" onClick={async () => { await saveDivision(d.key, { label: editLabel.trim() || d.label }); setEditing(null); }}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <span className={`text-sm flex-1 ${d.archived ? "line-through text-muted-foreground" : ""}`}>{d.label}</span>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move up" onClick={() => moveDivision(idx, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move down" onClick={() => moveDivision(idx, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Rename" onClick={() => { setEditing(`d:${d.key}`); setEditLabel(d.label); }}><Pencil className="w-3.5 h-3.5" /></Button>
              {d.archived ? (
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Restore" onClick={() => saveDivision(d.key, { archived_at: null })}><ArchiveRestore className="w-3.5 h-3.5" /></Button>
              ) : (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Archive or remove" onClick={() => removeDivision(d.key)}>
                  {usedDivisions.has(d.key) ? <Archive className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newDiv} onChange={e => setNewDiv(e.target.value)} placeholder="New division, e.g. Kitchen" className="h-8" />
            <Button size="sm" onClick={addDivision} disabled={!newDiv.trim()}>Add</Button>
          </div>
        </section>

        <section className="space-y-3 pt-2 border-t">
          <h4 className="text-sm font-semibold">Categories</h4>
          <div className="flex gap-2">
            <Input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="e.g. Premix / Hardtack" className="h-8 flex-1"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }} />
            <Select value={newCatDiv} onValueChange={setNewCatDiv}>
              <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{activeDivs.map(d => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" onClick={addCategory} disabled={!newCat.trim()}>Add</Button>
          </div>
          {allDivs.map(d => {
            const list = cats.filter(c => c.division === d.key);
            if (list.length === 0) return null;
            return (
              <div key={d.key} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{d.label}</p>
                {list.map((c, idx) => (
                  <div key={c.value} className="flex items-center gap-1.5 rounded-md border p-1.5">
                    {editing === `c:${c.value}` ? (
                      <>
                        <Input className="h-7 text-sm flex-1" value={editLabel} onChange={e => setEditLabel(e.target.value)} />
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Save" onClick={async () => { await saveCategory(c, { label: editLabel.trim() || c.label }); setEditing(null); }}>
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                       <span className={`text-sm flex-1 truncate ${c.archived ? "line-through text-muted-foreground" : ""}`}><span aria-hidden="true" className="mr-1.5">{BAR_CATEGORY_EMOJI[c.value] || "📦"}</span>{c.label}</span>
                    )}
                    {usedCategories.has(c.value) && <Badge variant="outline" className="text-[10px]">in use</Badge>}
                    <Select value={c.division} onValueChange={v => saveCategory(c, { division: v })}>
                      <SelectTrigger className="h-7 w-20 text-[11px]" aria-label="Move to division"><SelectValue /></SelectTrigger>
                      <SelectContent>{activeDivs.map(x => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move up" onClick={() => moveCategory(list, idx, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move down" onClick={() => moveCategory(list, idx, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Rename" onClick={() => { setEditing(`c:${c.value}`); setEditLabel(c.label); }}><Pencil className="w-3.5 h-3.5" /></Button>
                    {c.archived ? (
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Restore" onClick={() => saveCategory(c, { archived_at: null })}><ArchiveRestore className="w-3.5 h-3.5" /></Button>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Archive or remove" onClick={() => removeCategory(c)}>
                        {usedCategories.has(c.value) || !c.custom ? <Archive className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState, type ComponentType } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { applyOrder, type MenuPrefs } from "@/lib/menu-order";

export type EditableMenuItem = { id: string; label: string; icon?: ComponentType<{ className?: string }> };
export type EditableMenuGroup = { key: string; label: string; items: EditableMenuItem[] };

function Row({ item, index, count, locked, onMove, onHide }: {
  item: EditableMenuItem; index: number; count: number; locked: boolean;
  onMove: (dir: -1 | 1) => void; onHide: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const Icon = item.icon;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-md border bg-card px-1 py-1 ${isDragging ? "z-10 shadow-md" : ""}`}>
      <button type="button" {...attributes} {...listeners} aria-label={`Drag ${item.label}`}
        className="flex size-9 shrink-0 touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <GripVertical className="size-4" />
      </button>
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
      <Button type="button" variant="ghost" size="icon" className="size-9" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${item.label} up`}><ArrowUp className="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" className="size-9" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${item.label} down`}><ArrowDown className="size-4" /></Button>
      {locked
        ? <span className="flex size-9 items-center justify-center text-muted-foreground" title="Always shown" aria-label={`${item.label} is always shown`}><Lock className="size-3.5" /></span>
        : <Button type="button" variant="ghost" size="icon" className="size-9" onClick={onHide} aria-label={`Hide ${item.label}`}><Eye className="size-4" /></Button>}
    </li>
  );
}

/** Lets a user reorder and hide their OWN visible menu items. Display only. */
export function MenuOrderEditor({ open, onOpenChange, title = "Edit menu", groups, prefs, locked = [], onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; title?: string;
  groups: EditableMenuGroup[]; prefs: MenuPrefs; locked?: string[];
  onSave: (prefs: MenuPrefs | null) => Promise<unknown>;
}) {
  const [order, setOrder] = useState<Record<string, string[]>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
  const reset = (p: MenuPrefs) => {
    const o: Record<string, string[]> = {};
    groups.forEach((g) => { o[g.key] = applyOrder(g.items, p.groups[g.key], (i) => i.id).map((i) => i.id); });
    setOrder(o);
    setHidden(p.hidden.filter((h) => allIds.includes(h) && !locked.includes(h)));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) reset(prefs); }, [open]);

  const find = (id: string) => groups.flatMap((g) => g.items).find((i) => i.id === id)!;
  const shown = (key: string) => (order[key] ?? []).filter((id) => !hidden.includes(id));
  const move = (key: string, from: string, to: string) => setOrder((o) => {
    const list = o[key] ?? []; return { ...o, [key]: arrayMove(list, list.indexOf(from), list.indexOf(to)) };
  });
  const onDragEnd = (key: string) => (e: DragEndEvent) => { if (e.over && e.active.id !== e.over.id) move(key, String(e.active.id), String(e.over.id)); };

  const save = async () => {
    setSaving(true);
    try {
      // Keep hidden state for items not visible right now (e.g. a module switched off).
      const keepHidden = prefs.hidden.filter((h) => !allIds.includes(h));
      await onSave({ groups: { ...prefs.groups, ...order }, hidden: [...new Set([...hidden, ...keepHidden])] });
      toast.success("Menu saved"); onOpenChange(false);
    } catch { toast.error("Could not save your menu. Please try again."); } finally { setSaving(false); }
  };
  const resetDefault = async () => {
    setSaving(true);
    try { await onSave(null); toast.success("Menu reset to default"); onOpenChange(false); }
    catch { toast.error("Could not reset your menu. Please try again."); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Drag items, or use the arrows, to change the order. Use the eye button to hide an item. This only changes your own menu.</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
          {groups.map((g) => {
            const ids = shown(g.key);
            if (!ids.length) return null;
            return (
              <section key={g.key} aria-label={g.label}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
                <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd(g.key)}>
                  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-1">
                      {ids.map((id, i) => (
                        <Row key={id} item={find(id)} index={i} count={ids.length} locked={locked.includes(id)}
                          onMove={(d) => move(g.key, id, ids[i + d])} onHide={() => setHidden((h) => [...h, id])} />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              </section>
            );
          })}
          <section aria-label="Hidden items">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hidden items</h3>
            {hidden.length === 0 ? <p className="text-xs text-muted-foreground">No hidden items.</p> : (
              <ul className="space-y-1">
                {hidden.map((id) => { const it = find(id); const Icon = it.icon; return (
                  <li key={id} className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1">
                    {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{it.label}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setHidden((h) => h.filter((x) => x !== id))} aria-label={`Show ${it.label}`}>
                      <EyeOff className="mr-1 size-4" />Show
                    </Button>
                  </li>); })}
              </ul>
            )}
          </section>
        </div>
        <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={resetDefault} disabled={saving}>Reset to default</Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={save} disabled={saving}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

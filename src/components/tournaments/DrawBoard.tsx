/**
 * Visual draw board — the manual seeding surface.
 *
 * The engine proposes the bracket; the organiser drags players between slots,
 * empties a slot to hand out a bye, and only then confirms. Nothing here talks
 * to the database: it renders a `DrawBoard` model and reports edits upwards.
 */
import { useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, GripVertical, RotateCcw, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  benchedEntrants,
  clearSlot,
  drawSlots,
  moveEntrant,
  parseSlotKey,
  sectionLabelOf,
  slotKey,
  validateDrawBoard,
  type DrawBoard as DrawBoardModel,
  type DrawEntrant,
  type DrawSlotRef,
} from "@/lib/tournaments/draw-board";

interface Props {
  board: DrawBoardModel;
  entrants: DrawEntrant[];
  onChange: (next: DrawBoardModel) => void;
  onReset: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  readOnly?: boolean;
}

const BENCH_ID = "draw-bench";

function EntrantCard({ entrant, dragging }: { entrant: DrawEntrant; dragging?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1.5 min-w-0", dragging && "opacity-90")}>
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-[13px]">
        {entrant.name}
        {entrant.partnerName ? <span className="text-muted-foreground"> &amp; {entrant.partnerName}</span> : null}
      </span>
      {entrant.seed ? (
        <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">#{entrant.seed}</Badge>
      ) : null}
      {entrant.rankLabel ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">{entrant.rankLabel}</span>
      ) : null}
    </div>
  );
}

function DraggableEntrant({ entrant, disabled }: { entrant: DrawEntrant; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `entrant:${entrant.id}`, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab rounded-md border bg-card px-2 py-1",
        isDragging && "opacity-40",
        disabled && "cursor-default",
      )}
    >
      <EntrantCard entrant={entrant} />
    </div>
  );
}

function Slot({
  refSlot,
  entrant,
  onClear,
  readOnly,
}: {
  refSlot: DrawSlotRef;
  entrant: DrawEntrant | null;
  onClear: () => void;
  readOnly?: boolean;
}) {
  const id = slotKey(refSlot);
  const { setNodeRef, isOver } = useDroppable({ id, disabled: readOnly });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[34px] items-center gap-1 rounded-md border px-1.5 py-1",
        entrant ? "bg-card" : "border-dashed bg-muted/30",
        isOver && "border-primary bg-primary/10 ring-1 ring-primary/40",
      )}
    >
      {entrant ? (
        <>
          <div className="min-w-0 flex-1">
            <DraggableEntrant entrant={entrant} disabled={readOnly} />
          </div>
          {!readOnly && (
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Leave empty (bye)" onClick={onClear}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      ) : (
        <span className="px-1 text-[11px] italic text-muted-foreground">Empty — bye</span>
      )}
    </div>
  );
}

export function DrawBoard({ board, entrants, onChange, onReset, onUndo, canUndo, readOnly }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const byId = useMemo(() => new Map(entrants.map((e) => [e.id, e])), [entrants]);
  const bench = useMemo(() => benchedEntrants(board, entrants), [board, entrants]);
  const validation = useMemo(() => validateDrawBoard(board, entrants), [board, entrants]);
  const sections = useMemo(
    () => Array.from(new Set(board.matches.map((m) => m.section))).sort((a, b) => a - b),
    [board],
  );
  const multi = sections.length > 1;

  const { setNodeRef: benchRef, isOver: benchOver } = useDroppable({ id: BENCH_ID, disabled: readOnly });

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const entrantId = String(e.active.id).replace(/^entrant:/, "");
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    if (overId === BENCH_ID) {
      const ref = drawSlots(board).find((r) => {
        const m = board.matches.find((x) => x.section === r.section && x.position === r.position && x.round === r.round);
        return m && (r.side === "a" ? m.a : m.b) === entrantId;
      });
      if (ref) onChange(clearSlot(board, ref));
      return;
    }
    const ref = parseSlotKey(overId);
    if (ref) onChange(moveEntrant(board, entrantId, ref));
  };

  const active = activeId ? byId.get(activeId.replace(/^entrant:/, "")) ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {validation.playable} match{validation.playable === 1 ? "" : "es"} · {validation.byes} bye
            {validation.byes === 1 ? "" : "s"}
          </Badge>
          <div className="ml-auto flex gap-1">
            {onUndo && (
              <Button size="sm" variant="ghost" disabled={!canUndo || readOnly} onClick={onUndo}>
                <Undo2 className="mr-1 h-3.5 w-3.5" /> Undo
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={readOnly} onClick={onReset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset to suggested draw
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="space-y-3">
            {sections.map((section) => (
              <div key={section} className="rounded-md border p-2">
                {multi && (
                  <div className="mb-2 text-xs font-medium">{sectionLabelOf(section)}</div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {board.matches
                    .filter((m) => m.section === section)
                    .sort((a, b) => a.position - b.position)
                    .map((m) => {
                      const a = m.a ? byId.get(m.a) ?? null : null;
                      const b = m.b ? byId.get(m.b) ?? null : null;
                      const incomplete = (!a || !b) && (a || b);
                      return (
                        <div key={`${m.section}-${m.position}`} className="rounded-md border bg-muted/20 p-1.5">
                          <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            Match {m.position}
                            {incomplete ? (
                              <Badge variant="outline" className="text-[10px]">Bye</Badge>
                            ) : null}
                          </div>
                          <div className="space-y-1">
                            <Slot
                              refSlot={{ section: m.section, round: m.round, position: m.position, side: "a" }}
                              entrant={a}
                              readOnly={readOnly}
                              onClear={() =>
                                onChange(clearSlot(board, { section: m.section, round: m.round, position: m.position, side: "a" }))
                              }
                            />
                            <div className="text-center text-[10px] uppercase text-muted-foreground">v</div>
                            <Slot
                              refSlot={{ section: m.section, round: m.round, position: m.position, side: "b" }}
                              entrant={b}
                              readOnly={readOnly}
                              onClear={() =>
                                onChange(clearSlot(board, { section: m.section, round: m.round, position: m.position, side: "b" }))
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>

          <div
            ref={benchRef}
            className={cn(
              "space-y-1 rounded-md border border-dashed p-2",
              benchOver && "border-primary bg-primary/10",
            )}
          >
            <div className="text-xs font-medium">Not in the draw ({bench.length})</div>
            {bench.length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground">Everyone has a slot.</p>
            ) : (
              bench.map((e) => <DraggableEntrant key={e.id} entrant={e} disabled={readOnly} />)
            )}
            <p className="pt-1 text-[10px] text-muted-foreground">
              Drop a player here to take them out of a matchup — the slot becomes a bye.
            </p>
          </div>
        </div>

        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className="space-y-1">
            {validation.errors.map((e, i) => (
              <p key={`e${i}`} className="flex items-start gap-1 text-[11px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {e}
              </p>
            ))}
            {validation.warnings.map((w, i) => (
              <p key={`w${i}`} className="flex items-start gap-1 text-[11px] text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}
      </div>

      <DragOverlay>
        {active ? (
          <div className="rounded-md border bg-card px-2 py-1 shadow-lg">
            <EntrantCard entrant={active} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

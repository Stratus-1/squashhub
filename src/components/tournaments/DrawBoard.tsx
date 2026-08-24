/**
 * Visual draw board — the manual seeding surface.
 *
 * The engine proposes the bracket; the organiser drags players between slots,
 * empties a slot to hand out a bye, and only then confirms. Nothing here talks
 * to the database: it renders a `DrawBoard` model and reports edits upwards.
 */
import { useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
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

type SeedTone = "top" | "lower" | "out";

const TONE_CLASS: Record<SeedTone, string> = {
  top: "border-seed-top/50 bg-seed-top/10",
  lower: "border-seed-lower/50 bg-seed-lower/10",
  out: "border-seed-out/50 bg-seed-out/10",
};

const TONE_BADGE: Record<SeedTone, string> = {
  top: "border-seed-top/60 text-seed-top",
  lower: "border-seed-lower/60 text-seed-lower",
  out: "border-seed-out/60 text-seed-out",
};

function EntrantCard({ entrant, tone }: { entrant: DrawEntrant; tone: SeedTone }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate text-[11px] leading-tight">
        {entrant.name}
        {entrant.partnerName ? <span className="text-muted-foreground"> &amp; {entrant.partnerName}</span> : null}
      </span>
      {entrant.seed ? (
        <Badge variant="outline" className={cn("ml-auto shrink-0 px-1 py-0 text-[9px]", TONE_BADGE[tone])}>
          #{entrant.seed}
        </Badge>
      ) : null}
      {entrant.rankLabel ? (
        <span className="shrink-0 text-[9px] text-muted-foreground">{entrant.rankLabel}</span>
      ) : null}
    </div>
  );
}

function DraggableEntrant({ entrant, tone, disabled }: { entrant: DrawEntrant; tone: SeedTone; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `entrant:${entrant.id}`, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab rounded border px-1.5 py-0.5",
        TONE_CLASS[tone],
        isDragging && "opacity-40",
        disabled && "cursor-default",
      )}
    >
      <EntrantCard entrant={entrant} tone={tone} />
    </div>
  );
}

function Slot({
  refSlot,
  entrant,
  tone,
  onClear,
  readOnly,
}: {
  refSlot: DrawSlotRef;
  entrant: DrawEntrant | null;
  tone: SeedTone;
  onClear: () => void;
  readOnly?: boolean;
}) {
  const id = slotKey(refSlot);
  const { setNodeRef, isOver } = useDroppable({ id, disabled: readOnly });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[26px] items-center gap-1 rounded border px-1 py-0.5",
        entrant ? "bg-card" : "border-dashed bg-muted/30",
        isOver && "border-primary bg-primary/10 ring-1 ring-primary/40",
      )}
    >
      {entrant ? (
        <>
          <div className="min-w-0 flex-1">
            <DraggableEntrant entrant={entrant} tone={tone} disabled={readOnly} />
          </div>
          {!readOnly && (
            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" title="Leave empty (bye)" onClick={onClear}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </>
      ) : (
        <span className="px-1 text-[10px] italic text-muted-foreground">Empty — bye</span>
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
    () => sectionsOf(board),
    [board],
  );
  const multi = sections.length > 1;
  const progress = useMemo(() => boardProgress(board), [board]);
  /**
   * Adaptive layout: a small round keeps the bracket cards, a large round
   * (many pairings) switches to a compact editable list. Filtering to one
   * pool at a time also means a drag can never cross into another scope.
   */
  const layout = drawLayout(board.matches.length);
  const [scope, setScope] = useState<number | "all">("all");
  const visibleSections = useMemo(
    () => (scope === "all" ? sections : sections.filter((s) => s === scope)),
    [scope, sections],
  );


  /** Top half of the seeding list reads green, the rest blue, benched players red. */
  const seedCut = useMemo(() => {
    const seeds = entrants.map((e) => e.seed ?? 0).filter((n) => n > 0);
    if (seeds.length === 0) return 0;
    return Math.ceil(Math.max(...seeds) / 2);
  }, [entrants]);
  const toneOf = (e: DrawEntrant | null): SeedTone =>
    !e ? "lower" : !e.seed || !seedCut ? "lower" : e.seed <= seedCut ? "top" : "lower";

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
      modifiers={[snapCenterToCursor]}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {validation.playable} match{validation.playable === 1 ? "" : "es"} · {validation.byes} bye
            {validation.byes === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{progress.summary}</Badge>

          <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-seed-top" /> Higher seed</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-seed-lower" /> Lower seed</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-seed-out" /> Not in draw</span>
          </span>
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

        {multi && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Working on:</span>
            <Badge
              variant={scope === "all" ? "default" : "outline"}
              className="cursor-pointer text-[10px]"
              onClick={() => setScope("all")}
            >
              All pools
            </Badge>
            {sections.map((s) => (
              <Badge
                key={s}
                variant={scope === s ? "default" : "outline"}
                className="cursor-pointer text-[10px]"
                onClick={() => setScope(s)}
              >
                {sectionLabelOf(s)}
              </Badge>
            ))}
          </div>
        )}



        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="space-y-3">
            {visibleSections.map((section) => {
              const rows = matchesInScope(board, section);
              return (
              <div key={section} className="rounded-md border p-2">
                {multi && (
                  <div className="mb-2 text-xs font-medium">
                    {sectionLabelOf(section)}{" "}
                    <span className="text-muted-foreground">· {rows.length} match{rows.length === 1 ? "" : "es"}</span>
                  </div>
                )}
                <div className={cn("grid gap-1.5", layout === "list" ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3")}>
                  {rows.map((m) => {
                      const a = m.a ? byId.get(m.a) ?? null : null;
                      const b = m.b ? byId.get(m.b) ?? null : null;
                      const incomplete = (!a || !b) && (a || b);
                      const slotA = (
                        <Slot
                          refSlot={{ section: m.section, round: m.round, position: m.position, side: "a" }}
                          entrant={a}
                          tone={toneOf(a)}
                          readOnly={readOnly}
                          onClear={() =>
                            onChange(clearSlot(board, { section: m.section, round: m.round, position: m.position, side: "a" }))
                          }
                        />
                      );
                      const slotB = (
                        <Slot
                          refSlot={{ section: m.section, round: m.round, position: m.position, side: "b" }}
                          entrant={b}
                          tone={toneOf(b)}
                          readOnly={readOnly}
                          onClear={() =>
                            onChange(clearSlot(board, { section: m.section, round: m.round, position: m.position, side: "b" }))
                          }
                        />
                      );

                      // Large rounds: one compact editable row per matchup so
                      // 50 pairings stay scannable and scrollable.
                      if (layout === "list") {
                        return (
                          <div
                            key={`${m.section}-${m.position}`}
                            className="flex items-center gap-1.5 rounded border bg-muted/20 px-1.5 py-1"
                          >
                            <span className="w-10 shrink-0 text-[10px] text-muted-foreground">#{m.position}</span>
                            <div className="min-w-0 flex-1">{slotA}</div>
                            <span className="shrink-0 text-[9px] uppercase text-muted-foreground">v</span>
                            <div className="min-w-0 flex-1">{slotB}</div>
                            {incomplete ? (
                              <Badge variant="outline" className="shrink-0 text-[9px]">Bye</Badge>
                            ) : null}
                          </div>
                        );
                      }

                      return (
                        <div key={`${m.section}-${m.position}`} className="rounded border bg-muted/20 p-1">
                          <div className="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                            Match {m.position}
                            {incomplete ? (
                              <Badge variant="outline" className="text-[10px]">Bye</Badge>
                            ) : null}
                          </div>
                          <div className="space-y-0.5">
                            {slotA}
                            <div className="text-center text-[9px] uppercase text-muted-foreground">v</div>
                            {slotB}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
              );
            })}
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
              bench.map((e) => <DraggableEntrant key={e.id} entrant={e} tone="out" disabled={readOnly} />)
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
          <div className={cn("rounded border px-1.5 py-0.5 shadow-lg", TONE_CLASS[toneOf(active)])}>
            <EntrantCard entrant={active} tone={toneOf(active)} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

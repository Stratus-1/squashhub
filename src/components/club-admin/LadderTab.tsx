import { useCallback, useEffect, useMemo, useState } from "react";
import { useLadder } from "@/hooks/use-data";
import { useMyClub } from "@/hooks/use-club";
import { type LadderPlayer } from "@/components/LadderPlayerCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Loader2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { rpcExt, fromExt } from "@/lib/supabase-ext";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function DraggablePlayerRow({ player, index }: { player: LadderPlayer; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={cn(
        "p-2 flex items-center gap-2 transition-colors",
        isDragging && "shadow-lg ring-2 ring-primary/30 bg-muted",
        index === 0 && "border-accent/50 bg-accent/5",
      )}>
        <div
          className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center font-heading font-bold text-[10px] shrink-0",
          index === 0 ? "bg-accent text-accent-foreground" :
          index <= 2 ? "bg-primary/15 text-primary" :
          "bg-secondary text-muted-foreground"
        )}>
          {index + 1}
        </div>

        <PlayerAvatar initials={getInitials(player.name)} size="sm" avatarUrl={player.avatar_url} />

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{player.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {player.wins}W-{player.losses}L
            </span>
            {player.league_rank != null && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                League #{player.league_rank}
              </Badge>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export function LadderTab({ clubId }: { clubId: string }) {
  const { data: players, isLoading } = useLadder();
  const { data: clubData } = useMyClub();
  const queryClient = useQueryClient();
  const [menOrder, setMenOrder] = useState<LadderPlayer[] | null>(null);
  const [ladiesOrder, setLadiesOrder] = useState<LadderPlayer[] | null>(null);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const menFromData = useMemo(() =>
    (players || []).filter((p: any) =>
      p.gender?.toLowerCase() !== "female" && p.gender?.toLowerCase() !== "ladies" && p.gender?.toLowerCase() !== "f"
    ) as LadderPlayer[],
    [players]
  );

  const ladiesFromData = useMemo(() =>
    (players || []).filter((p: any) =>
      p.gender?.toLowerCase() === "female" || p.gender?.toLowerCase() === "ladies" || p.gender?.toLowerCase() === "f"
    ) as LadderPlayer[],
    [players]
  );

  useEffect(() => {
    setMenOrder(null);
    setLadiesOrder(null);
  }, [players]);

  const menPlayers = menOrder ?? menFromData;
  const ladiesPlayers = ladiesOrder ?? ladiesFromData;
  const hasChanges = menOrder !== null || ladiesOrder !== null;

  const handleDragEnd = useCallback((gender: "men" | "ladies") => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const list = gender === "men" ? menPlayers : ladiesPlayers;
    const setter = gender === "men" ? setMenOrder : setLadiesOrder;
    const oldIndex = list.findIndex((p) => p.id === active.id);
    const newIndex = list.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setter(arrayMove(list, oldIndex, newIndex));
  }, [menPlayers, ladiesPlayers]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const promises: Promise<any>[] = [];
      if (menOrder) {
        promises.push(rpcExt("admin_reorder_ladder", {
          player_ids: menOrder.map((p) => p.id),
          gender_filter: "male",
        }));
      }
      if (ladiesOrder) {
        promises.push(rpcExt("admin_reorder_ladder", {
          player_ids: ladiesOrder.map((p) => p.id),
          gender_filter: "female",
        }));
      }
      const results = await Promise.all(promises);
      const err = results.find((r) => r.error);
      if (err?.error) throw err.error;
      toast.success("Ladder order saved");
      setMenOrder(null);
      setLadiesOrder(null);
      queryClient.invalidateQueries({ queryKey: ["ladder"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to save order");
    } finally {
      setSaving(false);
    }
  }, [menOrder, ladiesOrder, queryClient]);


  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasChanges && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-xs text-muted-foreground flex-1">You have unsaved changes to the ladder order.</p>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setMenOrder(null); setLadiesOrder(null); }} className="gap-1">
            <X className="w-3 h-3" />
            Cancel
          </Button>
        </div>
      )}


      <p className="text-xs text-muted-foreground">
        Drag players to reorder their ladder position. Changes are reflected on the public ladder page after saving.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Men's */}
        <div>
          <h3 className="text-sm font-heading font-bold text-foreground mb-2 uppercase tracking-wide">
            Men's Ladder
            <span className="text-muted-foreground font-normal ml-1.5">({menPlayers.length})</span>
          </h3>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd("men")}>
            <SortableContext items={menPlayers.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {menPlayers.map((player, index) => (
                  <DraggablePlayerRow key={player.id} player={player} index={index} />
                ))}
                {menPlayers.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">No men's players</p>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Ladies' */}
        <div>
          <h3 className="text-sm font-heading font-bold text-foreground mb-2 uppercase tracking-wide">
            Ladies' Ladder
            <span className="text-muted-foreground font-normal ml-1.5">({ladiesPlayers.length})</span>
          </h3>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd("ladies")}>
            <SortableContext items={ladiesPlayers.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {ladiesPlayers.map((player, index) => (
                  <DraggablePlayerRow key={player.id} player={player} index={index} />
                ))}
                {ladiesPlayers.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">No ladies' players</p>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

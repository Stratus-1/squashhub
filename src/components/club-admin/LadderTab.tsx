import { useCallback, useEffect, useMemo, useState } from "react";
import { useClubMembers } from "@/hooks/use-club";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GripVertical, Loader2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { rpcExt } from "@/lib/supabase-ext";
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

interface LadderMember {
  id: string;
  name: string;
  avatar_url: string | null;
  gender: string | null;
  ladder_position: number | null;
}

function DraggablePlayerRow({ player, index }: { player: LadderMember; index: number }) {
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
      )}>
        <div
          className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <div className="w-6 h-6 rounded-full flex items-center justify-center font-heading font-bold text-[10px] shrink-0 bg-secondary text-muted-foreground">
          {index + 1}
        </div>

        <PlayerAvatar initials={getInitials(player.name)} size="sm" avatarUrl={player.avatar_url} />

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{player.name}</p>
        </div>
      </Card>
    </div>
  );
}

export function LadderTab({ clubId }: { clubId: string }) {
  const { data: members = [], isLoading } = useClubMembers(clubId);
  const queryClient = useQueryClient();
  const [menOrder, setMenOrder] = useState<LadderMember[] | null>(null);
  const [ladiesOrder, setLadiesOrder] = useState<LadderMember[] | null>(null);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // Build simple lists from club members, sorted by existing ladder_position then name
  const menFromData = useMemo(() =>
    members
      .filter((m: any) => {
        const g = (m.gender || "").toLowerCase();
        return g !== "female" && g !== "ladies" && g !== "f";
      })
      .sort((a: any, b: any) => {
        const ap = a.ladder_position ?? 9999;
        const bp = b.ladder_position ?? 9999;
        if (ap !== bp) return ap - bp;
        return (a.name || "").localeCompare(b.name || "");
      })
      .map((m: any) => ({
        id: m.id,
        name: m.name || m.profiles?.name || m.email || "Unknown",
        avatar_url: m.profiles?.avatar_url || null,
        gender: m.gender || null,
        ladder_position: m.ladder_position ?? null,
      })),
    [members]
  );

  const ladiesFromData = useMemo(() =>
    members
      .filter((m: any) => {
        const g = (m.gender || "").toLowerCase();
        return g === "female" || g === "ladies" || g === "f";
      })
      .sort((a: any, b: any) => {
        const ap = a.ladder_position ?? 9999;
        const bp = b.ladder_position ?? 9999;
        if (ap !== bp) return ap - bp;
        return (a.name || "").localeCompare(b.name || "");
      })
      .map((m: any) => ({
        id: m.id,
        name: m.name || m.profiles?.name || m.email || "Unknown",
        avatar_url: m.profiles?.avatar_url || null,
        gender: m.gender || null,
        ladder_position: m.ladder_position ?? null,
      })),
    [members]
  );

  // Reset local order when data refreshes
  useEffect(() => {
    setMenOrder(null);
    setLadiesOrder(null);
  }, [members]);

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
      queryClient.invalidateQueries({ queryKey: ["club-members"] });
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

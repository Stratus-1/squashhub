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
}

function DraggablePlayerRow({ player, index }: { player: LadderMember; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        className={cn(
          "p-2 flex items-center gap-2 transition-colors",
          isDragging && "shadow-lg ring-2 ring-primary/30 bg-muted"
        )}
      >
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

function isLadiesGender(gender: string | null | undefined) {
  const g = (gender || "").toLowerCase();
  return g === "female" || g === "ladies" || g === "f";
}

export function LadderTab({ clubId }: { clubId: string }) {
  const { data: members = [], isLoading, error } = useClubMembers(clubId);
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<LadderMember[] | null>(null);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const membersFromData = useMemo(
    () =>
      members
        .map((m: any) => ({
          id: m.id,
          name: m.name || m.profiles?.name || m.email || "Unknown",
          avatar_url: m.profiles?.avatar_url || null,
          gender: m.gender || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  useEffect(() => {
    setOrder(null);
  }, [members]);

  const players = order ?? membersFromData;
  const hasChanges = order !== null;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = players.findIndex((p) => p.id === active.id);
      const newIndex = players.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      setOrder(arrayMove(players, oldIndex, newIndex));
    },
    [players]
  );

  const handleSave = useCallback(async () => {
    if (!order) return;
    setSaving(true);
    try {
      const menIds = order.filter((p) => !isLadiesGender(p.gender)).map((p) => p.id);
      const ladiesIds = order.filter((p) => isLadiesGender(p.gender)).map((p) => p.id);

      const promises: Promise<any>[] = [];
      if (menIds.length > 0) {
        promises.push(
          rpcExt("admin_reorder_ladder", {
            player_ids: menIds,
            gender_filter: "male",
          })
        );
      }
      if (ladiesIds.length > 0) {
        promises.push(
          rpcExt("admin_reorder_ladder", {
            player_ids: ladiesIds,
            gender_filter: "female",
          })
        );
      }

      const results = await Promise.all(promises);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;

      toast.success("Ladder order saved");
      setOrder(null);
      queryClient.invalidateQueries({ queryKey: ["ladder"] });
      queryClient.invalidateQueries({ queryKey: ["club-members"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to save order");
    } finally {
      setSaving(false);
    }
  }, [order, queryClient]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-destructive">Failed to load members for ladder.</p>;
  }

  return (
    <div className="space-y-4">
      {hasChanges && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-xs text-muted-foreground flex-1">You have unsaved ladder changes.</p>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOrder(null)} className="gap-1">
            <X className="w-3 h-3" />
            Cancel
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Drag all members into the desired order, then save.
      </p>

      <div>
        <h3 className="text-sm font-heading font-bold text-foreground mb-2 uppercase tracking-wide">
          Ladder Members
          <span className="text-muted-foreground font-normal ml-1.5">({players.length})</span>
        </h3>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={players.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {players.map((player, index) => (
                <DraggablePlayerRow key={player.id} player={player} index={index} />
              ))}
              {players.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No members found</p>}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

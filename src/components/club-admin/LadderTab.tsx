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

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function DraggablePlayerRow({ player, index }: { player: LadderMember; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

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

interface GenderLadderProps {
  title: string;
  players: LadderMember[];
  order: LadderMember[] | null;
  setOrder: (o: LadderMember[] | null) => void;
  genderFilter: string;
  saving: boolean;
  onSave: (ordered: LadderMember[], genderFilter: string) => void;
}

function GenderLadder({ title, players, order, setOrder, genderFilter, saving, onSave }: GenderLadderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const list = order ?? players;
  const hasChanges = order !== null;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = list.findIndex((p) => p.id === active.id);
      const newIndex = list.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      setOrder(arrayMove(list, oldIndex, newIndex));
    },
    [list, setOrder]
  );

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-heading font-bold text-foreground uppercase tracking-wide">
        {title}
        <span className="text-muted-foreground font-normal ml-1.5">({list.length})</span>
      </h3>

      {hasChanges && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-xs text-muted-foreground flex-1">Unsaved changes</p>
          <Button size="sm" onClick={() => onSave(order!, genderFilter)} disabled={saving} className="gap-1 h-7 text-xs">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOrder(null)} className="gap-1 h-7 text-xs">
            <X className="w-3 h-3" />
            Cancel
          </Button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={list.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {list.map((player, index) => (
              <DraggablePlayerRow key={player.id} player={player} index={index} />
            ))}
            {list.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">No members found</p>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function LadderTab({ clubId }: { clubId: string }) {
  const { data: members = [], isLoading, error } = useClubMembers(clubId);
  const queryClient = useQueryClient();
  const [menOrder, setMenOrder] = useState<LadderMember[] | null>(null);
  const [ladiesOrder, setLadiesOrder] = useState<LadderMember[] | null>(null);
  const [saving, setSaving] = useState(false);

  const allMembers = useMemo(
    () =>
      members.map((m: any) => ({
        id: m.id,
        name: m.name || m.profiles?.name || m.email || "Unknown",
        avatar_url: m.profiles?.avatar_url || null,
        gender: m.gender || null,
      })),
    [members]
  );

  const menMembers = useMemo(
    () => allMembers.filter((m) => !isLadiesGender(m.gender)).sort((a, b) => a.name.localeCompare(b.name)),
    [allMembers]
  );

  const ladiesMembers = useMemo(
    () => allMembers.filter((m) => isLadiesGender(m.gender)).sort((a, b) => a.name.localeCompare(b.name)),
    [allMembers]
  );

  useEffect(() => {
    setMenOrder(null);
    setLadiesOrder(null);
  }, [members]);

  const handleSave = useCallback(
    async (ordered: LadderMember[], genderFilter: string) => {
      setSaving(true);
      try {
        const ids = ordered.map((p) => p.id);
        const { error: err } = await rpcExt("admin_reorder_ladder", {
          player_ids: ids,
          gender_filter: genderFilter,
        });
        if (err) throw err;
        toast.success("Ladder order saved");
        if (genderFilter === "male") setMenOrder(null);
        else setLadiesOrder(null);
        queryClient.invalidateQueries({ queryKey: ["ladder"] });
        queryClient.invalidateQueries({ queryKey: ["club-members"] });
      } catch (e: any) {
        toast.error(e.message || "Failed to save order");
      } finally {
        setSaving(false);
      }
    },
    [queryClient]
  );

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
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Drag members into the desired order per gender, then save.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GenderLadder
          title="Men's Ladder"
          players={menMembers}
          order={menOrder}
          setOrder={setMenOrder}
          genderFilter="male"
          saving={saving}
          onSave={handleSave}
        />
        <GenderLadder
          title="Ladies' Ladder"
          players={ladiesMembers}
          order={ladiesOrder}
          setOrder={setLadiesOrder}
          genderFilter="female"
          saving={saving}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}

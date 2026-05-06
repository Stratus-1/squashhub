import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { dragId } from "./types";

type Props = {
  memberId: string;
  origin: string; // leagueId | "na" | "pool"
  name: string;
  rank?: number | null;
  leagueNumber?: string | null;
  disabled?: boolean;
  badge?: { label: string; variant?: "outline" | "secondary" | "destructive" } | null;
  positionLabel?: string | null; // e.g. "1." or "#3"
  muted?: boolean;
  /** True when the member has confirmed they ARE available for this week. Renders a green pill. */
  available?: boolean;
};

export function DraggablePlayer({ memberId, origin, name, rank, leagueNumber, disabled, badge, positionLabel, muted, available }: Props) {
  const id = dragId(memberId, origin);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
    data: { memberId, origin },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-1.5 px-1.5 py-1 rounded border text-sm select-none",
        available
          ? "border-emerald-500/60 bg-emerald-500/15 dark:bg-emerald-500/20"
          : "border-border/60 bg-background/80",
        disabled ? "opacity-60" : available ? "hover:bg-emerald-500/25" : "hover:bg-accent/40",
        isDragging && "opacity-30",
        muted && "opacity-50",
      )}
    >
      {!disabled && (
        <button
          type="button"
          className="shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
          aria-label={`Drag ${name}`}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="w-3 h-3" />
        </button>
      )}
      {positionLabel && <span className="text-[10px] text-muted-foreground w-4 shrink-0">{positionLabel}</span>}
      <span className={cn("flex-1 truncate text-xs", muted && "line-through")}>
        {name}
        {leagueNumber && <span className="text-muted-foreground ml-1">#{leagueNumber}</span>}
        {typeof rank === "number" && <span className="text-muted-foreground ml-1">R{rank}</span>}
      </span>
      {badge && (
        <Badge variant={badge.variant ?? "outline"} className="text-[9px] px-1 py-0 shrink-0">
          {badge.label}
        </Badge>
      )}
    </div>
  );
}

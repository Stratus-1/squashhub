import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Ban, Check } from "lucide-react";
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
  positionLabel?: string | null;
  muted?: boolean;
  /** Member confirmed they ARE available — green pill. */
  available?: boolean;
  /** Member is marked unavailable for the week — red pill. */
  unavailable?: boolean;
  /** When provided, shows a one-click red Ban button to mark unavailable. */
  onMarkUnavailable?: () => void;
  /** When provided, shows a one-click green Check button to mark available again. */
  onMarkAvailable?: () => void;
};

export function DraggablePlayer({
  memberId, origin, name, rank, leagueNumber, disabled, badge, positionLabel, muted,
  available, unavailable, onMarkUnavailable, onMarkAvailable,
}: Props) {
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
        unavailable
          ? "border-destructive bg-destructive/15 text-destructive"
          : available
          ? "border-win bg-win text-primary-foreground font-semibold shadow-sm"
          : "border-border/60 bg-background/80",
        disabled && !available && !unavailable ? "opacity-60" : "",
        !disabled && available && "hover:bg-win/90",
        !disabled && !available && !unavailable && "hover:bg-accent/40",
        isDragging && "opacity-30",
        muted && "opacity-60",
      )}
    >
      {!disabled && (
        <button
          type="button"
          className={cn(
            "shrink-0 cursor-grab active:cursor-grabbing touch-none",
            available ? "text-primary-foreground/80 hover:text-primary-foreground"
            : unavailable ? "text-destructive/80 hover:text-destructive"
            : "text-muted-foreground hover:text-foreground"
          )}
          aria-label={`Drag ${name}`}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="w-3 h-3" />
        </button>
      )}
      {positionLabel && (
        <span className={cn("text-[10px] w-4 shrink-0",
          available ? "text-primary-foreground/80"
          : unavailable ? "text-destructive/80"
          : "text-muted-foreground")}>{positionLabel}</span>
      )}
      <span className={cn("flex-1 truncate text-xs", muted && "line-through")}>
        {name}
        {leagueNumber && (
          <span className={cn("ml-1",
            available ? "text-primary-foreground/80"
            : unavailable ? "text-destructive/80"
            : "text-muted-foreground")}>#{leagueNumber}</span>
        )}
        {typeof rank === "number" && (
          <span className={cn("ml-1",
            available ? "text-primary-foreground/80"
            : unavailable ? "text-destructive/80"
            : "text-muted-foreground")}>R{rank}</span>
        )}
      </span>
      {badge && (
        <Badge variant={badge.variant ?? "outline"} className="text-[9px] px-1 py-0 shrink-0">
          {badge.label}
        </Badge>
      )}
      {onMarkUnavailable && !unavailable && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMarkUnavailable(); }}
          className="shrink-0 rounded p-0.5 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
          aria-label={`Mark ${name} unavailable`}
          title="Mark unavailable for the week"
        >
          <Ban className="w-3.5 h-3.5" />
        </button>
      )}
      {onMarkAvailable && unavailable && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMarkAvailable(); }}
          className="shrink-0 rounded p-0.5 text-win hover:bg-win hover:text-primary-foreground transition-colors"
          aria-label={`Mark ${name} available`}
          title="Restore as available"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

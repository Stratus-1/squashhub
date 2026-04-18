import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type Props = {
  id: string;
  children: ReactNode;
  className?: string;
  emptyHint?: string;
  isEmpty?: boolean;
  variant?: "slot" | "bench" | "na";
};

export function DroppableZone({ id, children, className, emptyHint, isEmpty, variant = "bench" }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const variantStyles = {
    slot: "min-h-[34px] border-dashed border bg-muted/30",
    bench: "min-h-[40px] border-dashed border bg-card/40",
    na: "min-h-[44px] border-dashed border-2 border-destructive/40 bg-destructive/5",
  }[variant];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md p-1 transition-colors",
        variantStyles,
        isOver && "bg-primary/15 border-primary ring-1 ring-primary/40",
        className,
      )}
    >
      {isEmpty && emptyHint ? (
        <div className="text-[11px] text-muted-foreground italic px-1 py-1">{emptyHint}</div>
      ) : (
        children
      )}
    </div>
  );
}

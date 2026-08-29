import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { buildPyramidRows } from "@/lib/ladder/eligibility";

export interface PyramidEntry {
  key: string;
  position: number;
  name: string;
  isMe: boolean;
  challengeable: boolean;
}

interface Props {
  entries: PyramidEntry[];
  rowSizes?: number[] | null;
  onSelect?: (entry: PyramidEntry) => void;
  title?: string;
}

/**
 * Mobile-first pyramid rendering of ladder positions.
 * Row sizes default to the triangular 1, 2, 3, … shape.
 */
export function PyramidLadder({ entries, rowSizes, onSelect, title }: Props) {
  const rows = useMemo(() => buildPyramidRows(entries, rowSizes), [entries, rowSizes]);

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground py-6 text-center">No ranked players yet.</p>;
  }

  return (
    <div className="space-y-2">
      {title && (
        <h2 className="text-sm font-heading font-bold uppercase tracking-wide">
          {title}
          <span className="text-muted-foreground font-normal ml-1.5">({entries.length})</span>
        </h2>
      )}
      <div className="space-y-1.5 overflow-x-auto pb-1">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-center gap-1.5 min-w-max mx-auto">
            {row.map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => onSelect?.(e)}
                title={`#${e.position} ${e.name}`}
                className={cn(
                  "flex flex-col items-center justify-center rounded-md border px-2 py-1 min-w-[74px] max-w-[110px] transition-colors",
                  e.isMe
                    ? "bg-primary text-primary-foreground border-primary"
                    : e.challengeable
                      ? "bg-accent/15 border-accent text-foreground hover:bg-accent/25"
                      : "bg-card border-border hover:bg-muted/40",
                )}
              >
                <span className="text-[10px] font-bold tabular-nums opacity-70">#{e.position}</span>
                <span className="text-[11px] font-medium truncate w-full text-center">{e.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-3 pt-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" /> You
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-accent/40 border border-accent inline-block" /> Can challenge
        </span>
      </div>
    </div>
  );
}

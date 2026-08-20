import { useMemo, useState } from "react";
import { ChevronRight, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  LeagueTreeGroup,
  filterLeagueTree,
  groupSelectionState,
  summarizeTreeSelection,
  toggleChild,
  toggleGroup,
} from "@/lib/tournaments/league-tree";

interface Props {
  groups: LeagueTreeGroup[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Hierarchical "Players from" picker: league level → teams / reserves.
 * Every id emitted is a canonical club league id.
 */
export function LeagueSourceTree({ groups, selected, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const visible = useMemo(() => filterLeagueTree(groups, query), [groups, query]);
  const summary = useMemo(() => summarizeTreeSelection(groups, selected), [groups, selected]);
  const searching = query.trim().length > 0;

  if (groups.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No club leagues yet.</p>;
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search leagues or teams"
          className="h-7 pl-7 text-[11px]"
        />
      </div>

      <div className="max-h-60 overflow-auto pr-0.5 space-y-0.5">
        {visible.length === 0 && (
          <p className="text-[11px] text-muted-foreground py-2">No matches.</p>
        )}
        {visible.map((g) => {
          const state = groupSelectionState(g, selected);
          const open = searching || expanded[g.key];
          return (
            <div key={g.key} className="rounded-md border border-border/50">
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => setExpanded((m) => ({ ...m, [g.key]: !m[g.key] }))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={open ? "Collapse league" : "Expand league"}
                >
                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
                </button>
                <label className="flex flex-1 items-center gap-2 text-xs font-medium cursor-pointer min-w-0">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-violet-500"
                    checked={state === "all"}
                    ref={(el) => { if (el) el.indeterminate = state === "some"; }}
                    onChange={() => onChange(toggleGroup(g, selected))}
                  />
                  <span className="truncate">{g.label}</span>
                </label>
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-normal shrink-0">
                  <Users className="h-2.5 w-2.5 mr-0.5" />
                  {g.children.length}
                </Badge>
              </div>
              {open && (
                <div className="pl-7 pr-2 pb-1 space-y-0.5">
                  {g.children.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-3 w-3 accent-violet-500"
                        checked={selected.includes(c.id)}
                        onChange={() => onChange(toggleChild(c.id, selected))}
                      />
                      <span className="truncate">{c.name}</span>
                      {c.isReserve && (
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground shrink-0">
                          reserves
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground">{summary.text}</p>
    </div>
  );
}

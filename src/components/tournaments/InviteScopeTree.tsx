/**
 * Association → Club invitation picker.
 *
 * Shown when a tournament's scope reaches beyond the host club. Counts only —
 * no player names or contact details are loaded here.
 */
import { useMemo } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  allClubIds,
  associationTickState,
  scopeSelectionSummary,
  toggleAssociation,
  toggleClub,
  type ScopeTreeAssociation,
} from "@/lib/tournaments/invite-scope-tree";

interface Props {
  tree: ScopeTreeAssociation[];
  selectedClubIds: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;
  error?: string | null;
}

export function InviteScopeTree({ tree, selectedClubIds, onChange, loading, error }: Props) {
  const selected = useMemo(() => new Set(selectedClubIds), [selectedClubIds]);
  const summary = useMemo(() => scopeSelectionSummary(tree, selected), [tree, selected]);

  if (loading) {
    return <p className="text-[13px] text-muted-foreground">Loading clubs…</p>;
  }
  if (error) {
    return (
      <p className="text-[13px] text-destructive">
        Could not load the club list: {error}
      </p>
    );
  }
  if (tree.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No other clubs are in scope yet. Link this club to a regional league to invite beyond your own members.
      </p>
    );
  }


  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(allClubIds(tree))}>
          Select all
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([])}>
          Clear
        </Button>
        <span className="text-[13px] text-muted-foreground">{summary}</span>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
        {tree.map((group) => {
          const state = associationTickState(group, selected);
          return (
            <Collapsible key={group.associationId || group.associationName} defaultOpen>
              <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/40">
                <Checkbox
                  checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
                  onCheckedChange={() => onChange(toggleAssociation(group, selected))}
                  aria-label={`Select all clubs in ${group.associationName}`}
                />
                <CollapsibleTrigger asChild>
                  <button type="button" className="flex flex-1 items-center gap-1.5 text-left text-[13px] font-medium">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform data-[state=open]:rotate-90 hidden" />
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    {group.associationName}
                    <Badge variant="secondary" className="ml-1 text-[11px]">
                      {group.clubs.length} club{group.clubs.length === 1 ? "" : "s"}
                    </Badge>
                  </button>
                </CollapsibleTrigger>
                <span className="text-[12px] text-muted-foreground flex items-center gap-1" title={`${group.memberCount} members · ${group.clubs.reduce((n, c) => n + c.emailReachCount, 0)} with email`}>
                  <Users className="h-3 w-3" />
                  {group.memberCount}
                </span>
              </div>
              <CollapsibleContent>
                {group.clubs.map((club) => (
                  <label
                    key={club.clubId}
                    className="flex items-center gap-2 px-2 py-1.5 pl-8 text-[13px] hover:bg-muted/30 cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.has(club.clubId)}
                      onCheckedChange={() => onChange(toggleClub(club.clubId, selected))}
                    />
                    <span className="flex-1 truncate">
                      {club.clubName}
                      {club.isOwnClub && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          Your club
                        </Badge>
                      )}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {club.memberCount} member{club.memberCount === 1 ? "" : "s"}
                      {club.registeredCount > 0 ? ` · ${club.registeredCount} entered` : ""}
                    </span>
                  </label>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

export default InviteScopeTree;

/**
 * Association → Club invitation picker with expandable member lists.
 *
 * Shown when a tournament's scope reaches beyond the host club. Clubs can be
 * expanded to reveal individual email-reachable members, who can then be
 * selected or deselected one by one. Contact details stay server-side.
 */
import { useMemo, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  allClubIds,
  associationTickState,
  fetchScopeClubMembers,
  scopeSelectionSummary,
  toggleAssociation,
  toggleClub,
  type ScopeTreeAssociation,
  type ScopeTreeClub,
} from "@/lib/tournaments/invite-scope-tree";
import type { DirectoryPlayer } from "@/lib/tournaments/invite-directory";

interface Props {
  tree: ScopeTreeAssociation[];
  selectedClubIds: string[];
  onChange: (nextClubs: string[]) => void;
  selectedMemberIds?: string[];
  onMemberChange?: (nextMembers: string[]) => void;
  tournamentId?: string | null;
  scopeClubId?: string | null;
  loading?: boolean;
  error?: string | null;
}

export function InviteScopeTree({
  tree,
  selectedClubIds,
  onChange,
  selectedMemberIds = [],
  onMemberChange,
  tournamentId,
  scopeClubId,
  loading,
  error,
}: Props) {
  const selectedClubs = useMemo(() => new Set(selectedClubIds), [selectedClubIds]);
  const selectedMembers = useMemo(() => new Set(selectedMemberIds), [selectedMemberIds]);
  const summary = useMemo(
    () => scopeSelectionSummary(tree, selectedClubs, selectedMembers),
    [tree, selectedClubs, selectedMembers],
  );

  const [expandedClubs, setExpandedClubs] = useState<Set<string>>(new Set());
  const [clubMembers, setClubMembers] = useState<Map<string, DirectoryPlayer[]>>(new Map());
  const [loadingClubs, setLoadingClubs] = useState<Set<string>>(new Set());
  const [clubErrors, setClubErrors] = useState<Map<string, string>>(new Map());

  const toggleExpand = useCallback(
    async (club: ScopeTreeClub) => {
      const id = club.clubId;
      const next = new Set(expandedClubs);
      if (next.has(id)) {
        next.delete(id);
        setExpandedClubs(next);
        return;
      }
      next.add(id);
      setExpandedClubs(next);
      if (clubMembers.has(id) || loadingClubs.has(id)) return;
      setLoadingClubs((prev) => new Set(prev).add(id));
      try {
        const members = await fetchScopeClubMembers({
          tournamentId,
          clubId: id,
          scopeClubId,
        });
        setClubMembers((prev) => {
          const copy = new Map(prev);
          copy.set(id, members);
          return copy;
        });
      } catch (e) {
        setClubErrors((prev) => {
          const copy = new Map(prev);
          copy.set(id, (e as Error)?.message || "Could not load members");
          return copy;
        });
      } finally {
        setLoadingClubs((prev) => {
          const copy = new Set(prev);
          copy.delete(id);
          return copy;
        });
      }
    },
    [expandedClubs, clubMembers, loadingClubs, tournamentId, scopeClubId],
  );

  const toggleMember = useCallback(
    (memberId: string) => {
      if (!onMemberChange) return;
      const next = new Set(selectedMembers);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      onMemberChange(Array.from(next));
    },
    [onMemberChange, selectedMembers],
  );

  const toggleClubWithMembers = useCallback(
    (club: ScopeTreeClub) => {
      const clubSelected = selectedClubs.has(club.clubId);
      onChange(toggleClub(club.clubId, selectedClubs));
      if (!onMemberChange) return;
      // When a whole club is ticked/unticked, also tick/untick all of its loaded members.
      const members = clubMembers.get(club.clubId) || [];
      const next = new Set(selectedMembers);
      members.forEach((m) => {
        if (!clubSelected) next.add(m.member_id);
        else next.delete(m.member_id);
      });
      onMemberChange(Array.from(next));
    },
    [onChange, onMemberChange, selectedClubs, selectedMembers, clubMembers],
  );

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

      <div className="max-h-96 overflow-y-auto rounded-md border divide-y">
        {tree.map((group) => {
          const state = associationTickState(group, selectedClubs);
          return (
            <Collapsible key={group.associationId || group.associationName} defaultOpen>
              <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/40">
                <Checkbox
                  checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
                  onCheckedChange={() => onChange(toggleAssociation(group, selectedClubs))}
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
                <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {group.clubs.reduce((n, c) => n + c.emailCount, 0)} of {group.memberCount} with email
                </span>
              </div>
              <CollapsibleContent>
                {group.clubs.map((club) => {
                  const expanded = expandedClubs.has(club.clubId);
                  const members = clubMembers.get(club.clubId) || [];
                  const isLoading = loadingClubs.has(club.clubId);
                  const err = clubErrors.get(club.clubId);
                  const selectedMemberCount = members.filter((m) => selectedMembers.has(m.member_id)).length;
                  return (
                    <div key={club.clubId} className="border-t first:border-t-0">
                      <div className="flex items-center gap-2 px-2 py-1.5 pl-8 text-[13px] hover:bg-muted/30">
                        <Checkbox
                          checked={selectedClubs.has(club.clubId)}
                          onCheckedChange={() => toggleClubWithMembers(club)}
                          aria-label={`Select all members of ${club.clubName}`}
                        />
                        <button
                          type="button"
                          onClick={() => toggleExpand(club)}
                          className="flex flex-1 items-center gap-1.5 text-left"
                          disabled={!club.hasMembers}
                        >
                          {club.hasMembers ? (
                            expanded ? (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )
                          ) : (
                            <span className="w-3.5" />
                          )}
                          <span className="truncate">
                            {club.clubName}
                            {club.isOwnClub && (
                              <Badge variant="outline" className="ml-1.5 text-[10px]">
                                Your club
                              </Badge>
                            )}
                          </span>
                        </button>
                        <span className="text-[12px] text-muted-foreground">
                          <span className={club.emailCount === 0 ? "text-amber-600 dark:text-amber-500" : undefined}>
                            {club.emailCount} of {club.memberCount} with email
                          </span>
                          {club.registeredCount > 0 ? ` · ${club.registeredCount} entered` : ""}
                          {selectedMemberCount > 0 && (
                            <span className="ml-1 text-primary">· {selectedMemberCount} picked</span>
                          )}
                        </span>
                      </div>
                      {expanded && (
                        <div className="pl-14 pr-2 pb-1.5 space-y-0.5">
                          {isLoading && (
                            <p className="text-[11px] text-muted-foreground py-1">Loading members…</p>
                          )}
                          {err && (
                            <p className="text-[11px] text-destructive py-1">{err}</p>
                          )}
                          {!isLoading && !err && members.length === 0 && (
                            <p className="text-[11px] text-muted-foreground py-1">
                              No email-reachable members in this club.
                            </p>
                          )}
                          {!isLoading &&
                            !err &&
                            members.map((p) => (
                              <label
                                key={p.member_id}
                                className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-muted/20 rounded px-1 py-0.5"
                              >
                                <Checkbox
                                  checked={selectedMembers.has(p.member_id)}
                                  onCheckedChange={() => toggleMember(p.member_id)}
                                />
                                <span
                                  className={cn("truncate", p.is_user && "text-primary font-medium")}
                                >
                                  {p.display_name}
                                  {p.is_user && (
                                    <span
                                      className="text-primary ml-0.5"
                                      title="Already has a SquashHub login"
                                    >
                                      *
                                    </span>
                                  )}
                                </span>
                                {p.gender && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">{p.gender}</span>
                                )}
                                {typeof p.ladder_position === "number" && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    #{p.ladder_position}
                                  </span>
                                )}
                                {p.invite_status && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    ({p.invite_status})
                                  </span>
                                )}
                              </label>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

// Simple cn helper to avoid an extra import for this component.
function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default InviteScopeTree;

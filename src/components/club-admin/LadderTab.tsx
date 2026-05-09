import { useCallback, useEffect, useMemo, useState } from "react";
import { useClubMembers } from "@/hooks/use-club";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { GripVertical, Loader2, Save, X, Users, Search, ArrowRightLeft, Trophy } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { rpcExt } from "@/lib/supabase-ext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  plays_league: boolean;
  enable_league_association_id: string | null;
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

interface LeagueOption {
  id: string;
  name: string;
  abbreviation: string | null;
  fee_annual: number;
}

function DraggablePlayerRow({
  player,
  index,
  total,
  onMoveTo,
  leagues,
  currentAffiliations,
  onAllocated,
}: {
  player: LadderMember;
  index: number;
  total: number;
  onMoveTo: (playerId: string, targetIndex: number) => void;
  leagues: LeagueOption[];
  currentAffiliations: Set<string>;
  onAllocated: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [posInput, setPosInput] = useState(String(index + 1));
  const [leaguePopoverOpen, setLeaguePopoverOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allocating, setAllocating] = useState(false);

  useEffect(() => {
    setPosInput(String(index + 1));
  }, [index]);

  useEffect(() => {
    if (leaguePopoverOpen) setSelected(new Set(currentAffiliations));
  }, [leaguePopoverOpen, currentAffiliations]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const handleApply = () => {
    const n = parseInt(posInput, 10);
    if (!Number.isFinite(n) || n < 1 || n > total) {
      toast.error(`Position must be between 1 and ${total}`);
      return;
    }
    onMoveTo(player.id, n - 1);
    setPopoverOpen(false);
  };

  const toggleLeague = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAllocate = async () => {
    const newOnes = Array.from(selected).filter((id) => !currentAffiliations.has(id));
    const removed = Array.from(currentAffiliations).filter((id) => !selected.has(id));
    if (newOnes.length === 0 && removed.length === 0) {
      toast.info("No changes");
      return;
    }
    setAllocating(true);
    try {
      // Pause unticked affiliations (number is kept on file, never deleted).
      if (removed.length > 0) {
        const { error: deactErr } = await (supabase as any)
          .from("member_association_affiliations")
          .update({ active: false })
          .eq("club_member_id", player.id)
          .in("association_id", removed);
        if (deactErr) throw deactErr;

        // If the home-club's enable_league_association_id pointed at one we removed,
        // clear/repoint it so plays_league flag stays consistent.
        const stillTicked = Array.from(selected);
        const newEnabled = stillTicked.length > 0 ? stillTicked[0] : null;
        await (supabase as any)
          .from("club_members")
          .update({
            enable_league_association_id: newEnabled,
            plays_league: stillTicked.length > 0,
          })
          .eq("id", player.id);
      }

      let summary = "";
      if (newOnes.length > 0) {
        const { data, error } = await supabase.functions.invoke("admin-allocate-member-leagues", {
          body: { memberId: player.id, leagueAssociationIds: newOnes },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        const allocs = ((data as any)?.allocations || []) as Array<{ league: string; associationNumber: string | null; fee: number }>;
        summary = allocs
          .map((a) => `${a.league}${a.associationNumber ? ` #${a.associationNumber}` : ""}${a.fee ? ` · R${a.fee}` : ""}`)
          .join(", ");
      }

      const removedLabels = leagues
        .filter((l) => removed.includes(l.id))
        .map((l) => l.abbreviation || l.name)
        .join(", ");
      const parts: string[] = [];
      if (summary) parts.push(`allocated ${summary}`);
      if (removedLabels) parts.push(`paused ${removedLabels}`);
      toast.success(`${player.name}: ${parts.join("; ") || "done"}`);
      setLeaguePopoverOpen(false);
      onAllocated();
    } catch (e: any) {
      toast.error(e.message || "Failed to update leagues");
    } finally {
      setAllocating(false);
    }
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
          {currentAffiliations.size > 0 && (
            <p className="text-[10px] text-muted-foreground truncate">
              {leagues
                .filter((l) => currentAffiliations.has(l.id))
                .map((l) => l.abbreviation || l.name)
                .join(" · ")}
            </p>
          )}
        </div>

        {leagues.length > 0 && (
          <Popover open={leaguePopoverOpen} onOpenChange={setLeaguePopoverOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-[11px]">
                <Trophy className="w-3 h-3" />
                Leagues
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3 space-y-2">
              <p className="text-xs font-semibold">Manage league participation</p>
              <p className="text-[10px] text-muted-foreground">
                Tick to allocate a league number and bill the affiliation fee. Untick to pause —
                the number stays on file and reactivates when re-ticked.
              </p>
              <div className="space-y-1.5 pt-1">
                {leagues.map((l) => {
                  const already = currentAffiliations.has(l.id);
                  return (
                    <label
                      key={l.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:bg-muted",
                        already && "bg-muted/40"
                      )}
                    >
                      <Checkbox
                        checked={selected.has(l.id)}
                        onCheckedChange={() => toggleLeague(l.id)}
                      />
                      <span className="flex-1 font-medium">
                        {l.name}
                        {l.abbreviation ? ` (${l.abbreviation})` : ""}
                      </span>
                      <span className="text-muted-foreground">
                        {already ? "Active" : l.fee_annual > 0 ? `R${l.fee_annual}` : "Free"}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleAllocate} disabled={allocating} className="flex-1 h-8 text-xs gap-1">
                  {allocating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Apply
                </Button>
                <Button size="sm" variant="outline" onClick={() => setLeaguePopoverOpen(false)} className="h-8 text-xs">
                  Cancel
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}

        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-[11px]">
              <ArrowRightLeft className="w-3 h-3" />
              Move
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-3 space-y-2">
            <p className="text-xs font-semibold">Move to position</p>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={total}
                value={posInput}
                onChange={(e) => setPosInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
                className="h-8 text-xs"
                autoFocus
              />
              <Button size="sm" onClick={handleApply} className="h-8 text-xs">Apply</Button>
            </div>
            <p className="text-[10px] text-muted-foreground">1 – {total}. Remember to Save.</p>
          </PopoverContent>
        </Popover>
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
  searchQuery: string;
  leagues: LeagueOption[];
  affiliationsByMember: Map<string, Set<string>>;
  onAllocated: () => void;
}

function GenderLadder({ title, players, order, setOrder, genderFilter, saving, onSave, searchQuery, leagues, affiliationsByMember, onAllocated }: GenderLadderProps) {
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
            {list.map((player, index) => {
              const q = searchQuery.trim().toLowerCase();
              if (q && !player.name.toLowerCase().includes(q)) return null;
              // Source of truth = member_association_affiliations only.
              // The legacy enable_league_association_id column is set by the
              // onboarding wizard's "interest" toggle and does NOT mean the
              // member is actually affiliated — using it caused the ladder to
              // show NIL/LS badges on members who were never allocated.
              const currentAffiliations = new Set(affiliationsByMember.get(player.id) ?? []);
              return (
                <DraggablePlayerRow
                  key={player.id}
                  player={player}
                  index={index}
                  total={list.length}
                  leagues={leagues}
                  currentAffiliations={currentAffiliations}
                  onAllocated={onAllocated}
                  onMoveTo={(playerId, targetIndex) => {
                    const fromIdx = list.findIndex((p) => p.id === playerId);
                    if (fromIdx === -1 || fromIdx === targetIndex) return;
                    setOrder(arrayMove(list, fromIdx, targetIndex));
                  }}
                />
              );
            })}
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
  const [mixedOrder, setMixedOrder] = useState<LadderMember[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Load mixed_ladder_enabled flag
  const { data: clubFlags } = useQuery({
    queryKey: ["club-ladder-flags", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("mixed_ladder_enabled")
        .eq("id", clubId)
        .maybeSingle();
      if (error) throw error;
      return data as { mixed_ladder_enabled: boolean } | null;
    },
    enabled: !!clubId,
  });
  const mixedEnabled = !!clubFlags?.mixed_ladder_enabled;

  // Load club's league associations (LS, NIL, ...)
  const { data: leagues = [] } = useQuery({
    queryKey: ["club-league-associations", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_associations")
        .select("id, name, abbreviation, fee_annual, active")
        .eq("club_id", clubId)
        .eq("active", true);
      if (error) throw error;
      return ((data || []) as any[]).map((l) => ({
        id: l.id as string,
        name: l.name as string,
        abbreviation: (l.abbreviation as string) || null,
        fee_annual: Number(l.fee_annual || 0),
      })) as LeagueOption[];
    },
    enabled: !!clubId,
  });

  // Load existing affiliations for this club's members
  const memberIds = useMemo(() => members.map((m: any) => m.id), [members]);
  const { data: affiliations = [], refetch: refetchAffiliations } = useQuery({
    queryKey: ["club-member-affiliations", clubId, memberIds.length],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data, error } = await supabase
        .from("member_association_affiliations")
        .select("club_member_id, association_id, active")
        .in("club_member_id", memberIds)
        .eq("active", true);
      if (error) throw error;
      return (data || []) as Array<{ club_member_id: string; association_id: string; active: boolean }>;
    },
    enabled: !!clubId && memberIds.length > 0,
  });

  const affiliationsByMember = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of affiliations) {
      if (!map.has(a.club_member_id)) map.set(a.club_member_id, new Set());
      map.get(a.club_member_id)!.add(a.association_id);
    }
    return map;
  }, [affiliations]);

  // ---- Fetch league registrations so we can sort by league strength ----
  // Lower league number = stronger (1st League beats 2nd League, etc.).
  // Members not registered in any league sort to the bottom.
  const { data: leagueRankByMember = new Map<string, number>() } = useQuery({
    queryKey: ["club-member-league-rank", clubId, memberIds.length],
    queryFn: async () => {
      const map = new Map<string, number>();
      if (memberIds.length === 0) return map;
      // Fetch leagues for the club to map id -> rank-number parsed from name
      const { data: lgs } = await supabase
        .from("leagues")
        .select("id, name")
        .eq("club_id", clubId);
      const leagueRank = new Map<string, number>();
      ((lgs || []) as Array<{ id: string; name: string }>).forEach((l) => {
        const m = (l.name || "").match(/(\d+)/);
        leagueRank.set(l.id, m ? parseInt(m[1], 10) : 999);
      });
      const leagueIds = Array.from(leagueRank.keys());
      if (leagueIds.length === 0) return map;
      const { data: regs } = await supabase
        .from("member_league_registrations")
        .select("club_member_id, league_id")
        .in("club_member_id", memberIds)
        .in("league_id", leagueIds);
      ((regs || []) as Array<{ club_member_id: string; league_id: string }>).forEach((r) => {
        const rank = leagueRank.get(r.league_id) ?? 999;
        const prev = map.get(r.club_member_id);
        if (prev === undefined || rank < prev) map.set(r.club_member_id, rank);
      });
      return map;
    },
    enabled: !!clubId && memberIds.length > 0,
  });

  const handleAllocated = useCallback(() => {
    refetchAffiliations();
    queryClient.invalidateQueries({ queryKey: ["club-members"] });
  }, [refetchAffiliations, queryClient]);


  const toggleMixed = async (next: boolean) => {
    const { error: err } = await supabase
      .from("clubs")
      .update({ mixed_ladder_enabled: next } as any)
      .eq("id", clubId);
    if (err) {
      toast.error(err.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["club-ladder-flags", clubId] });
    queryClient.invalidateQueries({ queryKey: ["club-by-subdomain"] });
    queryClient.invalidateQueries({ queryKey: ["my-club"] });
    setMenOrder(null);
    setLadiesOrder(null);
    setMixedOrder(null);
    toast.success(next ? "Mixed ladder enabled" : "Separate ladders enabled");
  };

  const allMembers = useMemo(
    () =>
      members.map((m: any) => ({
        id: m.id,
        name: m.name || m.profiles?.name || m.email || "Unknown",
        avatar_url: m.profiles?.avatar_url || null,
        gender: m.gender || null,
        ladder_position: m.ladder_position ?? null,
        plays_league: !!m.plays_league,
        enable_league_association_id: m.enable_league_association_id || null,
      })),
    [members]
  );

  const sortByLadder = useCallback(
    (a: LadderMember, b: LadderMember) => {
      // Primary sort: league strength (1st League first, then 2nd, etc.)
      const ar = (leagueRankByMember as Map<string, number>).get(a.id) ?? 9999;
      const br = (leagueRankByMember as Map<string, number>).get(b.id) ?? 9999;
      if (ar !== br) return ar - br;
      // Secondary: existing ladder_position (nulls last)
      if (a.ladder_position != null && b.ladder_position != null)
        return a.ladder_position - b.ladder_position;
      if (a.ladder_position != null) return -1;
      if (b.ladder_position != null) return 1;
      return a.name.localeCompare(b.name);
    },
    [leagueRankByMember]
  );

  const menMembers = useMemo(
    () => allMembers.filter((m) => !isLadiesGender(m.gender)).sort(sortByLadder),
    [allMembers, sortByLadder]
  );

  const ladiesMembers = useMemo(
    () => allMembers.filter((m) => isLadiesGender(m.gender)).sort(sortByLadder),
    [allMembers, sortByLadder]
  );

  const mixedMembersList = useMemo(
    () => [...allMembers].sort(sortByLadder),
    [allMembers, sortByLadder]
  );

  useEffect(() => {
    setMenOrder(null);
    setLadiesOrder(null);
    setMixedOrder(null);
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
        else if (genderFilter === "female") setLadiesOrder(null);
        else setMixedOrder(null);
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
      <Card className="p-3 flex items-center gap-3">
        <Users className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Mixed ladder</p>
          <p className="text-xs text-muted-foreground">
            Combine all members into a single ladder instead of separate Men's and Ladies' ladders.
          </p>
        </div>
        <Switch checked={mixedEnabled} onCheckedChange={toggleMixed} />
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search members..."
          className="pl-9 h-9"
        />
      </div>

      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
        Drag members into the desired order, then save.
      </p>
      <p className="md:hidden text-xs text-muted-foreground italic -mt-4">
        On mobile: press &amp; hold the grip handle, then drag.
      </p>

      {mixedEnabled ? (
        <div className="grid grid-cols-1 gap-6">
          <GenderLadder
            title="Club Ladder"
            players={mixedMembersList}
            order={mixedOrder}
            setOrder={setMixedOrder}
            genderFilter="mixed"
            saving={saving}
            onSave={handleSave}
            searchQuery={searchQuery}
            leagues={leagues}
            affiliationsByMember={affiliationsByMember}
            onAllocated={handleAllocated}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GenderLadder
            title="Men's Ladder"
            players={menMembers}
            order={menOrder}
            setOrder={setMenOrder}
            genderFilter="male"
            saving={saving}
            onSave={handleSave}
            searchQuery={searchQuery}
            leagues={leagues}
            affiliationsByMember={affiliationsByMember}
            onAllocated={handleAllocated}
          />
          <GenderLadder
            title="Ladies' Ladder"
            players={ladiesMembers}
            order={ladiesOrder}
            setOrder={setLadiesOrder}
            genderFilter="female"
            saving={saving}
            onSave={handleSave}
            searchQuery={searchQuery}
            leagues={leagues}
            affiliationsByMember={affiliationsByMember}
            onAllocated={handleAllocated}
          />
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLeagueAssociations, useLeagues, useClubMembers, LeagueAssociation, League, ClubMember, SKILL_LEVELS, getSkillOrder, getSkillLabel } from "@/hooks/use-club";
import { useLadder } from "@/hooks/use-data";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Users, X, ChevronDown, ChevronUp, Crown, RefreshCw, Pencil, Check, Loader2, CalendarDays, Search } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StepByStepLeagueSetup } from "./StepByStepLeagueSetup";
import { AddReservesDialog } from "./AddReservesDialog";
import { UserPlus } from "lucide-react";
import { TeamLogoUpload } from "@/components/league-games/TeamLogoUpload";
import { TeamLogo } from "@/components/league-games/TeamLogo";

const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function FillTopDownSettings({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { data: club } = useQuery({
    queryKey: ["club-fill-settings", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clubs").select("fill_top_down_enabled, league_week_start_dow, fill_up_leagues_enabled").eq("id", clubId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clubId,
  });

  const update = async (patch: { fill_top_down_enabled?: boolean; league_week_start_dow?: number; fill_up_leagues_enabled?: boolean }) => {
    const { error } = await supabase.from("clubs").update(patch).eq("id", clubId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["club-fill-settings", clubId] });
    qc.invalidateQueries({ queryKey: ["club-league-settings", clubId] });
    toast.success("Saved");
  };

  const fillUpEnabled = club?.fill_up_leagues_enabled ?? true;

  return (
    <Card className="p-3 mt-2 space-y-3">
      {/* Show / hide the Fill Up Leagues tab entirely for this club's captains */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium">Show "Fill Up Leagues" tab in League Games</div>
          <p className="text-xs text-muted-foreground mt-1">
            When on, your captains see the weekly Fill Up Leagues drag-and-drop board in League Games.
            Turn off if your club doesn't do weekly team planning (e.g. NIL / Lowveld style) — captains then place players directly on the scorecard instead.
          </p>
        </div>
        <Switch
          checked={fillUpEnabled}
          onCheckedChange={(v) => update({ fill_up_leagues_enabled: v })}
        />
      </div>

      {fillUpEnabled && (
        <div className="pt-3 border-t border-border space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={!!club?.fill_top_down_enabled}
                onCheckedChange={(v) => update({ fill_top_down_enabled: !!v })}
              />
              <span className="text-sm font-medium">Fill up league teams from top down</span>
            </label>
            {club?.fill_top_down_enabled && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Squash week starts:</span>
                <Select
                  value={String(club?.league_week_start_dow ?? 3)}
                  onValueChange={(v) => update({ league_week_start_dow: Number(v) })}
                >
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOW_LABELS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, captains use <strong>Fill Up Leagues</strong> to assign players top-down. Excess players cascade to the next league. The ±2 position rule is enforced against the previous week's snapshot.
          </p>
          <p className="md:hidden text-xs text-muted-foreground rounded-md border border-border bg-muted/40 px-2.5 py-2">
            On mobile: weekly team planning happens in <strong>League Games → Fill Up Leagues</strong>. Press and hold a player for a moment, then drag. The admin <strong>Allocate</strong> dialog is still desktop-first.
          </p>
        </div>
      )}
    </Card>
  );
}

// ─── Types ───
interface LeaguePlayer {
  id: string;
  club_member_id: string;
  league_id: string;
  player_rank: number;
  is_captain: boolean;
  league_association_number?: string | null;
  member?: ClubMember;
}

interface LeagueWithPlayers extends League {
  players: LeaguePlayer[];
}

// ─── Main Tab ───
export function LeaguesTab({ clubId }: { clubId: string }) {
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: leagues = [] } = useLeagues(clubId);
  const { data: members = [] } = useClubMembers(clubId);
  const [addAssocOpen, setAddAssocOpen] = useState(false);
  const [editAssoc, setEditAssoc] = useState<LeagueAssociation | null>(null);
  const [addLeagueOpen, setAddLeagueOpen] = useState(false);
  const [stepByStepOpen, setStepByStepOpen] = useState(false);
  const [editSetup, setEditSetup] = useState<null | {
    associationId: string;
    gender: "men" | "ladies" | "mixed";
    leagueNumber: string;
    numTeams: number;
    perTeam: number;
    reserves: number;
    teamNames: Record<number, string>;
    reservesName: string;
  }>(null);
  const [allocateGroup, setAllocateGroup] = useState<{ associationId: string | null; gender: "men" | "ladies" | "mixed"; leagues: League[] } | null>(null);
  const [reservesGroup, setReservesGroup] = useState<{ associationId: string | null; gender: "men" | "ladies" | "mixed"; leagues: League[] } | null>(null);
  const qc = useQueryClient();

  const handleDeleteAssoc = async (id: string) => {
    if (!confirm("Delete this association?")) return;
    const { error } = await fromExt("league_associations").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["league-associations"] }); qc.invalidateQueries({ queryKey: ["league-associations-linked"] }); }
  };

  const openEditSetup = async (assocId: string | null, gender: "men" | "ladies" | "mixed", groupLeagues: League[]) => {
    if (!assocId) { toast.error("Edit Setup requires an association"); return; }
    if (groupLeagues.length === 0) return;
    // Detect league number from first non-reserves league
    const teamLeagues = groupLeagues.filter(l => !/reserves?/i.test(l.name));
    const reservesLeague = groupLeagues.find(l => /reserves?/i.test(l.name));
    const numTeams = teamLeagues.length || groupLeagues.length;
    const ordMatch = teamLeagues[0]?.name.match(/(\d+(?:st|nd|rd|th))/i);
    const leagueNumber = ordMatch ? ordMatch[1] : "1st";
    // Pull team names (strip the "Men's 1st " prefix)
    const teamNames: Record<number, string> = {};
    const stripPrefix = (n: string) => n.replace(/^(Men's|Ladies|Mixed)\s+\d+(?:st|nd|rd|th)\s*/i, "");
    teamLeagues.forEach((l, i) => {
      const tail = stripPrefix(l.name).trim();
      // Treat single-letter A/B/C as default — leave blank
      if (tail && !/^[A-Z]$/.test(tail)) teamNames[i] = tail;
    });
    const reservesName = reservesLeague ? (() => {
      const tail = stripPrefix(reservesLeague.name).trim();
      return /^reserves?$/i.test(tail) ? "" : tail;
    })() : "";
    // perTeam: max regs across team leagues; reserves: regs in reserves league
    let perTeam = (groupLeagues[0] as any)?.reserves_per_team != null ? 4 : 4;
    let reservesCount = 0;
    try {
      const teamIds = teamLeagues.map(l => l.id);
      if (teamIds.length > 0) {
        // Prefer league_rules.team_size (the saved league rule) over registration counts.
        const { data: rules } = await fromExt("league_rules").select("team_size").in("league_id", teamIds);
        const ruleSizes = (rules || []).map((r: any) => r.team_size).filter((n: any) => typeof n === "number" && n > 0);
        if (ruleSizes.length > 0) {
          perTeam = Math.max(...ruleSizes);
        } else {
          const { data: regs } = await fromExt("member_league_registrations").select("league_id").in("league_id", teamIds);
          const counts = new Map<string, number>();
          (regs || []).forEach((r: any) => counts.set(r.league_id, (counts.get(r.league_id) || 0) + 1));
          const max = Math.max(0, ...Array.from(counts.values()));
          if (max > 0) perTeam = max;
        }
      }
      if (reservesLeague) {
        const { data: rRegs } = await fromExt("member_league_registrations").select("id").eq("league_id", reservesLeague.id);
        reservesCount = (rRegs || []).length;
      }
    } catch (e: any) {
      // non-fatal — fall back to defaults
    }
    setEditSetup({
      associationId: assocId,
      gender,
      leagueNumber,
      numTeams,
      perTeam,
      reserves: reservesCount,
      teamNames,
      reservesName,
    });
  };

  const handleDeleteLeague = async (id: string) => {
    if (!confirm("Delete this league?")) return;
    const { error } = await fromExt("leagues").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }

    // Renumber codes for remaining leagues in the same gender group
    const deleted = leagues.find(l => l.id === id);
    if (deleted?.code) {
      const prefix = deleted.code.replace(/\d+$/, ""); // e.g. "WCS"
      const isMen = deleted.name.toLowerCase().includes("men's") || deleted.name.toLowerCase().startsWith("men");
      const isLadies = deleted.name.toLowerCase().includes("ladies") || deleted.name.toLowerCase().includes("women");

      const sameGroup = leagues
        .filter(l => l.id !== id && l.code?.startsWith(prefix))
        .filter(l => {
          const lName = l.name.toLowerCase();
          if (isMen) return lName.includes("men's") || lName.startsWith("men");
          if (isLadies) return lName.includes("ladies") || lName.includes("women");
          return false;
        })
        .sort((a, b) => {
          const numA = parseInt(a.name.match(/(\d+)/)?.[1] || "99");
          const numB = parseInt(b.name.match(/(\d+)/)?.[1] || "99");
          return numA - numB;
        });

      // Renumber from 001
      for (let i = 0; i < sameGroup.length; i++) {
        const newCode = `${prefix}${String(i + 1).padStart(3, "0")}`;
        if (sameGroup[i].code !== newCode) {
          await fromExt("leagues").update({ code: newCode }).eq("id", sameGroup[i].id);
        }
      }
    }

    toast.success("Deleted & codes renumbered");
    qc.invalidateQueries({ queryKey: ["leagues"] });
  };

  const handleDeleteGroup = async (groupLeagues: League[], label: string) => {
    if (groupLeagues.length === 0) return;
    if (!confirm(`Delete ALL ${groupLeagues.length} ${label} league teams? This cannot be undone.`)) return;
    const ids = groupLeagues.map(l => l.id);
    const { error } = await fromExt("leagues").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`Deleted ${groupLeagues.length} league teams`);
    qc.invalidateQueries({ queryKey: ["leagues"] });
  };

  const menLeagues = leagues.filter(l => l.name.toLowerCase().includes("men's") || l.name.toLowerCase().startsWith("men"));
  const ladiesLeagues = leagues.filter(l => l.name.toLowerCase().includes("ladies") || l.name.toLowerCase().includes("women"));
  const mixedLeagues = leagues.filter(l => {
    const n = l.name.toLowerCase();
    return n.includes("mixed") && !menLeagues.includes(l) && !ladiesLeagues.includes(l);
  });
  const otherLeagues = leagues.filter(l => !menLeagues.includes(l) && !ladiesLeagues.includes(l) && !mixedLeagues.includes(l));

  const sortLeagues = (list: League[]) =>
    [...list].sort((a, b) => {
      const numA = parseInt(a.name.match(/(\d+)/)?.[1] || "99");
      const numB = parseInt(b.name.match(/(\d+)/)?.[1] || "99");
      return numA - numB;
    });

  return (
    <div className="space-y-6 mt-4">
      {/* Associations */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold">League Associations</h3>
            <p className="text-xs text-muted-foreground">Fee settings are managed in the Fees tab</p>
          </div>
          <AssociationDialog clubId={clubId} open={addAssocOpen} onOpenChange={setAddAssocOpen} />
        </div>
        <div className="space-y-2">
          {associations.map((a: any) => (
            <Card key={a.id} className="p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <p className="font-medium truncate">{a.name} {a.abbreviation ? `(${a.abbreviation})` : ""}</p>
                {a.platform_association_id && (
                  <Badge variant="secondary" className="text-[10px] h-5 flex-shrink-0">Platform</Badge>
                )}
                <Badge
                  variant={a.scope === "internal" ? "outline" : "default"}
                  className="text-[10px] h-5 flex-shrink-0"
                >
                  {a.scope === "internal" ? "Internal" : "Regional"}
                </Badge>
                {a.external_source === "nsa" && (
                  <Badge variant="outline" className="text-[10px] h-5 flex-shrink-0 border-emerald-300 text-emerald-700">NSA Live</Badge>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {a.scope === "internal" && (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/league-games?tab=rounds&assoc=${a.id}`}>
                      <CalendarDays className="w-4 h-4 mr-1" />Create Rounds & Fixtures
                    </Link>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditAssoc(a)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => handleDeleteAssoc(a.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
          {associations.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No associations added yet</p>}
        </div>
        <FillTopDownSettings clubId={clubId} />
      </div>

      {/* Leagues in two columns with inline players */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-semibold">Leagues</h3>
          <div className="flex gap-2 flex-wrap">
            <LeagueDialog clubId={clubId} associations={associations} open={addLeagueOpen} onOpenChange={setAddLeagueOpen} />
            <Button size="sm" variant="outline" onClick={() => setStepByStepOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />Step by Step League Setup
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GenderColumn
            title="Men's"
            gender="men"
            leagues={menLeagues}
            associations={associations}
            members={members}
            sortLeagues={sortLeagues}
            onDelete={handleDeleteLeague}
            onDeleteGroup={handleDeleteGroup}
            onAllocate={(assocId, list) => setAllocateGroup({ associationId: assocId, gender: "men", leagues: list })}
            onAddReserves={(assocId, list) => setReservesGroup({ associationId: assocId, gender: "men", leagues: list })}
            onEditSetup={(assocId, list) => openEditSetup(assocId, "men", list)}
          />
          <GenderColumn
            title="Ladies"
            gender="ladies"
            leagues={ladiesLeagues}
            associations={associations}
            members={members}
            sortLeagues={sortLeagues}
            onDelete={handleDeleteLeague}
            onDeleteGroup={handleDeleteGroup}
            onAllocate={(assocId, list) => setAllocateGroup({ associationId: assocId, gender: "ladies", leagues: list })}
            onAddReserves={(assocId, list) => setReservesGroup({ associationId: assocId, gender: "ladies", leagues: list })}
            onEditSetup={(assocId, list) => openEditSetup(assocId, "ladies", list)}
          />
          <GenderColumn
            title="Mixed"
            gender="mixed"
            leagues={mixedLeagues}
            associations={associations}
            members={members}
            sortLeagues={sortLeagues}
            onDelete={handleDeleteLeague}
            onDeleteGroup={handleDeleteGroup}
            onAllocate={(assocId, list) => setAllocateGroup({ associationId: assocId, gender: "mixed", leagues: list })}
            onAddReserves={(assocId, list) => setReservesGroup({ associationId: assocId, gender: "mixed", leagues: list })}
            onEditSetup={(assocId, list) => openEditSetup(assocId, "mixed", list)}
          />
        </div>

        {otherLeagues.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="text-sm font-semibold text-muted-foreground">Other ({otherLeagues.length})</h4>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setAllocateGroup({ associationId: null, gender: "mixed", leagues: sortLeagues(otherLeagues) })}
              >
                <Users className="w-3.5 h-3.5" />Allocate
              </Button>
            </div>
            <LeagueNumberSubGroups
              groupLeagues={sortLeagues(otherLeagues)}
              associations={associations}
              members={members}
              onDelete={handleDeleteLeague}
            />
          </div>
        )}
      </div>

      {/* Allocate Players Dialog (per association+gender group) */}
      {allocateGroup && (
        <AllocatePlayersDialog
          gender={allocateGroup.gender}
          leagues={allocateGroup.leagues}
          members={members}
          clubId={clubId}
          open={!!allocateGroup}
          onOpenChange={(o) => !o && setAllocateGroup(null)}
        />
      )}

      {reservesGroup && (
        <AddReservesDialog
          clubId={clubId}
          associationId={reservesGroup.associationId}
          gender={reservesGroup.gender}
          groupLeagues={reservesGroup.leagues}
          open={!!reservesGroup}
          onOpenChange={(o) => !o && setReservesGroup(null)}
        />
      )}

      <StepByStepLeagueSetup
        clubId={clubId}
        open={stepByStepOpen || !!editSetup}
        onOpenChange={(o) => { if (!o) { setStepByStepOpen(false); setEditSetup(null); } else setStepByStepOpen(true); }}
        editContext={editSetup}
      />

      {/* Edit Association Dialog */}
      {editAssoc && (
        <EditAssociationDialog
          association={editAssoc}
          open={!!editAssoc}
          onOpenChange={(o) => !o && setEditAssoc(null)}
        />
      )}
    </div>
  );
}

// ─── Gender Column: groups leagues by association, one Allocate button per association group ───
function GenderColumn({ title, gender, leagues, associations, members, sortLeagues, onDelete, onDeleteGroup, onAllocate, onAddReserves, onEditSetup }: {
  title: string;
  gender: "men" | "ladies" | "mixed";
  leagues: League[];
  associations: LeagueAssociation[];
  members: ClubMember[];
  sortLeagues: (list: League[]) => League[];
  onDelete: (id: string) => void;
  onDeleteGroup: (groupLeagues: League[], label: string) => void;
  onAllocate: (associationId: string | null, leagues: League[]) => void;
  onAddReserves: (associationId: string | null, leagues: League[]) => void;
  onEditSetup: (associationId: string | null, leagues: League[]) => void;
}) {
  // Group leagues by association_id
  const groups = useMemo(() => {
    const map = new Map<string | null, League[]>();
    for (const l of leagues) {
      const key = (l as any).association_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return Array.from(map.entries()).map(([assocId, list]) => ({
      assocId,
      assoc: associations.find(a => a.id === assocId) || null,
      leagues: sortLeagues(list),
    }));
  }, [leagues, associations, sortLeagues]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-muted-foreground">{title} ({leagues.length})</h4>
      </div>
      <div className="space-y-3">
        {groups.map(g => (
          <div key={g.assocId ?? "none"} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-foreground/80 truncate">
                {g.assoc ? (g.assoc.abbreviation || g.assoc.name) : "No association"}
                <span className="text-muted-foreground font-normal"> • {g.leagues.length}</span>
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1 px-2" onClick={() => onEditSetup(g.assocId, g.leagues)} title="Edit Step-by-Step setup for this group">
                  <Pencil className="w-3 h-3" />Edit setup
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1 px-2" onClick={() => onAllocate(g.assocId, g.leagues)}>
                  <Users className="w-3 h-3" />Allocate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] gap-1 px-2"
                  onClick={() => onAddReserves(g.assocId, g.leagues)}
                  title="Add reserve players to this league group"
                >
                  <UserPlus className="w-3 h-3" />Add reserves
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] gap-1 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onDeleteGroup(g.leagues, `${title} • ${g.assoc ? (g.assoc.abbreviation || g.assoc.name) : "No association"}`)}
                  title="Delete all teams in this group"
                >
                  <Trash2 className="w-3 h-3" />Delete all
                </Button>
              </div>
            </div>
            <LeagueNumberSubGroups
              groupLeagues={g.leagues}
              associations={associations}
              members={members}
              onDelete={onDelete}
            />

          </div>
        ))}
        {leagues.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No {title.toLowerCase()} leagues</p>}
      </div>
    </div>
  );
}

// ─── Sub-groups leagues by league number (1st, 2nd, …) within an association group ───
function LeagueNumberSubGroups({ groupLeagues, associations, members, onDelete }: {
  groupLeagues: League[];
  associations: LeagueAssociation[];
  members: ClubMember[];
  onDelete: (id: string) => void;
}) {
  // Determine each league's "level" (1st / 2nd / 3rd / …).
  // Priority:
  //   1. Tier derived from actual fixtures (round name like "1st League round 1") —
  //      this is the source of truth that the Standings view also uses.
  //   2. Ordinal in the team's own name ("Men's 2nd Eagles").
  //   3. Infer from the team's code position vs reserves anchors:
  //      sort all teams in this group by code, then every team is assigned to the
  //      next reserves row's ordinal (NIL002–006 → 1st because NIL007 is "1st L Reserves").
  //   4. Fallback "Other".

  // Resolve fixture-based tier per team_code, scoped to this association group.
  const assocId = groupLeagues[0]?.association_id || null;
  const { data: platformAssocId } = useQuery({
    queryKey: ["leagues-subgroup-platform-assoc", assocId],
    enabled: !!assocId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("league_associations")
        .select("platform_association_id")
        .eq("id", assocId!)
        .maybeSingle();
      return ((data as any)?.platform_association_id as string | null) ?? assocId;
    },
  });
  const { data: fixtureTierByCode } = useQuery({
    queryKey: ["leagues-subgroup-fixture-tiers", assocId, platformAssocId],
    enabled: !!assocId && !!platformAssocId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data: rounds } = await supabase
        .from("league_rounds")
        .select("id, name")
        .eq("association_id", assocId!);
      const roundTier = new Map<string, string>();
      (rounds || []).forEach((r: any) => {
        const tier = String(r.name || "")
          .replace(/\s+(round|week|wk|rd)\s*\d+\s*$/i, "")
          .trim();
        const m = tier.match(/(\d+(?:st|nd|rd|th))\s*League/i);
        if (m) roundTier.set(r.id, m[1]);
      });
      const roundIds = Array.from(roundTier.keys());
      if (roundIds.length === 0) return new Map<string, string>();
      const { data: fx } = await supabase
        .from("platform_league_fixtures")
        .select("round_id, home_team_code, away_team_code")
        .eq("association_id", platformAssocId!)
        .in("round_id", roundIds);
      // Tally tier votes per team_code; pick most frequent.
      const tally = new Map<string, Map<string, number>>();
      const bump = (code: string | null, tier: string) => {
        if (!code || code.startsWith("__")) return;
        if (!tally.has(code)) tally.set(code, new Map());
        const m = tally.get(code)!;
        m.set(tier, (m.get(tier) || 0) + 1);
      };
      (fx || []).forEach((f: any) => {
        const tier = roundTier.get(f.round_id);
        if (!tier) return;
        bump(f.home_team_code, tier);
        bump(f.away_team_code, tier);
      });
      const result = new Map<string, string>();
      tally.forEach((m, code) => {
        let bestTier = ""; let best = -1;
        m.forEach((n, t) => { if (n > best) { best = n; bestTier = t; } });
        if (bestTier) result.set(code, bestTier);
      });
      return result;
    },
  });

  const subGroups = useMemo(() => {
    const codeOf = (l: League) => String((l as any).code || "").toUpperCase();
    const sorted = [...groupLeagues].sort((a, b) => codeOf(a).localeCompare(codeOf(b)));
    const reservesAnchors: Array<{ idx: number; ord: string }> = [];
    sorted.forEach((l, i) => {
      if (/reserves?/i.test(l.name)) {
        const ord = l.name.match(/(\d+(?:st|nd|rd|th))/i)?.[1];
        if (ord) reservesAnchors.push({ idx: i, ord });
      }
    });
    const levelFor = (l: League, i: number): string => {
      // 1. Fixture-based tier (source of truth).
      const code = codeOf(l);
      const fromFx = fixtureTierByCode?.get(code);
      if (fromFx && !/reserves?/i.test(l.name)) return fromFx;
      // 2. Own name has ordinal?
      const own = l.name.match(/(\d+(?:st|nd|rd|th))/i)?.[1];
      if (own) return own;
      // 3. Nearest reserves anchor at or after this index.
      const next = reservesAnchors.find(a => a.idx >= i);
      if (next) return next.ord;
      // 4. After the last anchor → last anchor + 1.
      if (reservesAnchors.length > 0) {
        const lastOrd = reservesAnchors[reservesAnchors.length - 1].ord;
        const n = parseInt(lastOrd, 10);
        if (Number.isFinite(n)) {
          const next = n + 1;
          const suffix = next % 10 === 1 && next % 100 !== 11 ? "st"
            : next % 10 === 2 && next % 100 !== 12 ? "nd"
            : next % 10 === 3 && next % 100 !== 13 ? "rd"
            : "th";
          return `${next}${suffix}`;
        }
      }
      return "Other";
    };

    const map = new Map<string, League[]>();
    sorted.forEach((l, i) => {
      const isReserves = /reserves?/i.test(l.name);
      const ord = levelFor(l, i);
      const key = isReserves ? `${ord} Reserves` : (ord === "Other" ? "Other" : `${ord} League`);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    const ordNum = (k: string) => k === "Other" ? 9999 : parseInt(k.match(/\d+/)?.[0] || "9999", 10);
    return Array.from(map.entries())
      .map(([key, list]) => ({ key, list }))
      .sort((a, b) => {
        const an = ordNum(a.key); const bn = ordNum(b.key);
        if (an !== bn) return an - bn;
        const aRes = /reserves/i.test(a.key) ? 1 : 0;
        const bRes = /reserves/i.test(b.key) ? 1 : 0;
        return aRes - bRes;
      });
  }, [groupLeagues, fixtureTierByCode]);

  return (
    <div className="space-y-3">
      {subGroups.map(sg => (
        <SubGroupBlock
          key={sg.key}
          label={sg.key}
          leagues={sg.list}
          associations={associations}
          members={members}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function SubGroupBlock({ label, leagues, associations, members, onDelete }: {
  label: string;
  leagues: League[];
  associations: LeagueAssociation[];
  members: ClubMember[];
  onDelete: (id: string) => void;
}) {
  const qc = useQueryClient();
  const leagueIds = useMemo(() => leagues.map(l => l.id), [leagues]);
  const { data: rules = [] } = useQuery({
    queryKey: ["league-rules-subgroup", leagueIds.join(",")],
    enabled: leagueIds.length > 0,
    queryFn: async () => {
      const { data } = await fromExt("league_rules").select("league_id, team_size, points_per_game").in("league_id", leagueIds);
      return (data || []) as Array<{ league_id: string; team_size: number | null; points_per_game: number | null }>;
    },
  });

  const sizes = rules.map(r => r.team_size).filter((n): n is number => typeof n === "number" && n > 0);
  const uniformSize = sizes.length === leagueIds.length && new Set(sizes).size === 1 ? sizes[0] : null;
  const displaySize = uniformSize ?? (sizes.length > 0 ? `${Math.min(...sizes)}–${Math.max(...sizes)}` : "—");

  const ppgs = rules.map(r => r.points_per_game).filter((n): n is number => typeof n === "number" && n > 0);
  // If every team in the level has the same override, show it. If none have an override → "Default".
  // If mixed → show range.
  const uniformPpg = ppgs.length === leagueIds.length && new Set(ppgs).size === 1 ? ppgs[0] : null;
  const displayPpg: string | number =
    ppgs.length === 0 ? "Default"
    : uniformPpg ?? `${Math.min(...ppgs)}–${Math.max(...ppgs)}`;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number>(uniformSize ?? 4);
  const [ppgDraft, setPpgDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (uniformSize != null) setDraft(uniformSize); }, [uniformSize]);
  useEffect(() => {
    if (uniformPpg != null) setPpgDraft(String(uniformPpg));
    else if (ppgs.length === 0) setPpgDraft("");
  }, [uniformPpg, ppgs.length]);

  const save = async () => {
    const size = Math.max(1, Math.min(8, Math.floor(draft || 0)));
    // ppg: blank = inherit (null). Otherwise must be 5..21.
    let ppgValue: number | null = null;
    const trimmed = ppgDraft.trim();
    if (trimmed !== "") {
      const n = parseInt(trimmed, 10);
      if (!Number.isFinite(n) || n < 5 || n > 21) {
        toast.error("Points per game must be between 5 and 21 (or blank to inherit)");
        return;
      }
      ppgValue = n;
    }
    setSaving(true);
    try {
      const rows = leagues.map(l => ({
        league_id: l.id,
        club_id: (l as any).club_id,
        association_id: null, // per-league rule: scope CHECK requires association_id NULL when league_id set
        team_size: size,
        team_size_mode: "fixed" as const,
        points_per_game: ppgValue ?? null, // null = inherit from league/super-admin
      }));
      const { error } = await fromExt("league_rules").upsert(rows, { onConflict: "league_id" });
      if (error) throw error;
      toast.success(
        `${label}: ${size} players/match` +
        (ppgValue ? `, play to ${ppgValue}` : ", play to default")
      );
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["league-rules-subgroup", leagueIds.join(",")] });
      leagueIds.forEach(id => {
        qc.invalidateQueries({ queryKey: ["league-rules-team-size", id] });
        qc.invalidateQueries({ queryKey: ["league-rules-row", id] });
      });
    } catch (e: any) {
      toast.error(e?.message || "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 px-1 py-1 rounded bg-muted/40 border border-border/50">
        <p className="text-[11px] font-semibold">
          {label}
          <span className="text-muted-foreground font-normal"> • {leagues.length} team{leagues.length !== 1 ? "s" : ""}</span>
        </p>
        <div className="flex items-center gap-1 flex-wrap">
          {editing ? (
            <>
              <Label className="text-[10px] text-muted-foreground">Players/match</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={draft || ""}
                onChange={(e) => setDraft(parseInt(e.target.value) || 1)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
                className="h-6 text-xs w-12"
              />
              <Label className="text-[10px] text-muted-foreground ml-1">Play to</Label>
              <Input
                type="number"
                min={5}
                max={21}
                value={ppgDraft}
                placeholder="—"
                onChange={(e) => setPpgDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
                className="h-6 text-xs w-16"
                title="Blank = inherit association default (e.g. 11). Override e.g. 15."
              />
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={save} disabled={saving}>
                <Check className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)}>
                <X className="w-3 h-3" />
              </Button>
            </>
          ) : (
            <>
              <span className="text-[11px] text-muted-foreground">
                Players/match: <span className="font-semibold text-foreground">{displaySize}</span>
                <span className="mx-1.5">•</span>
                Play to: <span className="font-semibold text-foreground">{displayPpg}</span>
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Edit league rule (applies to all teams in this division)" onClick={() => setEditing(true)}>
                <Pencil className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {leagues.map(l => (
          <LeagueCard key={l.id} league={l} associations={associations} onDelete={onDelete} members={members} />
        ))}
      </div>
    </div>
  );
}


// ─── League Card with inline players ───
function LeagueCard({ league, associations, onDelete, members, onAllocate }: {
  league: League;
  associations: LeagueAssociation[];
  onDelete: (id: string) => void;
  members: ClubMember[];
  onAllocate?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(league.name);
  const [sizeDraft, setSizeDraft] = useState<number>(4);
  const [savingName, setSavingName] = useState(false);
  const qcRow = useQueryClient();
  const { data: regs = [] } = useQuery({
    queryKey: ["league-registrations", league.id],
    queryFn: async () => {
      const { data, error } = await fromExt("member_league_registrations")
        .select("*")
        .eq("league_id", league.id)
        .order("player_rank");
      if (error) throw error;
      return data || [];
    },
  });

  // Load the current saved "players per match" for this league
  const { data: currentTeamSize } = useQuery({
    queryKey: ["league-rules-team-size", league.id],
    queryFn: async () => {
      const { data } = await fromExt("league_rules").select("team_size").eq("league_id", league.id).maybeSingle();
      return (data as any)?.team_size ?? null;
    },
  });

  const getMemberName = (reg: any) => {
    const m = members.find(m => m.id === reg.club_member_id);
    return m?.name || m?.profiles?.name || "Unknown";
  };

  const openEdit = () => {
    setNameDraft(league.name);
    setSizeDraft(typeof currentTeamSize === "number" && currentTeamSize > 0 ? currentTeamSize : 4);
    setEditing(true);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    const size = Math.max(1, Math.min(8, Math.floor(sizeDraft || 0)));
    const nameChanged = trimmed && trimmed !== league.name;
    const sizeChanged = typeof currentTeamSize !== "number" || size !== currentTeamSize;
    if (!nameChanged && !sizeChanged) { setEditing(false); setNameDraft(league.name); return; }
    setSavingName(true);
    try {
      if (nameChanged) {
        const { data, error } = await fromExt("leagues")
          .update({ name: trimmed })
          .eq("id", league.id)
          .select("id, name");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Couldn't rename — you don't have permission to edit this league.");
      }
      if (sizeChanged) {
        const { error: ruleErr } = await fromExt("league_rules").upsert(
          {
            league_id: league.id,
            club_id: (league as any).club_id,
            association_id: null, // per-league rule: scope CHECK requires association_id NULL when league_id set
            team_size: size,
            team_size_mode: "fixed" as const,
          },
          { onConflict: "league_id" }
        );
        if (ruleErr) throw ruleErr;
      }
      toast.success(nameChanged && sizeChanged ? "Team renamed & size updated" : nameChanged ? "Team renamed" : "Players per match updated");
      setEditing(false);
      qcRow.invalidateQueries({ queryKey: ["leagues"] });
      qcRow.invalidateQueries({ queryKey: ["leagues-with-captain"] });
      qcRow.invalidateQueries({ queryKey: ["club-leagues-codes-assoc"] });
      qcRow.invalidateQueries({ queryKey: ["member-league-registrations"] });
      qcRow.invalidateQueries({ queryKey: ["league-registrations", league.id] });
      qcRow.invalidateQueries({ queryKey: ["league-rules-team-size", league.id] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSavingName(false);
    }
  };

  const assocForLeague = associations.find(a => a.id === league.association_id);
  const isInternalLeague = assocForLeague?.scope === "internal";

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1 flex-wrap">
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") { setEditing(false); setNameDraft(league.name); }
                }}
                className="h-7 text-sm flex-1 min-w-[140px]"
                placeholder="Team name"
              />
              <div className="flex items-center gap-1">
                <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Players/match</Label>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={sizeDraft || ""}
                  onChange={(e) => setSizeDraft(parseInt(e.target.value) || 1)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") { setEditing(false); setNameDraft(league.name); }
                  }}
                  className="h-7 text-sm w-14"
                />
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveName} disabled={savingName}>
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(false); setNameDraft(league.name); }}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <div className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
              <p className="font-medium text-sm truncate">{league.name} {league.code ? `(${league.code})` : ""}</p>
              <p className="text-xs text-muted-foreground">
                {associations.find(a => a.id === league.association_id)?.name || "No association"}
                {regs.length > 0 && ` • ${regs.length} player${regs.length !== 1 ? "s" : ""}`}
                {typeof currentTeamSize === "number" && currentTeamSize > 0 && ` • ${currentTeamSize}/match`}
                {(() => {
                  const captain = regs.find((r: any) => r.is_captain);
                  if (captain) return ` • Capt: ${getMemberName(captain)}`;
                  return "";
                })()}
              </p>
            </div>
          )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isInternalLeague && (
            <TeamLogoUpload
              leagueId={league.id}
              clubId={(league as any).club_id}
              currentLogoUrl={(league as any).logo_url}
              teamName={league.name}
            />
          )}
          {!editing && (
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit name & players per match" onClick={openEdit}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {onAllocate && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onAllocate}>
              <Users className="w-3.5 h-3.5" />Allocate
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(league.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {expanded && regs.length > 0 && (
        <div className="mt-2 border-t pt-2 space-y-0.5">
          {regs.map((r: any) => {
            const assoc = associations.find(a => a.id === league.association_id);
            const leagueNum = league.name.match(/(\d+)/)?.[1];
            const leagueOrd = leagueNum ? (() => {
              const n = parseInt(leagueNum);
              const s = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
              return `${n}${s}`;
            })() : null;
            return (
              <div key={r.id} className="flex items-center gap-2 text-xs py-0.5">
                <span className="w-5 text-center font-bold text-primary">{r.player_rank}</span>
                <span className="truncate">{getMemberName(r)}</span>
                {leagueOrd && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 flex-shrink-0">{leagueOrd}</Badge>}
                {assoc && r.league_association_number && (
                  <span className="text-muted-foreground flex-shrink-0">{assoc.abbreviation || assoc.name}: {r.league_association_number}</span>
                )}
                {r.is_captain && <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                {r.is_captain && <span className="text-[10px] text-amber-600 font-semibold">(C)</span>}
              </div>
            );
          })}
        </div>
      )}
      {expanded && regs.length === 0 && (
        <p className="mt-2 border-t pt-2 text-xs text-muted-foreground text-center">No players allocated</p>
      )}
      {expanded && (() => {
        const assoc = associations.find(a => a.id === league.association_id);
        if (assoc?.external_source !== "nsa") return null;
        return (
          <div className="mt-2 border-t pt-2 flex items-center gap-2 text-[10px] text-emerald-700">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="font-semibold">NSA Live</span>
            <span className="text-muted-foreground">
              Roster + W/L auto-resolved from team code <span className="font-mono">{(league as any).code}</span>.
            </span>
          </div>
        );
      })()}
    </Card>
  );
}

// ─── Allocate Players Dialog (drag & drop across leagues) ───
function AllocatePlayersDialog({ gender, leagues, members, clubId, open, onOpenChange }: {
  gender: "men" | "ladies" | "mixed";
  leagues: League[];
  members: ClubMember[];
  clubId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: ladderPlayers } = useLadder();
  const [leagueData, setLeagueData] = useState<Record<string, LeaguePlayer[]>>({});
  // Snapshot of registrations as loaded from the DB. Used by Save to detect
  // which leagues actually changed in this session, so untouched leagues are
  // never wiped.
  const initialLeagueData = useRef<Record<string, LeaguePlayer[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragItem = useRef<{ leagueId: string; idx: number } | null>(null);
  const dragOverItem = useRef<{ leagueId: string; idx: number } | null>(null);
  const [dragFromPool, setDragFromPool] = useState<string | null>(null);
  const [poolSearch, setPoolSearch] = useState("");

  // The association these leagues belong to (all leagues passed in share the same association in practice).
  const associationId = leagues.find(l => l.association_id)?.association_id || null;

  // Determine the association's scope (internal vs regional/external) and its tenant club_id.
  // - Regional/external (e.g. Lowveld Squash): the member must also exist as a member at the
  //   association's tenant (club_id of the association tenant) — i.e. they were issued an
  //   association membership number (their LS league number).
  // - Internal (e.g. NIL): profile opt-in (`plays_league` + `enable_league_association_id`) is enough.
  const { data: associationInfo } = useQuery({
    queryKey: ["association-info", associationId],
    queryFn: async () => {
      if (!associationId) return null;
      const { data, error } = await fromExt("league_associations")
        .select("scope, club_id")
        .eq("id", associationId)
        .maybeSingle();
      if (error) throw error;
      return (data as any) || null;
    },
    enabled: open && !!associationId,
  });
  const isInternal = associationInfo?.scope === "internal";
  const associationTenantClubId: string | null = associationInfo?.club_id ?? null;

  // Association-level league rule: allow_multi_team_registration (NSA-style flexibility).
  // When true, a player may be registered in more than one team within this association.
  const { data: allowMultiTeam = false } = useQuery({
    queryKey: ["assoc-allow-multi-team", associationId],
    queryFn: async () => {
      if (!associationId) return false;
      const { data: directRule, error: directErr } = await fromExt("league_rules")
        .select("allow_multi_team_registration")
        .eq("association_id", associationId)
        .is("league_id", null)
        .maybeSingle();
      if (directErr) throw directErr;
      if (directRule) return !!(directRule as any).allow_multi_team_registration;

      const { data: assoc, error: assocErr } = await fromExt("league_associations")
        .select("platform_association_id")
        .eq("id", associationId)
        .maybeSingle();
      if (assocErr) throw assocErr;
      const platformAssociationId = (assoc as any)?.platform_association_id;
      if (!platformAssociationId) return false;

      const { data: inheritedRule, error: inheritedErr } = await fromExt("league_rules")
        .select("allow_multi_team_registration")
        .eq("association_id", platformAssociationId)
        .is("league_id", null)
        .maybeSingle();
      if (inheritedErr) throw inheritedErr;
      return !!(inheritedRule as any)?.allow_multi_team_registration;
    },
    enabled: open && !!associationId,
  });

  // PERMANENT source of truth: active rows in `member_association_affiliations`
  // (mirrors what Edit Profile / Edit Member writes — covers both internal and regional).
  const { data: permanentAffiliatedIds = [] } = useQuery({
    queryKey: ["permanent-affiliated-members", clubId, associationId],
    queryFn: async () => {
      if (!associationId) return [];
      const { data, error } = await fromExt("member_association_affiliations")
        .select("club_member_id")
        .eq("association_id", associationId)
        .eq("active", true);
      if (error) throw error;
      return (data || []).map((r: any) => r.club_member_id as string);
    },
    enabled: open && !!associationId,
  });

  // Members with a registration row for this association (covers historical/manually added).
  const { data: registeredMemberIds = [] } = useQuery({
    queryKey: ["affiliated-members", clubId, associationId, isInternal],
    queryFn: async () => {
      if (!associationId) return [];
      const { data, error } = await fromExt("member_league_registrations")
        .select("club_member_id, league_association_number, ssa_number, leagues:league_id(association_id)");
      if (error) throw error;
      return Array.from(
        new Set(
          (data || [])
            .filter((r: any) => r.leagues?.association_id === associationId)
            .filter((r: any) =>
              isInternal
                ? true
                : !!(r.league_association_number?.trim() || r.ssa_number?.trim()),
            )
            .map((r: any) => r.club_member_id),
        ),
      );
    },
    enabled: open && !!associationId,
  });

  // For REGIONAL associations: members at this club whose user_id also has a member row
  // at the association's tenant club (i.e. they hold an LS membership / league number).
  const userIdsForAssoc = useMemo(
    () => Array.from(new Set(members.filter(m => m.user_id).map(m => m.user_id as string))),
    [members],
  );
  const { data: associationMemberUserIds = [] } = useQuery({
    queryKey: ["association-member-user-ids", associationTenantClubId, userIdsForAssoc.sort().join(",")],
    queryFn: async () => {
      if (!associationTenantClubId || userIdsForAssoc.length === 0) return [];
      const { data, error } = await fromExt("club_members")
        .select("user_id, club_member_number")
        .eq("club_id", associationTenantClubId)
        .in("user_id", userIdsForAssoc);
      if (error) throw error;
      return (data || [])
        .filter((r: any) => !!r.user_id && !!r.club_member_number?.trim())
        .map((r: any) => r.user_id as string);
    },
    enabled: open && !isInternal && !!associationTenantClubId && userIdsForAssoc.length > 0,
  });

  const permanentAffiliatedSet = useMemo(
    () => new Set<string>(permanentAffiliatedIds as string[]),
    [permanentAffiliatedIds],
  );

  // memberId → NSF (or equivalent) league association number for THIS association.
  // Single source of truth at save time so Upcoming League Games can always
  // match a player back to the right league via their permanent affiliation.
  const { data: affiliationNumberByMember = {} } = useQuery<Record<string, string>>({
    queryKey: ["affil-numbers-by-member", associationId],
    queryFn: async () => {
      if (!associationId) return {};
      const { data, error } = await fromExt("member_association_affiliations")
        .select("club_member_id, league_association_number")
        .eq("association_id", associationId)
        .eq("active", true);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const r of (data || []) as any[]) {
        const num = (r.league_association_number || "").trim();
        if (num) out[r.club_member_id] = num;
      }
      return out;
    },
    enabled: open && !!associationId,
  });
  const affiliatedSet = useMemo(
    () => new Set<string>(registeredMemberIds as string[]),
    [registeredMemberIds],
  );
  const associationUserIdSet = useMemo(
    () => new Set<string>(associationMemberUserIds as string[]),
    [associationMemberUserIds],
  );

  // Filter members by gender AND association eligibility.
  // PRIMARY check = active row in `member_association_affiliations` (the new permanent
  // model). Legacy fallbacks (registration rows, regional tenant membership, profile
  // opt-in) are kept for historical members not yet migrated.
  const genderMembers = members
    .filter(m => (gender === "mixed" ? true : gender === "ladies" ? m.gender === "Ladies" : m.gender !== "Ladies"))
    .filter(m => {
      if (!associationId) return true;
      if (permanentAffiliatedSet.has(m.id)) return true;
      if (isInternal) {
        return (m as any).enable_league_association_id === associationId || affiliatedSet.has(m.id);
      }
      return affiliatedSet.has(m.id) || (m.user_id ? associationUserIdSet.has(m.user_id) : false);
    })
    .sort((a, b) => {
      const la = (a as any).ladder_position ?? Number.POSITIVE_INFINITY;
      const lb = (b as any).ladder_position ?? Number.POSITIVE_INFINITY;
      if (la !== lb) return la - lb;
      return getSkillOrder(a.skill_level) - getSkillOrder(b.skill_level);
    });

  // Load existing registrations.
  // CRITICAL: drop any registration whose member's gender doesn't match the
  // dialog's gender group. This catches legacy bad rows (e.g. a male player
  // accidentally placed in a Ladies league) so they no longer appear in the
  // allocator. The snapshot keeps the original (uncleaned) rows so a Save
  // click persists the removal.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const allData: Record<string, LeaguePlayer[]> = {};
      const snapshotData: Record<string, LeaguePlayer[]> = {};
      let droppedCount = 0;
      for (const league of leagues) {
        const { data, error } = await fromExt("member_league_registrations")
          .select("*")
          .eq("league_id", league.id)
          .order("player_rank");
        if (!error && data) {
          const allRows: LeaguePlayer[] = data.map((r: any) => ({
            id: r.id,
            club_member_id: r.club_member_id,
            league_id: r.league_id,
            player_rank: r.player_rank ?? 0,
            is_captain: r.is_captain ?? false,
            league_association_number: r.league_association_number ?? null,
            member: members.find(m => m.id === r.club_member_id),
          }));
          const cleanRows = allRows.filter((row) => {
            if (gender === "mixed") return true;
            const g = (row.member?.gender || "").toLowerCase();
            const isLadies = g === "ladies" || g === "female" || g === "f";
            const matches = gender === "ladies" ? isLadies : !isLadies;
            if (!matches) droppedCount += 1;
            return matches;
          }).map((row, i) => ({ ...row, player_rank: i + 1 }));
          allData[league.id] = cleanRows;
          // Snapshot retains the original (dirty) rows so isLeagueChanged()
          // detects the cleanup as a real change to persist on Save.
          snapshotData[league.id] = allRows.map(p => ({ ...p }));
        } else {
          allData[league.id] = [];
          snapshotData[league.id] = [];
        }
      }
      setLeagueData(allData);
      initialLeagueData.current = snapshotData;
      if (droppedCount > 0) {
        toast.warning(
          `Removed ${droppedCount} wrong-gender player${droppedCount === 1 ? "" : "s"} from this view. Click Save to persist the cleanup.`,
        );
      }
      setLoaded(true);
    })();
  }, [open, leagues.length, gender, members]);

  // Helpers — distinguish team (non-reserves) vs reserves leagues so a member
  // can sit in one team AND in any number of reserves lists without the pool
  // hiding them.
  const isReservesLeagueByName = (name: string) => /reserves?/i.test(name);
  const teamLeagueIds = useMemo(
    () => new Set(leagues.filter(l => !isReservesLeagueByName(l.name)).map(l => l.id)),
    [leagues],
  );

  /** League id where this member is currently in a team (non-reserves) slot, else null. */
  const findTeamLeagueOfMember = (memberId: string): string | null => {
    for (const lid of teamLeagueIds) {
      if ((leagueData[lid] || []).some(p => p.club_member_id === memberId)) return lid;
    }
    return null;
  };

  // Pool = every eligible gender member. Each row shows whether they're already
  // on a team (badge), so admin can still drag them into a reserves zone.
  // Filter by search term.
  const poolMembers = useMemo(() => {
    const term = poolSearch.trim().toLowerCase();
    if (!term) return genderMembers;
    return genderMembers.filter(m => {
      const n = (m.name || m.profiles?.name || "").toLowerCase();
      return n.includes(term);
    });
  }, [genderMembers, poolSearch]);

  // Helper to get league number for a member (from league name ordinal)
  const getMemberLeagueNo = (memberId: string): string | null => {
    for (const league of leagues) {
      const players = leagueData[league.id] || [];
      if (players.some(p => p.club_member_id === memberId)) {
        const match = league.name.match(/(\d+)/);
        return match ? match[1] : null;
      }
    }
    return null;
  };

  // Get league ordinal from league name
  const getLeagueOrdinal = (league: League): string => {
    const match = league.name.match(/(\d+)/);
    if (!match) return "";
    const num = parseInt(match[1]);
    const suffix = num === 1 ? "st" : num === 2 ? "nd" : num === 3 ? "rd" : "th";
    return `${num}${suffix}`;
  };

  // Reshuffle: PRESERVE every player who is already placed (and their captain
  // status / NSF). Only redistribute genuinely unassigned eligible members
  // into the leagues that still have free space, in ladder order. This makes
  // Reshuffle safe to use mid-season — admin's manual setup is never wiped.
  const handleReshuffle = useCallback(() => {
    if (!ladderPlayers || leagues.length === 0) return;

    // Start from a deep clone of the current state — keep all current
    // placements untouched.
    const newData: Record<string, LeaguePlayer[]> = Object.fromEntries(
      leagues.map(l => [l.id, (leagueData[l.id] || []).map(p => ({ ...p }))]),
    );

    const alreadyPlaced = new Set<string>(
      Object.values(newData).flat().map(p => p.club_member_id),
    );

    // Build a ladder-ordered list of eligible-but-unassigned members.
    const ladderMemberIds = ladderPlayers
      .filter((lp: any) => {
        const g = lp.gender?.toLowerCase();
        if (gender === "ladies") return g === "female" || g === "ladies" || g === "f";
        return g !== "female" && g !== "ladies" && g !== "f";
      })
      .map((lp: any) => lp.club_member_id);

    const eligibleIds = new Set(genderMembers.map(m => m.id));
    const ladderUnassigned = ladderMemberIds.filter(
      (id: string) => eligibleIds.has(id) && !alreadyPlaced.has(id),
    );
    const remainingUnassigned = [...eligibleIds].filter(
      id => !alreadyPlaced.has(id) && !ladderUnassigned.includes(id),
    );
    const toPlace = [...ladderUnassigned, ...remainingUnassigned];

    if (toPlace.length === 0) {
      toast.info("Nothing to reshuffle — every eligible player is already placed.");
      return;
    }

    // Round-robin from the top league down, so stronger unassigned players
    // land in the higher leagues first.
    let cursor = 0;
    let safety = toPlace.length * leagues.length + 1;
    while (cursor < toPlace.length && safety-- > 0) {
      let placedThisPass = false;
      for (const league of leagues) {
        if (cursor >= toPlace.length) break;
        const list = newData[league.id];
        const memberId = toPlace[cursor];
        const member = members.find(m => m.id === memberId);
        list.push({
          id: `reshuffle-${Date.now()}-${memberId}`,
          club_member_id: memberId,
          league_id: league.id,
          player_rank: list.length + 1,
          is_captain: false,
          // NSF stays null here — it must come from the player's own
          // affiliation, never from another player's state.
          league_association_number: null,
          member,
        });
        cursor += 1;
        placedThisPass = true;
      }
      if (!placedThisPass) break;
    }

    // Re-rank each league.
    for (const league of leagues) {
      newData[league.id] = newData[league.id].map((p, i) => ({ ...p, player_rank: i + 1 }));
    }

    setLeagueData(newData);
    const perLeague = leagues.map(l => newData[l.id]?.length || 0);
    toast.success(
      `Placed ${toPlace.length} unassigned player${toPlace.length === 1 ? "" : "s"} (${perLeague.join(", ")} per league). Existing setup preserved.`,
    );
  }, [ladderPlayers, leagues, genderMembers, members, gender, leagueData]);

  const getMemberName = (p: LeaguePlayer) => {
    if (p.member) return p.member.name || p.member.profiles?.name || "Unknown";
    const m = members.find(m => m.id === p.club_member_id);
    return m?.name || m?.profiles?.name || "Unknown";
  };

  const getMemberSkill = (p: LeaguePlayer) => {
    const m = p.member || members.find(m => m.id === p.club_member_id);
    return getSkillLabel(m?.skill_level);
  };

  // Add from pool to league. Enforces:
  //  • No duplicate row in the same league.
  //  • Strict associations: a member can only be in ONE team (non-reserves)
  //    league at a time. Flexible associations (NSA) allow multiple teams.
  const addToLeague = (member: ClubMember, leagueId: string) => {
    const targetIsReserves = !teamLeagueIds.has(leagueId);
    // Already in this exact league? No-op.
    if ((leagueData[leagueId] || []).some(p => p.club_member_id === member.id)) {
      toast.info(`${member.name || member.profiles?.name || "Player"} is already in this league.`);
      return;
    }
    if (!allowMultiTeam && !targetIsReserves) {
      const existingTeamId = findTeamLeagueOfMember(member.id);
      if (existingTeamId && existingTeamId !== leagueId) {
        const existing = leagues.find(l => l.id === existingTeamId);
        toast.error(
          `${member.name || member.profiles?.name || "Player"} is already on ${existing?.name || "another team"}. Remove them from that team first.`,
        );
        return;
      }
    }
    setLeagueData(prev => {
      const current = prev[leagueId] || [];
      return {
        ...prev,
        [leagueId]: [...current, {
          id: `new-${Date.now()}-${member.id}`,
          club_member_id: member.id,
          league_id: leagueId,
          player_rank: current.length + 1,
          is_captain: false,
          member,
        }],
      };
    });
  };

  const toggleCaptain = (leagueId: string, idx: number) => {
    setLeagueData(prev => {
      const players = (prev[leagueId] || []).map((p, i) => ({
        ...p,
        is_captain: i === idx ? !p.is_captain : false,
      }));
      return { ...prev, [leagueId]: players };
    });
  };

  const removeFromLeague = (leagueId: string, idx: number) => {
    setLeagueData(prev => {
      const next = (prev[leagueId] || []).filter((_, i) => i !== idx);
      return { ...prev, [leagueId]: next.map((p, i) => ({ ...p, player_rank: i + 1 })) };
    });
  };

  // Drag within a league to reorder
  const handleDragStart = (leagueId: string, idx: number) => {
    dragItem.current = { leagueId, idx };
    setDragFromPool(null);
  };

  const handleDragEnter = (leagueId: string, idx: number) => {
    dragOverItem.current = { leagueId, idx };
  };

  // ── Reserve eligibility helpers ──
  // League "tier" = numeric prefix from name/code. Lower = stronger league.
  // A reserve from tier R can sub UP into team tier T only when T <= R.
  // (Same league or higher league # / weaker division.) Never the reverse.
  const isReservesLeague = (leagueId: string): boolean => {
    const l = leagues.find(x => x.id === leagueId);
    return !!l && /reserves?/i.test(l.name);
  };
  const tierOf = (leagueId: string): number => {
    const l = leagues.find(x => x.id === leagueId);
    if (!l) return 99;
    const m = (l.code || "").match(/(\d+)/) || l.name.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 99;
  };
  /** Returns null if allowed, else a human-readable reason string. */
  const checkReserveMoveAllowed = (fromLeagueId: string, toLeagueId: string): string | null => {
    if (!isReservesLeague(fromLeagueId)) return null;
    if (isReservesLeague(toLeagueId)) return null; // reserves → reserves is fine
    const reserveTier = tierOf(fromLeagueId);
    const targetTier = tierOf(toLeagueId);
    if (targetTier <= reserveTier) return null; // sub UP into stronger/same league: allowed
    // target is weaker league than the reserve → block
    return `Reserves from a stronger league (#${reserveTier}) can't be moved down into a weaker league (#${targetTier}).`;
  };

  const handleDragEnd = () => {
    if (!dragItem.current || !dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      setDragFromPool(null);
      return;
    }

    const from = dragItem.current;
    const to = dragOverItem.current;

    if (from.leagueId === to.leagueId) {
      // Reorder within same league
      setLeagueData(prev => {
        const items = [...(prev[from.leagueId] || [])];
        const dragged = items.splice(from.idx, 1)[0];
        items.splice(to.idx, 0, dragged);
        return { ...prev, [from.leagueId]: items.map((p, i) => ({ ...p, player_rank: i + 1 })) };
      });
    } else {
      // Cross-league move — enforce reserve eligibility
      const reason = checkReserveMoveAllowed(from.leagueId, to.leagueId);
      if (reason) {
        toast.error(reason);
        dragItem.current = null;
        dragOverItem.current = null;
        setDragFromPool(null);
        return;
      }
      const targetIsReserves = isReservesLeague(to.leagueId);
      const sourceIsReserves = isReservesLeague(from.leagueId);
      const draggedSnapshot = (leagueData[from.leagueId] || [])[from.idx];

      // Team → Reserves: COPY (player stays on the team, also appears in reserves)
      if (!sourceIsReserves && targetIsReserves && draggedSnapshot) {
        // Don't add a duplicate if already in this reserves list
        if ((leagueData[to.leagueId] || []).some(p => p.club_member_id === draggedSnapshot.club_member_id)) {
          toast.info("Already in this reserves list.");
        } else {
          setLeagueData(prev => {
            const toItems = [...(prev[to.leagueId] || [])];
            toItems.splice(to.idx, 0, {
              ...draggedSnapshot,
              id: `copy-${Date.now()}-${draggedSnapshot.club_member_id}`,
              league_id: to.leagueId,
              is_captain: false,
            });
            return { ...prev, [to.leagueId]: toItems.map((p, i) => ({ ...p, player_rank: i + 1 })) };
          });
        }
      } else {
        // Team → Team guard: block placing a member into a second team league.
        if (!sourceIsReserves && !targetIsReserves && draggedSnapshot) {
          const existsInTarget = (leagueData[to.leagueId] || []).some(
            p => p.club_member_id === draggedSnapshot.club_member_id,
          );
          if (existsInTarget) {
            toast.info("Already in this league.");
            dragItem.current = null;
            dragOverItem.current = null;
            setDragFromPool(null);
            return;
          }
        }
        // Existing move (incl. reserve→team promote/demote swap)
        setLeagueData(prev => {
          const fromItems = [...(prev[from.leagueId] || [])];
          const toItems = [...(prev[to.leagueId] || [])];
          const dragged = fromItems.splice(from.idx, 1)[0];
          const occupant = toItems[to.idx];
          if (occupant && sourceIsReserves && !targetIsReserves) {
            // Promote dragged into team slot; demote occupant into reserves.
            toItems[to.idx] = { ...dragged, league_id: to.leagueId, is_captain: occupant.is_captain };
            fromItems.splice(from.idx, 0, { ...occupant, league_id: from.leagueId, is_captain: false });
          } else {
            dragged.league_id = to.leagueId;
            toItems.splice(to.idx, 0, dragged);
          }
          return {
            ...prev,
            [from.leagueId]: fromItems.map((p, i) => ({ ...p, player_rank: i + 1 })),
            [to.leagueId]: toItems.map((p, i) => ({ ...p, player_rank: i + 1 })),
          };
        });
      }
    }

    dragItem.current = null;
    dragOverItem.current = null;
    setDragFromPool(null);
  };

  // Drop from pool onto a league
  const handlePoolDragStart = (memberId: string) => {
    setDragFromPool(memberId);
    dragItem.current = null;
  };

  const handleDropOnLeague = (leagueId: string) => {
    if (dragFromPool) {
      const member = members.find(m => m.id === dragFromPool);
      if (member) addToLeague(member, leagueId);
      setDragFromPool(null);
    }
  };

  // Compare a league's current players to the snapshot loaded from the DB.
  // Only return true if something actually changed (members, order, captain,
  // or association number). This stops Save from wiping leagues admin never
  // touched in this session.
  const isLeagueChanged = (leagueId: string): boolean => {
    const before = initialLeagueData.current[leagueId] || [];
    const after = leagueData[leagueId] || [];
    if (before.length !== after.length) return true;
    for (let i = 0; i < after.length; i++) {
      const a = after[i];
      const b = before[i];
      if (!b) return true;
      if (a.club_member_id !== b.club_member_id) return true;
      if (!!a.is_captain !== !!b.is_captain) return true;
      if ((a.league_association_number || null) !== (b.league_association_number || null)) return true;
    }
    return false;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Guard: a member must not appear in more than one TEAM (non-reserves) league —
      // unless the association rule allows multi-team registration (e.g. NSA).
      if (!allowMultiTeam) {
        const teamMemberCounts = new Map<string, string[]>(); // memberId → league names
        for (const lg of leagues) {
          if (!teamLeagueIds.has(lg.id)) continue;
          for (const p of (leagueData[lg.id] || [])) {
            const arr = teamMemberCounts.get(p.club_member_id) || [];
            arr.push(lg.name);
            teamMemberCounts.set(p.club_member_id, arr);
          }
        }
        for (const [mid, names] of teamMemberCounts) {
          if (names.length > 1) {
            const mname = members.find(m => m.id === mid)?.name || "A player";
            toast.error(`${mname} is on more than one team (${names.join(", ")}). Remove them from one before saving.`);
            setSaving(false);
            return;
          }
        }
      }
      const changedLeagues = leagues.filter(l => isLeagueChanged(l.id));
      console.log("[AllocateLeagues] save start", {
        totalLeagues: leagues.length,
        changedLeagues: changedLeagues.map(l => ({
          id: l.id, name: l.name, code: l.code,
          isReserves: /reserves?/i.test(l.name),
          before: (initialLeagueData.current[l.id] || []).length,
          after: (leagueData[l.id] || []).length,
        })),
      });
      if (changedLeagues.length === 0) {
        toast.info("No changes to save");
        setSaving(false);
        return;
      }
      let totalRowsWritten = 0;
      let totalRowsDeleted = 0;

      // Pre-compute per-league intended state + fetch current DB rows.
      type Prepared = {
        league: typeof changedLeagues[number];
        targetIsReserves: boolean;
        uniquePlayers: any[];
        toDeleteMemberIds: string[];
      };
      const prepared: Prepared[] = [];
      for (const league of changedLeagues) {
        const targetIsReserves = /reserves?/i.test(league.name);
        const players = leagueData[league.id] || [];
        const seen = new Set<string>();
        const uniquePlayers = players.filter(p => {
          if (!p.club_member_id || seen.has(p.club_member_id)) return false;
          seen.add(p.club_member_id);
          return true;
        });
        const { data: dbRows, error: fetchErr } = await fromExt("member_league_registrations")
          .select("id, club_member_id")
          .eq("league_id", league.id);
        if (fetchErr) {
          console.error(`[AllocateLeagues] fetch current rows failed for ${league.name}`, fetchErr);
          throw new Error(`Load failed for "${league.name}": ${fetchErr.message}`);
        }
        const dbIds = new Set<string>((dbRows || []).map((r: any) => String(r.club_member_id)));
        const intendedIds = new Set<string>(uniquePlayers.map(p => String(p.club_member_id)));
        const toDeleteMemberIds: string[] = [...dbIds].filter(id => !intendedIds.has(id));
        prepared.push({ league, targetIsReserves, uniquePlayers, toDeleteMemberIds });
      }

      // PASS 1: deletes across ALL changed leagues first. When a member is
      // MOVED between teams in the same association, the old row must be gone
      // before the new INSERT runs — otherwise the
      // enforce_one_team_per_association trigger raises a "duplicate" error.
      for (const { league, toDeleteMemberIds } of prepared) {
        if (toDeleteMemberIds.length === 0) continue;
        const { error: delErr, count } = await fromExt("member_league_registrations")
          .delete({ count: "exact" })
          .eq("league_id", league.id)
          .in("club_member_id", toDeleteMemberIds);
        if (delErr) {
          console.error(`[AllocateLeagues] targeted delete failed for ${league.name}`, delErr);
          throw new Error(`Delete failed for "${league.name}": ${delErr.message}`);
        }
        totalRowsDeleted += count ?? toDeleteMemberIds.length;
        console.log(`[AllocateLeagues] removed ${count ?? toDeleteMemberIds.length} from ${league.name}`, toDeleteMemberIds);
      }

      // PASS 2: upserts + captain updates.
      for (const { league, targetIsReserves, uniquePlayers } of prepared) {
        if (uniquePlayers.length > 0) {
          const payload = uniquePlayers.map((p, i) => ({
            club_member_id: p.club_member_id,
            league_id: league.id,
            player_rank: i + 1,
            is_captain: targetIsReserves ? false : p.is_captain,
            is_reserve: targetIsReserves,
            reserve_order: targetIsReserves ? i + 1 : null,
            league_association_number:
              affiliationNumberByMember[p.club_member_id] ||
              p.league_association_number ||
              null,
          }));
          const { data: written, error } = await fromExt("member_league_registrations").upsert(
            payload,
            { onConflict: "club_member_id,league_id", ignoreDuplicates: false }
          ).select("id");
          if (error) {
            console.error(`[AllocateLeagues] upsert failed for ${league.name}`, { error, payload });
            throw new Error(`Save failed for "${league.name}": ${error.message}${error.details ? ` — ${error.details}` : ""}`);
          }
          const wrote = (written || []).length;
          totalRowsWritten += wrote;
          console.log(`[AllocateLeagues] wrote ${wrote}/${payload.length} rows to ${league.name} (${league.code})`, written);
          if (wrote !== payload.length) {
            toast.warning(`"${league.name}": wrote ${wrote} of ${payload.length} rows. RLS may be silently dropping rows.`);
          }
        }
        if (!targetIsReserves) {
          const newCaptain = uniquePlayers.find(p => p.is_captain)?.club_member_id || null;
          await fromExt("leagues")
            .update({ captain_member_id: newCaptain })
            .eq("id", league.id);
        }
      }
      console.log("[AllocateLeagues] save complete", { totalRowsWritten });
      // Refresh snapshot so a second Save in the same session is a no-op.
      initialLeagueData.current = Object.fromEntries(
        Object.entries(leagueData).map(([k, v]) => [k, v.map(p => ({ ...p }))])
      );
      toast.success(
        `Saved ${changedLeagues.length} league${changedLeagues.length === 1 ? "" : "s"}`,
      );
      changedLeagues.forEach(l => qc.invalidateQueries({ queryKey: ["league-registrations", l.id] }));
      onOpenChange(false);
    } catch (err: any) {
      console.error("[AllocateLeagues] save failed", err);
      const detail = err?.details || err?.hint || err?.code || "";
      toast.error(`${err?.message || "Failed to save"}${detail ? ` — ${detail}` : ""}`);
    } finally {
      setSaving(false);
    }
  };

  const totalAllocated = Object.values(leagueData).flat().length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Allocate {gender === "men" ? "Men" : gender === "ladies" ? "Ladies" : "Players"} to Leagues</DialogTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => {
                  const newData: Record<string, LeaguePlayer[]> = {};
                  leagues.forEach(l => { newData[l.id] = []; });
                  setLeagueData(newData);
                  toast.success("All players unallocated");
                }}
                disabled={totalAllocated === 0}
              >
                <X className="w-3.5 h-3.5" />
                Unallocate All
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={handleReshuffle}
                disabled={!ladderPlayers || leagues.length === 0}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reshuffle to Ladder
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{totalAllocated} allocated • {genderMembers.length} eligible • Drag players into leagues or between positions. {allowMultiTeam ? <>This association allows players in multiple teams.</> : <>A member can be in <strong>one team</strong> and <strong>one or more reserves</strong> lists.</>} Drag from the pool onto a reserves zone to add them as a reserve even if they're already on a team.</p>
        </DialogHeader>

        {!loaded ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="flex gap-4 flex-1 overflow-hidden">
            {/* Left: Available members pool */}
            <div className="w-56 flex-shrink-0 border rounded-md overflow-hidden flex flex-col">
              <div className="bg-muted/50 px-3 py-2 border-b space-y-1.5">
                <p className="text-xs font-semibold">Available Players ({poolMembers.length})</p>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    value={poolSearch}
                    onChange={(e) => setPoolSearch(e.target.value)}
                    placeholder="Search players…"
                    className="h-6 pl-6 pr-6 text-[11px]"
                  />
                  {poolSearch && (
                    <button
                      type="button"
                      onClick={() => setPoolSearch("")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Sorted by club ladder</p>
              </div>
              <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
                {poolMembers.map(m => {
                  const teamLid = findTeamLeagueOfMember(m.id);
                  const teamLeague = teamLid ? leagues.find(l => l.id === teamLid) : null;
                  return (
                    <div
                      key={m.id}
                      draggable
                      onDragStart={() => handlePoolDragStart(m.id)}
                      className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded cursor-grab active:cursor-grabbing hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-colors"
                    >
                      <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{m.name || m.profiles?.name || "Unknown"}</p>
                        <div className="flex items-center gap-1">
                          <p className="text-[10px] text-muted-foreground truncate">{getSkillLabel(m.skill_level) || "No level"}</p>
                          {teamLeague && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 leading-none">
                              {teamLeague.code || teamLeague.name}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {poolMembers.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-4">
                    {poolSearch ? `No players match "${poolSearch}"` : "No eligible players"}
                  </p>
                )}
              </div>
            </div>

            {/* Right: League columns */}
            <div className="flex-1 overflow-y-auto space-y-3">
              {leagues.map(league => {
                const players = leagueData[league.id] || [];
                const isRes = /reserves?/i.test(league.name);
                return (
                  <Card
                    key={league.id}
                    className={`p-3 ${isRes ? "border-dashed bg-muted/30" : ""}`}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => handleDropOnLeague(league.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{league.name}</p>
                        {isRes && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">Reserves</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{league.code || ""} • {players.length} player{players.length !== 1 ? "s" : ""} • League {getLeagueOrdinal(league)}</p>
                    </div>
                    <div className="space-y-0.5 min-h-[32px] border border-dashed rounded-md p-1">
                      {players.length === 0 && (
                        <p className="text-[10px] text-muted-foreground text-center py-2">Drop players here</p>
                      )}
                      {players.map((p, idx) => (
                        <div
                          key={p.id}
                          draggable
                          onDragStart={() => handleDragStart(league.id, idx)}
                          onDragEnter={() => handleDragEnter(league.id, idx)}
                          onDragEnd={handleDragEnd}
                          onDragOver={e => e.preventDefault()}
                          className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded cursor-grab active:cursor-grabbing hover:bg-muted border border-transparent hover:border-border transition-colors"
                        >
                          <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="w-5 text-xs font-bold text-primary text-center">{idx + 1}</span>
                          <span className="text-xs flex-1 truncate">{getMemberName(p)}</span>
                          {p.is_captain && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">Captain</Badge>}
                          <span className="text-[10px] text-muted-foreground">{getMemberSkill(p)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-5 w-5 flex-shrink-0 ${p.is_captain ? "text-amber-500" : "text-muted-foreground/40 hover:text-amber-500"}`}
                            onClick={() => toggleCaptain(league.id, idx)}
                            title={p.is_captain ? "Remove captain" : "Make captain"}
                          >
                            <Crown className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onClick={() => removeFromLeague(league.id, idx)}>
                            <X className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-3 border-t">
          <Button onClick={handleSave} className="w-full" disabled={saving}>
            {saving ? "Saving…" : `Save All Allocations`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
const LEAGUE_OPTIONS = Array.from({ length: 14 }, (_, i) => {
  const num = i + 1;
  const suffix = num === 1 ? "st" : num === 2 ? "nd" : num === 3 ? "rd" : "th";
  return `${num}${suffix}`;
});

// ─── Association Dialog ───
function AssociationDialog({ clubId, open, onOpenChange }: { clubId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [form, setForm] = useState({ name: "", abbreviation: "" });
  const [mode, setMode] = useState<"select" | "create">("select");
  const [scope, setScope] = useState<"internal" | "region">("region");
  const [selectedPlatformId, setSelectedPlatformId] = useState("");
  const qc = useQueryClient();

  // Prefer actual affiliated association tenants for this club; only fall back to platform associations when none exist.
  const { data: affiliatedAssociations = [] } = useQuery({
    queryKey: ["affiliated-association-options", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("association_affiliated_clubs")
        .select("association:association_tenant_id(id, name, subdomain, tenant_type)")
        .eq("club_id", clubId)
        .eq("status", "active");
      if (error) throw error;
      return ((data || []) as any[])
        .map((row) => row.association)
        .filter((association) => association && association.tenant_type === "association");
    },
  });

  const { data: platformAssociations = [] } = useQuery({
    queryKey: ["platform-league-associations"],
    queryFn: async () => {
      const { data, error } = await fromExt("platform_league_associations")
        .select("id, name, short_code, region")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch existing club associations to filter out already-linked ones
  const { data: existingAssocs = [] } = useQuery({
    queryKey: ["league-associations-linked", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("league_associations").select("platform_association_id, name").eq("club_id", clubId);
      if (error) throw error;
      return data || [];
    },
  });

  const linkedPlatformIds = new Set((existingAssocs as any[]).map(a => a.platform_association_id).filter(Boolean));
  const existingAssociationNames = new Set((existingAssocs as any[]).map((a) => String(a.name || "").trim().toLowerCase()).filter(Boolean));
  const availableAffiliated = affiliatedAssociations.filter((a: any) => !existingAssociationNames.has(String(a.name || "").trim().toLowerCase()));
  const availablePlatform = availableAffiliated.length > 0
    ? availableAffiliated.map((a: any) => ({ id: a.id, name: a.name, short_code: String(a.subdomain || "").toUpperCase(), region: "Affiliated association" }))
    : platformAssociations.filter((p: any) => !linkedPlatformIds.has(p.id));

  const handleSave = async () => {
    if (mode === "select") {
      if (!selectedPlatformId) return;
      const selected = platformAssociations.find((p: any) => p.id === selectedPlatformId) as any;
      const selectedAffiliated = affiliatedAssociations.find((a: any) => a.id === selectedPlatformId) as any;
      const selectedOption = selectedAffiliated || selected;
      if (!selectedOption) return;
      const { error } = await fromExt("league_associations").insert({
        club_id: clubId,
        name: selectedOption.name,
        abbreviation: selectedOption.short_code || String(selectedOption.subdomain || "").toUpperCase() || "",
        platform_association_id: selected ? selected.id : null,
        scope: "region",
      });
      if (error) toast.error(error.message);
      else { toast.success(`Joined ${selectedOption.name}`); onOpenChange(false); setSelectedPlatformId(""); qc.invalidateQueries({ queryKey: ["league-associations"] }); qc.invalidateQueries({ queryKey: ["league-associations-linked"] }); }
    } else {
      if (!form.name.trim()) return;
      const { error } = await fromExt("league_associations").insert({ ...form, club_id: clubId, scope });
      if (error) toast.error(error.message);
      else { toast.success("Association created"); onOpenChange(false); setForm({ name: "", abbreviation: "" }); setScope("region"); qc.invalidateQueries({ queryKey: ["league-associations"] }); qc.invalidateQueries({ queryKey: ["league-associations-linked"] }); }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Association</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add League Association</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button variant={mode === "select" ? "default" : "outline"} size="sm" onClick={() => setMode("select")} className="flex-1">Select Existing</Button>
            <Button variant={mode === "create" ? "default" : "outline"} size="sm" onClick={() => setMode("create")} className="flex-1">Create Own</Button>
          </div>

          {mode === "select" ? (
            <div className="space-y-2">
              {availablePlatform.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No affiliated associations available to join, or all are already linked.</p>
              ) : (
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedPlatformId}
                  onChange={e => setSelectedPlatformId(e.target.value)}
                >
                  <option value="">Select an association…</option>
                  {availablePlatform.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name} {p.short_code ? `(${p.short_code})` : ""} {p.region ? `– ${p.region}` : ""}</option>
                  ))}
                </select>
              )}
              <p className="text-xs text-muted-foreground">{availableAffiliated.length > 0 ? "Only your active affiliated association(s) are listed here." : "Platform associations are regional — they connect your club to other participating clubs."}</p>
            </div>
          ) : (
            <>
              <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. My Club League" /></div>
              <div className="space-y-1"><Label>Abbreviation</Label><Input value={form.abbreviation} onChange={e => setForm(p => ({ ...p, abbreviation: e.target.value }))} placeholder="e.g. MCL" /></div>
              <div className="space-y-1">
                <Label>Scope</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={scope === "internal" ? "default" : "outline"} size="sm" onClick={() => setScope("internal")} className="flex-1">Internal</Button>
                  <Button type="button" variant={scope === "region" ? "default" : "outline"} size="sm" onClick={() => setScope("region")} className="flex-1">Regional</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {scope === "internal"
                    ? "Internal: only your club's members participate. No external integration."
                    : "Regional: external/regional league involving other clubs."}
                </p>
                <p className="text-[11px] text-muted-foreground italic">National bodies (e.g. SSA) are not leagues — they auto-seed as fees on every club.</p>
              </div>
            </>
          )}
          <Button onClick={handleSave} className="w-full" disabled={mode === "select" ? !selectedPlatformId : !form.name.trim()}>
            {mode === "select" ? "Join Association" : "Create Association"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Association Dialog ───
function EditAssociationDialog({ association, open, onOpenChange }: { association: LeagueAssociation; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(association.name);
  const [abbreviation, setAbbreviation] = useState(association.abbreviation || "");
  const [scope, setScope] = useState<"internal" | "region">(((association.scope as any) === "national" ? "region" : (association.scope as any)) || "region");
  const [membersPayDirectly, setMembersPayDirectly] = useState<boolean>(!!(association as any).members_pay_directly);
  const [affectsLadder, setAffectsLadder] = useState<boolean>(!!(association as any).affects_ladder);

  const isPlatformLinked = !!association.platform_association_id;

  const handleSave = async () => {
    if (!name.trim()) return;
    const payload: any = { name, abbreviation, scope, members_pay_directly: membersPayDirectly, affects_ladder: scope === "internal" ? affectsLadder : false };
    const { error } = await fromExt("league_associations").update(payload).eq("id", association.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Association updated");
    qc.invalidateQueries({ queryKey: ["league-associations"] });
    qc.invalidateQueries({ queryKey: ["league-associations-linked"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Association</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} disabled={isPlatformLinked} />
            {isPlatformLinked && <p className="text-xs text-muted-foreground">Name is managed by the platform.</p>}
          </div>
          <div className="space-y-1">
            <Label>Abbreviation</Label>
            <Input value={abbreviation} onChange={e => setAbbreviation(e.target.value)} disabled={isPlatformLinked} />
          </div>
          <div className="space-y-1">
            <Label>Scope</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={scope === "internal" ? "default" : "outline"}
                size="sm"
                onClick={() => setScope("internal")}
                className="flex-1"
                disabled={isPlatformLinked}
              >
                Internal
              </Button>
              <Button
                type="button"
                variant={scope === "region" ? "default" : "outline"}
                size="sm"
                onClick={() => setScope("region")}
                className="flex-1"
              >
                Regional
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {isPlatformLinked
                ? "Platform-linked associations are always regional."
                : scope === "internal"
                  ? "Internal: only your club's members participate. No external integration."
                  : "Regional: external/regional league involving other clubs."}
            </p>
          </div>

          {/* Members pay association directly toggle */}
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="members-pay-direct" className="text-sm font-medium cursor-pointer">
                    Members pay {abbreviation || "association"} directly
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-foreground">
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          <strong>ON:</strong> Members pay the league association directly via EFT or card. The fee is <em>not</em> added to your club's Fees table and the club does not collect it.
                          <br /><br />
                          <strong>OFF:</strong> The association fee is added to your club's Fees table. Your club collects it from members and remits it to the association.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {membersPayDirectly
                    ? "Fee will NOT appear in the club's Fees table. Members settle directly with the association."
                    : "Fee will appear in the club's Fees table and be charged via the club."}
                </p>
              </div>
              <Switch
                id="members-pay-direct"
                checked={membersPayDirectly}
                onCheckedChange={setMembersPayDirectly}
              />
            </div>
          </div>

          {scope === "internal" && (
            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="affects-ladder" className="text-sm font-medium cursor-pointer">
                      Affects club ladder
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">
                            When <strong>ON</strong>, internal league rubbers from this association can leapfrog the club ladder: if a lower-ranked winner beats a higher-ranked loser, the winner takes the loser's slot and everyone between shifts down one rank. Subs and external players are ignored — only originally-registered club members count.
                            <br /><br />
                            Admins review and apply changes from the "Preview ladder impact" button on each fixture.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {affectsLadder
                      ? "Internal league results will offer a ladder-impact preview on each fixture."
                      : "Results from this association have no effect on the club ladder."}
                  </p>
                </div>
                <Switch
                  id="affects-ladder"
                  checked={affectsLadder}
                  onCheckedChange={setAffectsLadder}
                />
              </div>
            </div>
          )}

          <Button onClick={handleSave} className="w-full" disabled={!name.trim()}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── League Dialog (bulk add) ───
function LeagueDialog({ clubId, associations, open, onOpenChange }: { clubId: string; associations: LeagueAssociation[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [selectedMen, setSelectedMen] = useState<string[]>([]);
  const [selectedLadies, setSelectedLadies] = useState<string[]>([]);
  const [selectedMixed, setSelectedMixed] = useState<string[]>([]);
  const [prefix, setPrefix] = useState("");
  const [startNum, setStartNum] = useState(1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [associationId, setAssociationId] = useState("");
  const qc = useQueryClient();

  const handleToggle = (league: string, gender: "men" | "ladies" | "mixed") => {
    const setter = gender === "men" ? setSelectedMen : gender === "ladies" ? setSelectedLadies : setSelectedMixed;
    setter(prev => prev.includes(league) ? prev.filter(l => l !== league) : [...prev, league]);
  };

  const buildEntries = () => {
    const parseNum = (l: string) => parseInt(l);
    const sortedMen = [...selectedMen].sort((a, b) => parseNum(a) - parseNum(b));
    const sortedLadies = [...selectedLadies].sort((a, b) => parseNum(a) - parseNum(b));
    const sortedMixed = [...selectedMixed].sort((a, b) => parseNum(a) - parseNum(b));

    let codeNum = startNum;
    const menEntries = sortedMen.map(label => {
      const code = prefix ? `${prefix}${String(codeNum).padStart(3, "0")}` : null;
      codeNum++;
      return { name: `Men's ${label} League ${year}`, code, association_id: associationId || null, club_id: clubId };
    });

    // Reset numbering for Ladies
    codeNum = startNum;
    const ladiesEntries = sortedLadies.map(label => {
      const code = prefix ? `${prefix}${String(codeNum).padStart(3, "0")}` : null;
      codeNum++;
      return { name: `Ladies ${label} League ${year}`, code, association_id: associationId || null, club_id: clubId };
    });

    // Reset numbering for Mixed
    codeNum = startNum;
    const mixedEntries = sortedMixed.map(label => {
      const code = prefix ? `${prefix}${String(codeNum).padStart(3, "0")}` : null;
      codeNum++;
      return { name: `Mixed ${label} League ${year}`, code, association_id: associationId || null, club_id: clubId };
    });

    return [...menEntries, ...ladiesEntries, ...mixedEntries];
  };

  const entries = buildEntries();

  const handleSave = async () => {
    if (entries.length === 0) return;
    const { error } = await fromExt("leagues").insert(entries);
    if (error) { toast.error(error.message); return; }

    // After adding, renumber ALL league codes in each gender group from 001
    if (prefix) {
      // Fetch all leagues for this club to get fresh data including newly inserted
      const { data: allLeagues } = await fromExt("leagues").select("*").eq("club_id", clubId);
      if (allLeagues) {
        const renumberGroup = async (filterFn: (l: any) => boolean) => {
          const group = allLeagues
            .filter(l => l.code?.startsWith(prefix) && filterFn(l))
            .sort((a, b) => {
              const numA = parseInt(a.name.match(/(\d+)/)?.[1] || "99");
              const numB = parseInt(b.name.match(/(\d+)/)?.[1] || "99");
              return numA - numB;
            });
          for (let i = 0; i < group.length; i++) {
            const newCode = `${prefix}${String(i + 1).padStart(3, "0")}`;
            if (group[i].code !== newCode) {
              await fromExt("leagues").update({ code: newCode }).eq("id", group[i].id);
            }
          }
        };

        await renumberGroup(l => {
          const n = l.name.toLowerCase();
          return n.includes("men's") || n.startsWith("men");
        });
        await renumberGroup(l => {
          const n = l.name.toLowerCase();
          return n.includes("ladies") || n.includes("women");
        });
      }
    }

    toast.success(`${entries.length} league(s) added & codes renumbered`);
    onOpenChange(false);
    setSelectedMen([]); setSelectedLadies([]); setSelectedMixed([]); setPrefix(""); setStartNum(1); setYear(new Date().getFullYear()); setAssociationId("");
    qc.invalidateQueries({ queryKey: ["leagues"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Quick Top Down League Setup</Button></DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Quick Top Down League Setup</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Association</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={associationId} onChange={e => setAssociationId(e.target.value)}>
              <option value="">None</option>
              {associations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Members allocated to these leagues will be filtered by their affiliation to the selected association.</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="mb-2 block font-semibold">Men's Leagues</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {LEAGUE_OPTIONS.map(l => (
                  <label key={`men-${l}`} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                    <input type="checkbox" checked={selectedMen.includes(l)} onChange={() => handleToggle(l, "men")} className="rounded border-input" />
                    {l} League
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block font-semibold">Ladies Leagues</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {LEAGUE_OPTIONS.map(l => (
                  <label key={`ladies-${l}`} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                    <input type="checkbox" checked={selectedLadies.includes(l)} onChange={() => handleToggle(l, "ladies")} className="rounded border-input" />
                    {l} League
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block font-semibold">Mixed Leagues</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {LEAGUE_OPTIONS.map(l => (
                  <label key={`mixed-${l}`} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                    <input type="checkbox" checked={selectedMixed.includes(l)} onChange={() => handleToggle(l, "mixed")} className="rounded border-input" />
                    {l} League
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Code Prefix</Label>
              <Input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} placeholder="e.g. WCS" maxLength={10} />
            </div>
            <div className="space-y-1">
              <Label>Start Number</Label>
              <Input type="number" min={1} value={startNum} onChange={e => setStartNum(Number(e.target.value) || 1)} />
            </div>
            <div className="space-y-1">
              <Label>Year</Label>
              <Input type="number" min={2020} max={2099} value={year} onChange={e => setYear(Number(e.target.value) || new Date().getFullYear())} />
            </div>
          </div>

          {prefix && entries.length > 0 && (
            <div className="bg-muted/50 rounded-md p-3 text-xs space-y-0.5 max-h-32 overflow-y-auto">
              <p className="font-semibold text-muted-foreground mb-1">Preview codes:</p>
              {entries.map((e, i) => (
                <p key={i} className="text-muted-foreground">{e.code} → {e.name}</p>
              ))}
            </div>
          )}

          <Button onClick={handleSave} className="w-full" disabled={entries.length === 0}>
            Add {entries.length} League(s)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

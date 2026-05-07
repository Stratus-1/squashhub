import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
import { Plus, Trash2, GripVertical, Users, X, ChevronDown, ChevronUp, Crown, RefreshCw, Pencil, Check, Loader2 } from "lucide-react";
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

const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function FillTopDownSettings({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { data: club } = useQuery({
    queryKey: ["club-fill-settings", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clubs").select("fill_top_down_enabled, league_week_start_dow").eq("id", clubId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clubId,
  });

  const update = async (patch: { fill_top_down_enabled?: boolean; league_week_start_dow?: number }) => {
    const { error } = await supabase.from("clubs").update(patch).eq("id", clubId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["club-fill-settings", clubId] });
    toast.success("Saved");
  };

  return (
    <Card className="p-3 mt-2">
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
      <p className="text-xs text-muted-foreground mt-2">
        When enabled, captains use <strong>Fill Up Leagues</strong> to assign players top-down. Excess players cascade to the next league. The ±2 position rule is enforced against the previous week's snapshot.
      </p>
      <p className="md:hidden text-xs text-muted-foreground mt-2 rounded-md border border-border bg-muted/40 px-2.5 py-2">
        On mobile: weekly team planning happens in <strong>League Games → Fill Up Leagues</strong>. Press and hold a player for a moment, then drag. The admin <strong>Allocate</strong> dialog is still desktop-first.
      </p>
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
        const { data: regs } = await fromExt("member_league_registrations").select("league_id").in("league_id", teamIds);
        const counts = new Map<string, number>();
        (regs || []).forEach((r: any) => counts.set(r.league_id, (counts.get(r.league_id) || 0) + 1));
        const max = Math.max(0, ...Array.from(counts.values()));
        if (max > 0) perTeam = max;
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
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Other ({otherLeagues.length})</h4>
            <div className="space-y-2">
              {sortLeagues(otherLeagues).map(l => (
                <LeagueCard key={l.id} league={l} associations={associations} onDelete={handleDeleteLeague} members={members} />
              ))}
            </div>
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
            <div className="space-y-2">
              {g.leagues.map(l => (
                <LeagueCard key={l.id} league={l} associations={associations} onDelete={onDelete} members={members} />
              ))}
            </div>
          </div>
        ))}
        {leagues.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No {title.toLowerCase()} leagues</p>}
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

  const getMemberName = (reg: any) => {
    const m = members.find(m => m.id === reg.club_member_id);
    return m?.name || m?.profiles?.name || "Unknown";
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === league.name) { setEditing(false); setNameDraft(league.name); return; }
    setSavingName(true);
    const { error } = await fromExt("leagues").update({ name: trimmed }).eq("id", league.id);
    setSavingName(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Team renamed");
    setEditing(false);
    qcRow.invalidateQueries({ queryKey: ["leagues"] });
  };

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") { setEditing(false); setNameDraft(league.name); }
                }}
                className="h-7 text-sm"
              />
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
                {(() => {
                  const captain = regs.find((r: any) => r.is_captain);
                  if (captain) return ` • Capt: ${getMemberName(captain)}`;
                  return "";
                })()}
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!editing && (
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Rename team" onClick={() => { setNameDraft(league.name); setEditing(true); }}>
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

  // Get all assigned member IDs across all leagues
  const assignedMemberIds = Object.values(leagueData).flat().map(p => p.club_member_id);
  const unassignedMembers = genderMembers.filter(m => !assignedMemberIds.includes(m.id));

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

  // Add from pool to league
  const addToLeague = (member: ClubMember, leagueId: string) => {
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
      // Move between leagues (auto-swap when target slot is occupied — promotes a
      // reserve into a team and demotes the displaced player into reserves).
      setLeagueData(prev => {
        const fromItems = [...(prev[from.leagueId] || [])];
        const toItems = [...(prev[to.leagueId] || [])];
        const dragged = fromItems.splice(from.idx, 1)[0];
        // If dropping onto an occupied slot in a non-reserves league, swap that
        // player back to the source (reserves) league.
        const targetIsReserves = isReservesLeague(to.leagueId);
        const sourceIsReserves = isReservesLeague(from.leagueId);
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
      const changedLeagues = leagues.filter(l => isLeagueChanged(l.id));
      if (changedLeagues.length === 0) {
        toast.info("No changes to save");
        setSaving(false);
        return;
      }
      for (const league of changedLeagues) {
        // Only delete the rows we are about to replace — and only for leagues
        // that actually changed in this session.
        await fromExt("member_league_registrations").delete().eq("league_id", league.id);
        const players = leagueData[league.id] || [];
        if (players.length > 0) {
          const targetIsReserves = /reserves?/i.test(league.name);
          const { error } = await fromExt("member_league_registrations").insert(
            players.map((p, i) => ({
              club_member_id: p.club_member_id,
              league_id: league.id,
              player_rank: i + 1,
              is_captain: targetIsReserves ? false : p.is_captain,
              is_reserve: targetIsReserves,
              reserve_order: targetIsReserves ? i + 1 : null,
              // Always derive from the permanent affiliation so this stays
              // in sync with the NSF/LS number on the player's profile.
              // Falls back to whatever was already on the row (legacy).
              league_association_number:
                affiliationNumberByMember[p.club_member_id] ||
                p.league_association_number ||
                null,
            }))
          );
          if (error) throw error;
        }
      }
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
      toast.error(err.message || "Failed to save");
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
            <DialogTitle>Allocate {gender === "men" ? "Men" : "Ladies"} to Leagues</DialogTitle>
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
          <p className="text-xs text-muted-foreground">{totalAllocated} allocated • {unassignedMembers.length} unassigned • Drag players into leagues or between positions • Drop a reserve onto a team slot to promote (the displaced player drops back to reserves). Reserves can only sub UP into stronger leagues, never down.</p>
        </DialogHeader>

        {!loaded ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="flex gap-4 flex-1 overflow-hidden">
            {/* Left: Unassigned members pool */}
            <div className="w-56 flex-shrink-0 border rounded-md overflow-hidden flex flex-col">
              <div className="bg-muted/50 px-3 py-2 border-b">
                <p className="text-xs font-semibold">Available Players ({unassignedMembers.length})</p>
                <p className="text-[10px] text-muted-foreground">Sorted by club ladder</p>
              </div>
              <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
                {unassignedMembers.map(m => (
                  <div
                    key={m.id}
                    draggable
                    onDragStart={() => handlePoolDragStart(m.id)}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded cursor-grab active:cursor-grabbing hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-colors"
                  >
                    <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{m.name || m.profiles?.name || "Unknown"}</p>
                      <p className="text-[10px] text-muted-foreground">{getSkillLabel(m.skill_level) || "No level"}</p>
                    </div>
                  </div>
                ))}
                {unassignedMembers.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-4">All players allocated</p>
                )}
              </div>
            </div>

            {/* Right: League columns */}
            <div className="flex-1 overflow-y-auto space-y-3">
              {leagues.map(league => {
                const players = leagueData[league.id] || [];
                return (
                  <Card
                    key={league.id}
                    className="p-3"
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => handleDropOnLeague(league.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold">{league.name}</p>
                        <p className="text-[10px] text-muted-foreground">{league.code || ""} • {players.length} player{players.length !== 1 ? "s" : ""} • League {getLeagueOrdinal(league)}</p>
                      </div>
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
  const [scope, setScope] = useState<"internal" | "region">((association.scope as any) || "region");
  const [membersPayDirectly, setMembersPayDirectly] = useState<boolean>(!!(association as any).members_pay_directly);

  const isPlatformLinked = !!association.platform_association_id;

  const handleSave = async () => {
    if (!name.trim()) return;
    const payload: any = { name, abbreviation, scope, members_pay_directly: membersPayDirectly };
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

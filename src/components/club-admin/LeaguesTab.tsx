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
import { Plus, Trash2, GripVertical, Users, X, ChevronDown, ChevronUp, Crown, RefreshCw } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";

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
  const [addLeagueOpen, setAddLeagueOpen] = useState(false);
  const [allocateGender, setAllocateGender] = useState<"men" | "ladies" | null>(null);
  const qc = useQueryClient();

  const handleDeleteAssoc = async (id: string) => {
    if (!confirm("Delete this association?")) return;
    const { error } = await fromExt("league_associations").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["league-associations"] }); }
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

  const menLeagues = leagues.filter(l => l.name.toLowerCase().includes("men's") || l.name.toLowerCase().startsWith("men"));
  const ladiesLeagues = leagues.filter(l => l.name.toLowerCase().includes("ladies") || l.name.toLowerCase().includes("women"));
  const otherLeagues = leagues.filter(l => !menLeagues.includes(l) && !ladiesLeagues.includes(l));

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
          {associations.map(a => (
            <Card key={a.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium">{a.name} {a.abbreviation ? `(${a.abbreviation})` : ""}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteAssoc(a.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </Card>
          ))}
          {associations.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No associations added yet</p>}
        </div>
      </div>

      {/* Leagues in two columns with inline players */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Leagues</h3>
          <LeagueDialog clubId={clubId} associations={associations} open={addLeagueOpen} onOpenChange={setAddLeagueOpen} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-muted-foreground">Men's ({menLeagues.length})</h4>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAllocateGender("men")} disabled={menLeagues.length === 0}>
                <Users className="w-3.5 h-3.5" />Allocate
              </Button>
            </div>
            <div className="space-y-2">
              {sortLeagues(menLeagues).map(l => (
                <LeagueCard key={l.id} league={l} associations={associations} onDelete={handleDeleteLeague} members={members} />
              ))}
              {menLeagues.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No men's leagues</p>}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-muted-foreground">Ladies ({ladiesLeagues.length})</h4>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAllocateGender("ladies")} disabled={ladiesLeagues.length === 0}>
                <Users className="w-3.5 h-3.5" />Allocate
              </Button>
            </div>
            <div className="space-y-2">
              {sortLeagues(ladiesLeagues).map(l => (
                <LeagueCard key={l.id} league={l} associations={associations} onDelete={handleDeleteLeague} members={members} />
              ))}
              {ladiesLeagues.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No ladies leagues</p>}
            </div>
          </div>
        </div>

        {otherLeagues.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Mixed ({otherLeagues.length})</h4>
            <div className="space-y-2">
              {sortLeagues(otherLeagues).map(l => (
                <LeagueCard key={l.id} league={l} associations={associations} onDelete={handleDeleteLeague} members={members} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Allocate Players Dialog */}
      {allocateGender && (
        <AllocatePlayersDialog
          gender={allocateGender}
          leagues={sortLeagues(allocateGender === "men" ? menLeagues : ladiesLeagues)}
          members={members}
          clubId={clubId}
          open={!!allocateGender}
          onOpenChange={(o) => !o && setAllocateGender(null)}
        />
      )}
    </div>
  );
}

// ─── League Card with inline players ───
function LeagueCard({ league, associations, onDelete, members }: {
  league: League;
  associations: LeagueAssociation[];
  onDelete: (id: string) => void;
  members: ClubMember[];
}) {
  const [expanded, setExpanded] = useState(false);
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

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
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
        <div className="flex items-center gap-1">
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
    </Card>
  );
}

// ─── Allocate Players Dialog (drag & drop across leagues) ───
function AllocatePlayersDialog({ gender, leagues, members, clubId, open, onOpenChange }: {
  gender: "men" | "ladies";
  leagues: League[];
  members: ClubMember[];
  clubId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: ladderPlayers } = useLadder();
  const [leagueData, setLeagueData] = useState<Record<string, LeaguePlayer[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragItem = useRef<{ leagueId: string; idx: number } | null>(null);
  const dragOverItem = useRef<{ leagueId: string; idx: number } | null>(null);
  const [dragFromPool, setDragFromPool] = useState<string | null>(null);

  // Filter members by gender and league status, sorted by skill level
  const genderMembers = members
    .filter(m => m.plays_league && (gender === "ladies" ? m.gender === "Ladies" : m.gender !== "Ladies"))
    .sort((a, b) => getSkillOrder(a.skill_level) - getSkillOrder(b.skill_level));

  // Load existing registrations
  useEffect(() => {
    if (!open) return;
    (async () => {
      const allData: Record<string, LeaguePlayer[]> = {};
      for (const league of leagues) {
        const { data, error } = await fromExt("member_league_registrations")
          .select("*")
          .eq("league_id", league.id)
          .order("player_rank");
        if (!error && data) {
          allData[league.id] = data.map((r: any) => ({
            id: r.id,
            club_member_id: r.club_member_id,
            league_id: r.league_id,
            player_rank: r.player_rank ?? 0,
            is_captain: r.is_captain ?? false,
            league_association_number: r.league_association_number ?? null,
            member: members.find(m => m.id === r.club_member_id),
          }));
        } else {
          allData[league.id] = [];
        }
      }
      setLeagueData(allData);
      setLoaded(true);
    })();
  }, [open, leagues.length]);

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

  // Reshuffle: redistribute all league-eligible members across leagues based on ladder order
  const handleReshuffle = useCallback(() => {
    if (!ladderPlayers || leagues.length === 0) return;

    // Get ladder-ordered member IDs (club_member_id)
    const ladderMemberIds = ladderPlayers
      .filter((lp: any) => {
        const g = lp.gender?.toLowerCase();
        if (gender === "ladies") return g === "female" || g === "ladies" || g === "f";
        return g !== "female" && g !== "ladies" && g !== "f";
      })
      .map((lp: any) => lp.club_member_id);

    // Only include members who are league-eligible
    const eligibleIds = genderMembers.map(m => m.id);
    const orderedMembers = ladderMemberIds.filter((id: string) => eligibleIds.includes(id));
    const remainingEligible = eligibleIds.filter(id => !orderedMembers.includes(id));
    const allOrdered = [...orderedMembers, ...remainingEligible];

    const totalPlayers = allOrdered.length;
    const numLeagues = leagues.length;

    // Calculate players per league: divide evenly, minimum 4 per league
    // If not enough players, just spread what we have
    const basePerLeague = Math.max(4, Math.floor(totalPlayers / numLeagues));
    const remainder = totalPlayers - basePerLeague * numLeagues;

    const newData: Record<string, LeaguePlayer[]> = {};
    let cursor = 0;

    leagues.forEach((league, leagueIdx) => {
      // Distribute remainder across first leagues (1 extra each)
      const extraPlayer = leagueIdx < remainder ? 1 : 0;
      const isLast = leagueIdx === numLeagues - 1;
      const count = isLast ? totalPlayers - cursor : basePerLeague + extraPlayer;
      const slice = allOrdered.slice(cursor, cursor + count);
      cursor += count;

      newData[league.id] = slice.map((memberId, i) => {
        const member = members.find(m => m.id === memberId);
        // Preserve NSF number from any previous league assignment
        const allPrevPlayers = Object.values(leagueData).flat();
        const prevEntry = allPrevPlayers.find(p => p.club_member_id === memberId);
        const wasCaptain = prevEntry?.is_captain ?? false;
        const prevNsf = prevEntry?.league_association_number ?? null;
        return {
          id: `reshuffle-${Date.now()}-${memberId}`,
          club_member_id: memberId,
          league_id: league.id,
          player_rank: i + 1,
          is_captain: wasCaptain,
          league_association_number: prevNsf,
          member,
        };
      });
    });

    const perLeague = leagues.map(l => newData[l.id]?.length || 0);
    setLeagueData(newData);
    toast.success(`Reshuffled ${totalPlayers} players across ${numLeagues} leagues (${perLeague.join(", ")} per league)`);
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
      // Move between leagues
      setLeagueData(prev => {
        const fromItems = [...(prev[from.leagueId] || [])];
        const toItems = [...(prev[to.leagueId] || [])];
        const dragged = fromItems.splice(from.idx, 1)[0];
        dragged.league_id = to.leagueId;
        toItems.splice(to.idx, 0, dragged);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const league of leagues) {
        await fromExt("member_league_registrations").delete().eq("league_id", league.id);
        const players = leagueData[league.id] || [];
        if (players.length > 0) {
          const { error } = await fromExt("member_league_registrations").insert(
            players.map((p, i) => ({
              club_member_id: p.club_member_id,
              league_id: league.id,
              player_rank: i + 1,
              is_captain: p.is_captain,
              league_association_number: p.league_association_number || null,
            }))
          );
          if (error) throw error;
        }
      }
      toast.success("All allocations saved");
      leagues.forEach(l => qc.invalidateQueries({ queryKey: ["league-registrations", l.id] }));
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
          <p className="text-xs text-muted-foreground">{totalAllocated} allocated • {unassignedMembers.length} unassigned • Drag players into leagues or between positions</p>
        </DialogHeader>

        {!loaded ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="flex gap-4 flex-1 overflow-hidden">
            {/* Left: Unassigned members pool */}
            <div className="w-56 flex-shrink-0 border rounded-md overflow-hidden flex flex-col">
              <div className="bg-muted/50 px-3 py-2 border-b">
                <p className="text-xs font-semibold">Available Players ({unassignedMembers.length})</p>
                <p className="text-[10px] text-muted-foreground">Sorted by skill level</p>
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
  const qc = useQueryClient();

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const { error } = await fromExt("league_associations").insert({ ...form, club_id: clubId });
    if (error) toast.error(error.message);
    else { toast.success("Association added"); onOpenChange(false); setForm({ name: "", abbreviation: "" }); qc.invalidateQueries({ queryKey: ["league-associations"] }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Association</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add League Association</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Northerns Squash Federation" /></div>
          <div className="space-y-1"><Label>Abbreviation</Label><Input value={form.abbreviation} onChange={e => setForm(p => ({ ...p, abbreviation: e.target.value }))} placeholder="e.g. NSF" /></div>
          <Button onClick={handleSave} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── League Dialog (bulk add) ───
function LeagueDialog({ clubId, associations, open, onOpenChange }: { clubId: string; associations: LeagueAssociation[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [selectedMen, setSelectedMen] = useState<string[]>([]);
  const [selectedLadies, setSelectedLadies] = useState<string[]>([]);
  const [prefix, setPrefix] = useState("");
  const [startNum, setStartNum] = useState(1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [associationId, setAssociationId] = useState("");
  const qc = useQueryClient();

  const handleToggle = (league: string, gender: "men" | "ladies") => {
    const setter = gender === "men" ? setSelectedMen : setSelectedLadies;
    setter(prev => prev.includes(league) ? prev.filter(l => l !== league) : [...prev, league]);
  };

  const buildEntries = () => {
    const parseNum = (l: string) => parseInt(l);
    const sortedMen = [...selectedMen].sort((a, b) => parseNum(a) - parseNum(b));
    const sortedLadies = [...selectedLadies].sort((a, b) => parseNum(a) - parseNum(b));

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

    return [...menEntries, ...ladiesEntries];
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
    setSelectedMen([]); setSelectedLadies([]); setPrefix(""); setStartNum(1); setYear(new Date().getFullYear()); setAssociationId("");
    qc.invalidateQueries({ queryKey: ["leagues"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Leagues</Button></DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Leagues</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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

          <div className="space-y-1">
            <Label>Association</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={associationId} onChange={e => setAssociationId(e.target.value)}>
              <option value="">None</option>
              {associations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <Button onClick={handleSave} className="w-full" disabled={entries.length === 0}>
            Add {entries.length} League(s)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

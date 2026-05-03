import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Search, UserCheck, X, Trophy, CalendarDays, Users, ListOrdered, Star, MapPin } from "lucide-react";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub } from "@/hooks/use-club";
import { useMemberContext } from "@/contexts/MemberContext";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, addDays } from "date-fns";

export type MatchType = "friendly" | "ladder" | "league" | "club_champs" | "tournament";
export type ScoringFormat = "par11" | "par15" | "english9";
export type BestOf = 3 | 5;
export type MatchSource = "manual" | "tournament" | "booking" | "league";

export interface PlayerInfo {
  name: string;
  number: string;
  club: string;
  clubMemberId?: string;
}

export type DeuceRule = "win_by_2" | "sudden_death";

export interface MarkerConfig {
  playerA: PlayerInfo;
  playerB: PlayerInfo;
  partnerA?: PlayerInfo;
  partnerB?: PlayerInfo;
  isDoubles: boolean;
  matchType: MatchType;
  scoringFormat: ScoringFormat;
  bestOf: BestOf;
  deuceRule: DeuceRule;
  source: MatchSource;
  sourceId?: string; // tournament match id or booking id
}

interface Props {
  onStart: (config: MarkerConfig) => void;
}

// ---------- Reusable player search/input field ----------
function PlayerField({
  label,
  player,
  onChange,
  disabled,
}: {
  label: string;
  player: PlayerInfo;
  onChange: (p: PlayerInfo) => void;
  disabled?: boolean;
}) {
  const { club: clubFromHost } = useClubContext();
  const { data: myClubData } = useMyClub();
  const club = clubFromHost || myClubData?.club || null;
  const clubName = club?.name || "";

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: members = [] } = useQuery({
    queryKey: ["club-members-marker", club?.id],
    queryFn: async () => {
      if (!club?.id) return [];
      // Fetch club members
      const { data: clubMembers, error } = await supabase
        .from("club_members")
        .select("id, name, club_member_number, gender")
        .eq("club_id", club.id)
        .order("name");
      if (error) throw error;
      // Also fetch visitors
      const { data: visitors } = await supabase
        .from("club_visitors")
        .select("id, first_name, last_name, member_number, category, home_club_name")
        .eq("club_id", club.id);
      const visitorRows = (visitors || []).map((v) => ({
        id: v.id,
        name: `${v.first_name} ${v.last_name}`,
        club_member_number: v.member_number || null,
        gender: v.category === "Ladies" ? "Ladies" : "Men",
        _isVisitor: true,
        _homeClub: v.home_club_name,
      }));
      return [...(clubMembers || []), ...visitorRows];
    },
    enabled: !!club?.id,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return members.slice(0, 20);
    const q = searchTerm.toLowerCase();
    return members
      .filter(
        (m: any) =>
          m.name?.toLowerCase().includes(q) ||
          m.club_member_number?.toLowerCase().includes(q) ||
          m._homeClub?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [members, searchTerm]);

  const selectMember = (m: (typeof members)[0]) => {
    const isVisitor = (m as any)._isVisitor;
    onChange({
      name: m.name || "",
      number: m.club_member_number || "",
      club: isVisitor ? (m as any)._homeClub || "" : clubName,
      clubMemberId: m.id,
    });
    setSearchOpen(false);
    setSearchTerm("");
  };

  const clearSelection = () => {
    onChange({ name: "", number: "", club: "", clubMemberId: undefined });
  };

  if (disabled && player.name) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/30">
        <p className="text-sm flex-1">
          <span className="font-medium">{player.name}</span>
          {player.number && (
            <span className="text-muted-foreground ml-1">#{player.number}</span>
          )}
        </p>
        {player.clubMemberId && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <UserCheck className="w-3 h-3" />
            Member
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {club && members.length > 0 && !player.clubMemberId && (
        <p className="text-xs font-medium text-primary bg-primary/10 rounded-md px-3 py-1.5">
          Not a member? Enter info manually below.
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        {player.clubMemberId && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <UserCheck className="w-3 h-3" />
            Club member
          </Badge>
        )}
      </div>

      {club && members.length > 0 && !player.clubMemberId && (
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-xs"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search className="w-3.5 h-3.5" />
            Search members & visitors…
          </Button>
          {searchOpen && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto">
              <div className="p-2 border-b">
                <Input
                  autoFocus
                  placeholder="Search by name or number…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  No members found
                </p>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center justify-between"
                    onClick={() => selectMember(m)}
                  >
                    <span className="text-sm font-medium truncate">
                      {m.name}
                      {(m as any)._isVisitor && <span className="text-xs text-muted-foreground ml-1">({(m as any)._homeClub})</span>}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {(m as any)._isVisitor ? "Visitor" : (m.club_member_number || "—")}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {player.clubMemberId && (
        <div className="flex items-center gap-2">
          <p className="text-sm flex-1">
            <span className="font-medium">{player.name}</span>
            {player.number && (
              <span className="text-muted-foreground ml-1">#{player.number}</span>
            )}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={clearSelection}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {!player.clubMemberId && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input
              placeholder="Player name"
              value={player.name}
              onChange={(e) => onChange({ ...player, name: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Number</Label>
            <Input
              placeholder="e.g. 042"
              value={player.number}
              onChange={(e) => onChange({ ...player, number: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Club</Label>
            <Input
              placeholder="Club name"
              value={player.club}
              onChange={(e) => onChange({ ...player, club: e.target.value })}
              className="h-9 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Main setup component ----------
export function MarkerSetup({ onStart }: Props) {
  const { club: hostClub } = useClubContext();
  const { data: myClubData } = useMyClub();
  const { activeMember } = useMemberContext();
  const navigate = useNavigate();
  const resolvedClub = hostClub || myClubData?.club || null;
  const clubId = resolvedClub?.id;
  const clubName = resolvedClub?.name || "";

  const emptyPlayer = (): PlayerInfo => ({ name: "", number: "", club: clubName });

  const [source, setSource] = useState<MatchSource>("manual");
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [isDoubles, setIsDoubles] = useState(false);

  const [playerA, setPlayerA] = useState<PlayerInfo>(emptyPlayer());
  const [playerB, setPlayerB] = useState<PlayerInfo>(emptyPlayer());
  const [partnerA, setPartnerA] = useState<PlayerInfo>(emptyPlayer());
  const [partnerB, setPartnerB] = useState<PlayerInfo>(emptyPlayer());

  const [matchType, setMatchType] = useState<MatchType>("friendly");
  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>("par11");
  const [bestOf, setBestOf] = useState<BestOf>(3);
  const [deuceRule, setDeuceRule] = useState<DeuceRule>("win_by_2");

  // League filter mode: "mine" (default — fixtures my league/team plays in) or "all"
  const [leagueScope, setLeagueScope] = useState<"mine" | "all">("mine");

  // Fetch active tournament matches (scheduled, not yet completed)
  const { data: tournamentMatches = [] } = useQuery({
    queryKey: ["marker-tournament-matches", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await supabase
        .from("club_champs_matches")
        .select(`
          id, group_number, round_number, scheduled_date, scheduled_time, status,
          champ_id, court_id,
          player_a_member_id, player_b_member_id,
          partner_a_member_id, partner_b_member_id
        `)
        .in("status", ["scheduled", "in_progress"])
        .order("scheduled_date", { ascending: true });
      if (error) throw error;

      // Fetch champs info for names
      const champIds = [...new Set((data || []).map((m) => m.champ_id))];
      if (champIds.length === 0) return [];

      const { data: champs } = await supabase
        .from("club_champs")
        .select("id, name, club_id, match_type")
        .in("id", champIds)
        .eq("club_id", clubId);

      const clubChampIds = new Set((champs || []).map((c) => c.id));

      // Collect member IDs for name lookup
      const memberIds = new Set<string>();
      (data || []).forEach((m) => {
        if (clubChampIds.has(m.champ_id)) {
          memberIds.add(m.player_a_member_id);
          memberIds.add(m.player_b_member_id);
          if (m.partner_a_member_id) memberIds.add(m.partner_a_member_id);
          if (m.partner_b_member_id) memberIds.add(m.partner_b_member_id);
        }
      });

      const { data: members } = await supabase
        .from("club_members")
        .select("id, name, club_member_number")
        .in("id", [...memberIds]);

      const memberMap = new Map((members || []).map((m) => [m.id, m]));
      const champMap = new Map((champs || []).map((c) => [c.id, c]));

      return (data || [])
        .filter((m) => clubChampIds.has(m.champ_id))
        .map((m) => {
          const champ = champMap.get(m.champ_id);
          const pA = memberMap.get(m.player_a_member_id);
          const pB = memberMap.get(m.player_b_member_id);
          const ptA = m.partner_a_member_id ? memberMap.get(m.partner_a_member_id) : null;
          const ptB = m.partner_b_member_id ? memberMap.get(m.partner_b_member_id) : null;
          return {
            ...m,
            champName: champ?.name || "Tournament",
            matchType: champ?.match_type || "singles",
            playerAName: pA?.name || "Player A",
            playerBName: pB?.name || "Player B",
            playerANumber: pA?.club_member_number || "",
            playerBNumber: pB?.club_member_number || "",
            partnerAName: ptA?.name || null,
            partnerBName: ptB?.name || null,
            partnerANumber: ptA?.club_member_number || "",
            partnerBNumber: ptB?.club_member_number || "",
            partnerAMemberId: m.partner_a_member_id,
            partnerBMemberId: m.partner_b_member_id,
          };
        });
    },
    enabled: !!clubId,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch today's bookings
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: todayBookings = [] } = useQuery({
    queryKey: ["marker-bookings", clubId, today],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("id, date, start_time, end_time, court_id, user_id, opponent_id, club_member_id, opponent_member_id, guest_name, status")
        .eq("club_id", clubId)
        .eq("date", today)
        .eq("status", "active")
        .order("start_time");
      if (error) throw error;

      // Collect member IDs
      const memberIds = new Set<string>();
      (data || []).forEach((b) => {
        if (b.club_member_id) memberIds.add(b.club_member_id);
        if (b.opponent_member_id) memberIds.add(b.opponent_member_id);
      });

      const { data: members } = memberIds.size > 0
        ? await supabase
            .from("club_members")
            .select("id, name, club_member_number, user_id")
            .in("id", [...memberIds])
        : { data: [] };

      const memberMap = new Map((members || []).map((m) => [m.id, m]));

      // Fetch court names
      const courtIds = [...new Set((data || []).map((b) => b.court_id))];
      const { data: courts } = courtIds.length > 0
        ? await supabase.from("courts").select("id, name").in("id", courtIds)
        : { data: [] };
      const courtMap = new Map((courts || []).map((c) => [c.id, c.name]));

      return (data || []).map((b) => {
        const booker = b.club_member_id ? memberMap.get(b.club_member_id) : null;
        const opponent = b.opponent_member_id ? memberMap.get(b.opponent_member_id) : null;
        return {
          ...b,
          bookerName: booker?.name || "Unknown",
          bookerNumber: booker?.club_member_number || "",
          bookerMemberId: b.club_member_id,
          opponentName: opponent?.name || b.guest_name || "",
          opponentNumber: opponent?.club_member_number || "",
          opponentMemberId: b.opponent_member_id || null,
          courtName: courtMap.get(b.court_id) || `Court ${b.court_id}`,
        };
      });
    },
    enabled: !!clubId,
    staleTime: 60 * 1000,
  });

  // Fetch leagues and their registered players
  const { data: leaguesWithPlayers = [] } = useQuery({
    queryKey: ["marker-leagues", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data: leagues, error } = await fromExt("leagues").select("id, name, code").eq("club_id", clubId!);
      if (error) throw error;
      if (!leagues || leagues.length === 0) return [];

      // Fetch all registrations for these leagues
      const leagueIds = leagues.map((l: any) => l.id) as string[];
      const { data: regs } = await fromExt("member_league_registrations")
        .select("league_id, club_member_id, player_rank")
        .in("league_id", leagueIds);

      // Fetch member names
      const memberIds = [...new Set((regs || []).map((r: any) => r.club_member_id))] as string[];
      const { data: members } = memberIds.length > 0
        ? await supabase.from("club_members").select("id, name, club_member_number").in("id", memberIds as string[])
        : { data: [] };
      const memberMap = new Map((members || []).map((m) => [m.id, m]));

      return leagues.map((l: any) => ({
        ...l,
        players: (regs || [])
          .filter((r: any) => r.league_id === l.id)
          .sort((a: any, b: any) => (a.player_rank || 99) - (b.player_rank || 99))
          .map((r: any) => {
            const m = memberMap.get(r.club_member_id);
            return {
              clubMemberId: r.club_member_id,
              name: m?.name || "Unknown",
              number: m?.club_member_number || "",
              rank: r.player_rank,
            };
          }),
      }));
    },
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
  });

  // Check if any league fixtures have completed setup (captain has set up players)
  const { data: readyLeagueFixtures = [] } = useQuery({
    queryKey: ["marker-league-fixtures-ready", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      // Get fixture results that have setup done (status = setup, draft, submitted, confirmed)
      const { data, error } = await supabase
        .from("league_fixture_results" as any)
        .select("fixture_id, status")
        .in("status", ["setup", "draft", "submitted", "confirmed"]);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
    staleTime: 2 * 60 * 1000,
  });

  const leagueAvailable = leaguesWithPlayers.length > 0 && readyLeagueFixtures.length > 0;

  const [selectedLeagueId, setSelectedLeagueId] = useState("");
  const selectedLeague = leaguesWithPlayers.find((l: any) => l.id === selectedLeagueId);

  useEffect(() => {
    if (source === "tournament" && selectedSourceId) {
      const match = tournamentMatches.find((m) => m.id === selectedSourceId);
      if (match) {
        setPlayerA({
          name: match.playerAName,
          number: match.playerANumber,
          club: clubName,
          clubMemberId: match.player_a_member_id,
        });
        setPlayerB({
          name: match.playerBName,
          number: match.playerBNumber,
          club: clubName,
          clubMemberId: match.player_b_member_id,
        });
        setMatchType("club_champs");

        const hasDoubles = match.matchType === "doubles" || match.matchType === "mixed";
        setIsDoubles(hasDoubles);
        if (hasDoubles && match.partnerAMemberId) {
          setPartnerA({
            name: match.partnerAName || "",
            number: match.partnerANumber || "",
            club: clubName,
            clubMemberId: match.partnerAMemberId,
          });
          setPartnerB({
            name: match.partnerBName || "",
            number: match.partnerBNumber || "",
            club: clubName,
            clubMemberId: match.partnerBMemberId || undefined,
          });
        }
      }
    } else if (source === "booking" && selectedSourceId) {
      const booking = todayBookings.find((b) => b.id === selectedSourceId);
      if (booking) {
        setPlayerA({
          name: booking.bookerName,
          number: booking.bookerNumber,
          club: clubName,
          clubMemberId: booking.bookerMemberId || undefined,
        });
        setPlayerB({
          name: booking.opponentName,
          number: booking.opponentNumber,
          club: clubName,
          clubMemberId: booking.opponentMemberId || undefined,
        });
        setMatchType("friendly");
        setIsDoubles(false);
      }
    }
  }, [source, selectedSourceId, tournamentMatches, todayBookings, clubName]);

  // Reset when source changes
  useEffect(() => {
    setSelectedSourceId("");
    setSelectedLeagueId("");
    setPlayerA(emptyPlayer());
    setPlayerB(emptyPlayer());
    setPartnerA(emptyPlayer());
    setPartnerB(emptyPlayer());
    setIsDoubles(false);
    if (source === "manual") {
      setMatchType("friendly");
    } else if (source === "league") {
      setMatchType("league");
    }
  }, [source]);

  const playersFromSource = (source === "tournament" || source === "booking") && !!selectedSourceId;
  const canStart =
    playerA.name.trim().length > 0 &&
    playerB.name.trim().length > 0 &&
    (!isDoubles || (partnerA.name.trim().length > 0 && partnerB.name.trim().length > 0));

  return (
    <div className="space-y-4">
      {/* Source selector */}
      {clubId && (
        <Card className="p-4 space-y-3">
          <p className="text-sm font-semibold font-heading">Match Source</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={source === "manual" ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setSource("manual")}
            >
              <Users className="w-3.5 h-3.5 mr-1" />
              Manual
            </Button>
            <Button
              variant={source === "league" ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setSource("league")}
              disabled={!leagueAvailable}
              title={!leagueAvailable ? "League setup must be completed by the captain first" : undefined}
            >
              <ListOrdered className="w-3.5 h-3.5 mr-1" />
              League
            </Button>
            <Button
              variant={source === "tournament" ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setSource("tournament")}
              disabled={tournamentMatches.length === 0}
            >
              <Trophy className="w-3.5 h-3.5 mr-1" />
              Tournament
            </Button>
            <Button
              variant={source === "booking" ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setSource("booking")}
              disabled={todayBookings.length === 0}
            >
              <CalendarDays className="w-3.5 h-3.5 mr-1" />
              Booking
            </Button>
          </div>

          {/* Tournament list */}
          {source === "tournament" && (
            <div className="max-h-52 overflow-y-auto space-y-1">
              {tournamentMatches.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No scheduled tournament matches</p>
              ) : (
                tournamentMatches.map((m) => {
                  const isSelected = selectedSourceId === m.id;
                  const dateStr = m.scheduled_date ? format(new Date(m.scheduled_date), "dd MMM") : "";
                  const doublesLabel = m.matchType === "doubles" || m.matchType === "mixed" ? " (Doubles)" : "";
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedSourceId(m.id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <p className="text-xs font-medium text-primary">{m.champName}{doublesLabel}</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {m.playerAName} vs {m.playerBName}
                      </p>
                      {dateStr && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {dateStr} {m.scheduled_time ? `at ${m.scheduled_time.slice(0, 5)}` : ""} · Grp {m.group_number} R{m.round_number}
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Booking list */}
          {source === "booking" && (
            <div className="max-h-52 overflow-y-auto space-y-1">
              {todayBookings.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">No bookings today</p>
              ) : (
                todayBookings.map((b) => {
                  const isSelected = selectedSourceId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedSourceId(b.id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <p className="text-xs font-medium text-primary">{b.courtName}</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {b.bookerName} {b.opponentName ? `vs ${b.opponentName}` : "(Solo)"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {b.start_time?.slice(0, 5)} – {b.end_time?.slice(0, 5)}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* League selector */}
          {source === "league" && (
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Select League</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={selectedLeagueId}
                  onChange={(e) => {
                    setSelectedLeagueId(e.target.value);
                    setPlayerA(emptyPlayer());
                    setPlayerB(emptyPlayer());
                  }}
                >
                  <option value="">Choose a league…</option>
                  {leaguesWithPlayers.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.name} {l.code ? `(${l.code})` : ""} — {l.players.length} players
                    </option>
                  ))}
                </select>
              </div>

              {selectedLeague && selectedLeague.players.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs mb-1 block">Player A</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                      value={playerA.clubMemberId || ""}
                      onChange={(e) => {
                        const p = selectedLeague.players.find((pl: any) => pl.clubMemberId === e.target.value);
                        if (p) setPlayerA({ name: p.name, number: p.number, club: clubName, clubMemberId: p.clubMemberId });
                        else setPlayerA(emptyPlayer());
                      }}
                    >
                      <option value="">Select player…</option>
                      {selectedLeague.players
                        .filter((p: any) => p.clubMemberId !== playerB.clubMemberId)
                        .map((p: any) => (
                          <option key={p.clubMemberId} value={p.clubMemberId}>
                            {p.rank ? `#${p.rank} ` : ""}{p.name} {p.number ? `(${p.number})` : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Player B</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                      value={playerB.clubMemberId || ""}
                      onChange={(e) => {
                        const p = selectedLeague.players.find((pl: any) => pl.clubMemberId === e.target.value);
                        if (p) setPlayerB({ name: p.name, number: p.number, club: clubName, clubMemberId: p.clubMemberId });
                        else setPlayerB(emptyPlayer());
                      }}
                    >
                      <option value="">Select player…</option>
                      {selectedLeague.players
                        .filter((p: any) => p.clubMemberId !== playerA.clubMemberId)
                        .map((p: any) => (
                          <option key={p.clubMemberId} value={p.clubMemberId}>
                            {p.rank ? `#${p.rank} ` : ""}{p.name} {p.number ? `(${p.number})` : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              {selectedLeague && selectedLeague.players.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No players registered in this league</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Players */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold font-heading">
            {isDoubles ? "Side A (serve first)" : "Player A (serve first)"}
          </p>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Doubles</Label>
            <Switch checked={isDoubles} onCheckedChange={setIsDoubles} />
          </div>
        </div>
        <PlayerField label="Player A" player={playerA} onChange={setPlayerA} disabled={playersFromSource} />
        {isDoubles && (
          <PlayerField
            label="Partner A"
            player={partnerA}
            onChange={setPartnerA}
            disabled={playersFromSource && !!partnerA.clubMemberId}
          />
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <p className="text-sm font-semibold font-heading">
          {isDoubles ? "Side B" : "Player B"}
        </p>
        <PlayerField label="Player B" player={playerB} onChange={setPlayerB} disabled={playersFromSource} />
        {isDoubles && (
          <PlayerField
            label="Partner B"
            player={partnerB}
            onChange={setPartnerB}
            disabled={playersFromSource && !!partnerB.clubMemberId}
          />
        )}
      </Card>

      {/* Match settings */}
      <Card className="p-4 space-y-3">
        <p className="text-sm font-semibold font-heading">Match Settings</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="ladder">Ladder</SelectItem>
                <SelectItem value="league">League</SelectItem>
                <SelectItem value="club_champs">Club Champs</SelectItem>
                <SelectItem value="tournament">Tournament</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Scoring</Label>
            <Select value={scoringFormat} onValueChange={(v) => setScoringFormat(v as ScoringFormat)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="par11">PAR 11</SelectItem>
                <SelectItem value="par15">PAR 15</SelectItem>
                <SelectItem value="english9">English 9</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Best of</Label>
            <Select value={String(bestOf)} onValueChange={(v) => setBestOf(Number(v) as BestOf)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Best of 3</SelectItem>
                <SelectItem value="5">Best of 5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Deuce Rule</Label>
            <Select value={deuceRule} onValueChange={(v) => setDeuceRule(v as DeuceRule)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="win_by_2">Win by 2</SelectItem>
                <SelectItem value="sudden_death">Sudden Death</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Button
        className="w-full"
        size="lg"
        disabled={!canStart}
        onClick={() =>
          onStart({
            playerA,
            playerB,
            partnerA: isDoubles ? partnerA : undefined,
            partnerB: isDoubles ? partnerB : undefined,
            isDoubles,
            matchType,
            scoringFormat,
            bestOf,
            deuceRule,
            source,
            sourceId: selectedSourceId || selectedLeagueId || undefined,
          })
        }
      >
        Start Marking
      </Button>
    </div>
  );
}

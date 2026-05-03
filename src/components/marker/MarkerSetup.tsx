import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  clubId?: string;
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
  const [searchParams, setSearchParams] = useSearchParams();
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

  // Fetch upcoming bookings (today + next 7 days)
  const today = format(new Date(), "yyyy-MM-dd");
  const horizonBookings = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const { data: todayBookings = [] } = useQuery({
    queryKey: ["marker-bookings", clubId, today, horizonBookings],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("id, date, start_time, end_time, court_id, user_id, opponent_id, club_member_id, opponent_member_id, guest_name, status")
        .eq("club_id", clubId)
        .gte("date", today)
        .lte("date", horizonBookings)
        .eq("status", "active")
        .order("date")
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

  // Fetch upcoming league fixtures for this club's teams (next ~21 days)
  const { data: upcomingLeagueFixtures = [] } = useQuery({
    queryKey: ["marker-upcoming-league-fixtures", clubId, activeMember?.id],
    queryFn: async () => {
      if (!clubId) return [] as any[];

      const { data: leagues } = await fromExt("leagues")
        .select("id, name, code, association_id")
        .eq("club_id", clubId);
      if (!leagues || leagues.length === 0) return [];

      const assocIds = [...new Set(leagues.map((l: any) => l.association_id).filter(Boolean))] as string[];
      const { data: assocs } = assocIds.length
        ? await fromExt("league_associations").select("id, platform_association_id").in("id", assocIds)
        : { data: [] as any[] };
      const platformAssocIds = [...new Set((assocs || []).map((a: any) => a.platform_association_id).filter(Boolean))] as string[];

      const clubPrefixes = new Set<string>();
      for (const l of leagues) {
        const m = (l.code || "").match(/^([A-Za-z]+)/);
        if (m) clubPrefixes.add(m[1].toUpperCase());
      }

      const today = format(new Date(), "yyyy-MM-dd");
      const horizon = format(addDays(new Date(), 21), "yyyy-MM-dd");

      let regional: any[] = [];
      if (platformAssocIds.length > 0 && clubPrefixes.size > 0) {
        const { data } = await supabase
          .from("platform_league_fixtures")
          .select("id, fixture_date, home_team_code, away_team_code, division, venue_name, association_id")
          .in("association_id", platformAssocIds)
          .gte("fixture_date", today)
          .lte("fixture_date", horizon)
          .order("fixture_date");
        regional = (data || []).filter((f: any) => {
          const home = (f.home_team_code || "").toUpperCase();
          const away = (f.away_team_code || "").toUpperCase();
          return [...clubPrefixes].some((p) => {
            const re = new RegExp(`^${p}\\d+$`);
            return re.test(home) || re.test(away);
          });
        });
      }

      // Which fixtures is the active member in the lineup for?
      let myLineupIds = new Set<string>();
      if (activeMember?.id && regional.length > 0) {
        const { data: lineups } = await supabase
          .from("league_fixture_lineups")
          .select("fixture_id")
          .eq("club_member_id", activeMember.id)
          .in("fixture_id", regional.map((f: any) => f.id));
        myLineupIds = new Set((lineups || []).map((l: any) => l.fixture_id as string));
      }

      const myCodes = new Set(leagues.map((l: any) => (l.code || "").toUpperCase()).filter(Boolean));

      return regional.map((f: any) => ({
        ...f,
        inMyLineup: myLineupIds.has(f.id),
        isMyTeam: myCodes.has((f.home_team_code || "").toUpperCase()) || myCodes.has((f.away_team_code || "").toUpperCase()),
      }));
    },
    enabled: !!clubId,
    staleTime: 2 * 60 * 1000,
  });

  const leagueAvailable = upcomingLeagueFixtures.length > 0;

  const visibleLeagueFixtures = useMemo(() => {
    if (leagueScope === "all") return upcomingLeagueFixtures;
    const mine = upcomingLeagueFixtures.filter((f: any) => f.inMyLineup || f.isMyTeam);
    return mine.length > 0 ? mine : upcomingLeagueFixtures;
  }, [upcomingLeagueFixtures, leagueScope]);

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

  // Deep-link prefill: ?source=tournament&matchId=... (also booking)
  useEffect(() => {
    const src = searchParams.get("source");
    const matchId = searchParams.get("matchId") || searchParams.get("bookingId");
    if (!src || !matchId) return;
    if (src === "tournament" && tournamentMatches.length > 0) {
      const exists = tournamentMatches.find((m) => m.id === matchId);
      if (exists) {
        setSource("tournament");
        setSelectedSourceId(matchId);
        searchParams.delete("source");
        searchParams.delete("matchId");
        setSearchParams(searchParams, { replace: true });
      }
    } else if (src === "booking" && todayBookings.length > 0) {
      const exists = todayBookings.find((b) => b.id === matchId);
      if (exists) {
        setSource("booking");
        setSelectedSourceId(matchId);
        searchParams.delete("source");
        searchParams.delete("bookingId");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, tournamentMatches, todayBookings]);


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
              title={!leagueAvailable ? "No upcoming league fixtures in the next 3 weeks" : undefined}
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
                        {b.date ? format(parseISO(b.date), "EEE dd MMM") + " · " : ""}{b.start_time?.slice(0, 5)} – {b.end_time?.slice(0, 5)}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* League fixtures list */}
          {source === "league" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  Upcoming league fixtures
                </p>
                <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setLeagueScope("mine")}
                    className={`text-[10px] px-2 py-1 rounded ${leagueScope === "mine" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"}`}
                  >
                    My league
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeagueScope("all")}
                    className={`text-[10px] px-2 py-1 rounded ${leagueScope === "all" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"}`}
                  >
                    All leagues
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-1">
                {visibleLeagueFixtures.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    No upcoming league fixtures in the next 3 weeks.
                  </p>
                ) : (
                  visibleLeagueFixtures.map((f: any) => {
                    const dateStr = f.fixture_date ? format(parseISO(f.fixture_date), "EEE dd MMM") : "";
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => navigate(`/league-games/${f.id}`)}
                        className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-muted/40 ${
                          f.inMyLineup
                            ? "border-primary bg-primary/10"
                            : f.isMyTeam
                            ? "border-primary/50 bg-primary/5"
                            : "border-border"
                        }`}
                      >
                        <div className="flex items-center gap-1 mb-1 flex-wrap">
                          {f.inMyLineup && (
                            <Badge className="bg-primary text-primary-foreground text-[10px] gap-1">
                              <UserCheck className="w-3 h-3" /> You're playing
                            </Badge>
                          )}
                          {!f.inMyLineup && f.isMyTeam && (
                            <Badge className="bg-primary/15 text-primary text-[10px] gap-1">
                              <Star className="w-3 h-3" /> Your league
                            </Badge>
                          )}
                          {f.division && (
                            <Badge variant="outline" className="text-[10px]">{f.division}</Badge>
                          )}
                        </div>
                        <p className="text-sm font-semibold">
                          {f.home_team_code} <span className="text-muted-foreground text-xs">vs</span> {f.away_team_code}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>{dateStr}{f.fixture_time ? ` · ${String(f.fixture_time).slice(0, 5)}` : ""}</span>
                          {f.venue_name && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {f.venue_name}
                            </span>
                          )}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Tap a fixture to open the team scorecard, set up players and mark each rubber.
              </p>
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
            sourceId: selectedSourceId || undefined,
            clubId: clubId || undefined,
          })
        }
      >
        Start Marking
      </Button>
    </div>
  );
}

import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { SEO } from "@/components/SEO";
import { LadderPlayerCard, type LadderPlayer, type LeagueChip } from "@/components/LadderPlayerCard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Swords, X, Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useLadder, useCreateChallenge, useSquashTotals, useHeadToHead } from "@/hooks/use-data";
import { useMyClub, useMyClubMember } from "@/hooks/use-club";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { format, addDays } from "date-fns";
import { isCourtAvailable } from "@/lib/court-availability";
import { toast } from "sonner";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { BarChart3 } from "lucide-react";

// Inline opponent stats for the challenge dialog
function OpponentStatsInline({ memberId, myMemberId }: { memberId: string; myMemberId: string }) {
  const { data: stats, isLoading } = useSquashTotals(null, { memberId });
  const { data: h2h } = useHeadToHead(null, 20, { memberId: myMemberId });
  const h2hRecord = useMemo(() => h2h?.find((r) => r.opponent_id === memberId) || null, [h2h, memberId]);

  if (isLoading) return <p className="text-[11px] text-muted-foreground">Loading stats…</p>;
  if (!stats) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <BarChart3 className="w-3 h-3" /> Match Stats
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-base font-bold text-foreground">{stats.wins}</p>
          <p className="text-[10px] text-muted-foreground">Wins</p>
        </div>
        <div>
          <p className="text-base font-bold text-foreground">{stats.losses}</p>
          <p className="text-[10px] text-muted-foreground">Losses</p>
        </div>
        <div>
          <p className="text-base font-bold text-primary">{stats.win_rate}%</p>
          <p className="text-[10px] text-muted-foreground">Win Rate</p>
        </div>
      </div>
      {h2hRecord && (
        <p className="text-[11px] text-muted-foreground border-t pt-1">
          Head-to-head: <span className="text-primary font-medium">{h2hRecord.wins}W</span>–<span className="text-destructive font-medium">{h2hRecord.losses}L</span>
        </p>
      )}
    </div>
  );
}

export default function Ladder() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeMember } = useMemberContext();
  const { data: clubData } = useMyClub();
  const { data: myClubMember } = useMyClubMember();
  const clubId = clubData?.club?.id;
  const { data: players, isLoading } = useLadder(clubId);
  const queryClient = useQueryClient();
  const createChallenge = useCreateChallenge();

  // The active member's club_member_id is the primary identity
  const myMemberId = activeMember?.id || myClubMember?.id || null;

  // Challenge dialog state
  const [challengeDialog, setChallengeDialog] = useState<{
    open: boolean;
    player: LadderPlayer | null;
  }>({ open: false, player: null });
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("18:00");
  const [courtId, setCourtId] = useState<string>("");
  const [sending, setSending] = useState(false);

  // Blocked challenge dialog
  const [blockedChallenge, setBlockedChallenge] = useState<{
    open: boolean;
    description: string;
  }>({ open: false, description: "" });

  // Fetch courts
  const [courts, setCourts] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    if (!clubId) return;
    supabase.from("courts").select("id, name").eq("club_id", clubId).then(({ data }) => {
      setCourts(data || []);
      if (data && data.length > 0 && !courtId) setCourtId(String(data[0].id));
    });
  }, [clubId]);

  useEffect(() => {
    const channel = supabase
      .channel("realtime:ladder-profiles")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" },
        () => queryClient.invalidateQueries({ queryKey: ["ladder"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // ---- Fetch club leagues + member registrations for badges ----
  const { data: leagueData } = useQuery({
    queryKey: ["ladder-league-badges", clubId],
    queryFn: async () => {
      if (!clubId) return { leagues: [] as LeagueChip[], memberLeagueMap: new Map<string, LeagueChip[]>() };
      const { data: leagues, error } = await fromExt("leagues")
        .select("id, name, code")
        .eq("club_id", clubId!);
      if (error) throw error;
      const leagueRows = (leagues || []) as Array<{ id: string; name: string; code: string | null }>;
      if (leagueRows.length === 0) return { leagues: [] as LeagueChip[], memberLeagueMap: new Map<string, LeagueChip[]>() };

      // Sort leagues by numeric suffix in name (e.g. "League 1", "League 2")
      const sorted = [...leagueRows].sort((a, b) => {
        const na = parseInt(a.name.match(/\d+/)?.[0] || "999", 10);
        const nb = parseInt(b.name.match(/\d+/)?.[0] || "999", 10);
        if (na !== nb) return na - nb;
        return a.name.localeCompare(b.name);
      });

      const chipById = new Map<string, LeagueChip>();
      sorted.forEach((l, idx) => {
        const num = parseInt(l.name.match(/\d+/)?.[0] || "", 10);
        const shortLabel = Number.isFinite(num) ? `L${num}` : `L${idx + 1}`;
        chipById.set(l.id, { id: l.id, name: l.name, code: l.code, shortLabel });
      });

      const leagueIds = sorted.map((l) => l.id);
      const { data: regs } = await fromExt("member_league_registrations")
        .select("club_member_id, league_id")
        .in("league_id", leagueIds);

      const memberLeagueMap = new Map<string, LeagueChip[]>();
      ((regs || []) as Array<{ club_member_id: string; league_id: string }>).forEach((r) => {
        const chip = chipById.get(r.league_id);
        if (!chip) return;
        const existing = memberLeagueMap.get(r.club_member_id) || [];
        if (!existing.find((c) => c.id === chip.id)) existing.push(chip);
        memberLeagueMap.set(r.club_member_id, existing);
      });
      memberLeagueMap.forEach((chips) => {
        chips.sort((a, b) => a.shortLabel.localeCompare(b.shortLabel, undefined, { numeric: true }));
      });
      return { leagues: Array.from(chipById.values()), memberLeagueMap };
    },
    enabled: !!clubId,
    staleTime: 60 * 1000,
  });

  const leaguesList: LeagueChip[] = leagueData?.leagues || [];
  const memberLeagueMap: Map<string, LeagueChip[]> = leagueData?.memberLeagueMap || new Map();

  const getPlayerLeagues = (player: LadderPlayer): LeagueChip[] =>
    memberLeagueMap.get(player.club_member_id) || [];

  const [activeLeagueFilter, setActiveLeagueFilter] = useState<string | null>(null);
  const [groupByLeague, setGroupByLeague] = useState(false);

  const handleLeagueClick = (leagueId: string) => {
    setActiveLeagueFilter((prev) => (prev === leagueId ? null : leagueId));
  };

  const activeLeagueChip = activeLeagueFilter
    ? leaguesList.find((l) => l.id === activeLeagueFilter) || null
    : null;

  const menPlayers = useMemo(() =>
    (players || []).filter((p: any) => p.gender?.toLowerCase() !== "female" && p.gender?.toLowerCase() !== "ladies" && p.gender?.toLowerCase() !== "f") as LadderPlayer[],
    [players]
  );

  const ladiesPlayers = useMemo(() =>
    (players || []).filter((p: any) => p.gender?.toLowerCase() === "female" || p.gender?.toLowerCase() === "ladies" || p.gender?.toLowerCase() === "f") as LadderPlayer[],
    [players]
  );

  const positionMap = useMemo(() => {
    const map = new Map<string, number>();
    const setPositionKeys = (player: LadderPlayer, position: number) => {
      [player.id, player.user_id, player.club_member_id].forEach((key) => {
        if (key) map.set(String(key), position);
      });
    };

    menPlayers.forEach((player, index) => setPositionKeys(player, index + 1));
    ladiesPlayers.forEach((player, index) => setPositionKeys(player, index + 1));
    return map;
  }, [menPlayers, ladiesPlayers]);

  const myPosition = useMemo(() => {
    if (!myMemberId) return null;
    const pos = positionMap.get(myMemberId);
    if (typeof pos === "number") return pos;
    // Fallback: try user_id
    const keys = [user?.id].filter(Boolean) as string[];
    for (const key of keys) {
      const position = positionMap.get(key);
      if (typeof position === "number") return position;
    }
    return null;
  }, [positionMap, myMemberId, user?.id]);

  const challengeLevelsUp = (clubData?.club as any)?.challenge_levels_up ?? 2;

  const isMe = (player: LadderPlayer): boolean => {
    if (myMemberId && player.club_member_id === myMemberId) return true;
    if (user?.id && (player.user_id === user.id || player.id === user.id)) return true;
    return false;
  };

  const myGenderGroup = useMemo(() => {
    const toGenderGroup = (gender?: string | null): "ladies" | "men" | null => {
      const g = (gender || "").toLowerCase().trim();
      if (!g) return null;
      return g === "female" || g === "ladies" || g === "f" ? "ladies" : "men";
    };

    const fromActiveMember = toGenderGroup(activeMember?.gender);
    if (fromActiveMember) return fromActiveMember;

    const selectedMember = (players || []).find((p) => {
      if (!myMemberId) return false;
      return p.club_member_id === myMemberId || p.id === myMemberId;
    });
    const fromSelectedLadderRow = toGenderGroup(selectedMember?.gender);
    if (fromSelectedLadderRow) return fromSelectedLadderRow;

    // Only fall back to the primary account member if no delegated profile is selected.
    if (!activeMember?.id) {
      const fromPrimaryMember = toGenderGroup(myClubMember?.gender);
      if (fromPrimaryMember) return fromPrimaryMember;
    }

    return "men";
  }, [activeMember?.id, activeMember?.gender, myClubMember?.gender, myMemberId, players]);

  const getPlayerGenderGroup = (player: LadderPlayer): string => {
    const g = (player.gender || "").toLowerCase();
    return (g === "female" || g === "ladies" || g === "f") ? "ladies" : "men";
  };

  const canChallenge = (player: LadderPlayer): string | null => {
    if (!user?.id) return "You must be logged in.";
    if (isMe(player)) return null; // hide button for self
    if (!myMemberId) return "Your account is not linked to a club member.";
    if (!myPosition) return "You are not ranked on the ladder yet.";

    // Gender must match — men challenge men, ladies challenge ladies
    if (getPlayerGenderGroup(player) !== myGenderGroup) return null; // hide button for other gender

    const opponentPos =
      positionMap.get(player.club_member_id) ??
      positionMap.get(player.user_id || "") ??
      positionMap.get(player.id) ??
      null;

    if (!opponentPos) return "This player is not ranked.";
    if (myPosition <= opponentPos) return "You may only challenge players above you.";

    const diff = myPosition - opponentPos;
    if (diff > challengeLevelsUp) return `You can only challenge up to ${challengeLevelsUp} positions above you.`;

    return null;
  };

  const isChallengeable = (player: LadderPlayer): boolean => {
    if (!user?.id || isMe(player)) return false;
    if (getPlayerGenderGroup(player) !== myGenderGroup) return false;
    return canChallenge(player) === null;
  };

  const handleChallengeClick = (player: LadderPlayer) => {
    const reason = canChallenge(player);
    if (reason) {
      setBlockedChallenge({ open: true, description: reason });
      return;
    }
    setProposedDate(format(addDays(new Date(), 1), "yyyy-MM-dd"));
    setProposedTime("18:00");
    setChallengeDialog({ open: true, player });
  };

  const handleSendChallenge = async () => {
    if (!challengeDialog.player || !proposedDate || !proposedTime) return;

    setSending(true);
    try {
      // Check court availability before sending challenge
      if (courtId) {
        const { available, conflictMessage } = await isCourtAvailable(
          Number(courtId), proposedDate, proposedTime
        );
        if (!available) {
          toast.error(conflictMessage || "Court is not available at this time.");
          setSending(false);
          return;
        }
      }

      await createChallenge.mutateAsync({
        opponentId: challengeDialog.player.user_id || null,
        proposedDate,
        proposedTime,
        courtId: courtId ? Number(courtId) : undefined,
        challengerMemberId: myMemberId || null,
        opponentMemberId: challengeDialog.player.club_member_id || null,
      });
      toast.success(`Challenge sent to ${challengeDialog.player.name}`);
      setChallengeDialog({ open: false, player: null });
    } catch (err: any) {
      toast.error(err.message || "Failed to send challenge");
    } finally {
      setSending(false);
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  // Apply league filter when active
  const applyFilter = (list: LadderPlayer[]) => {
    if (!activeLeagueFilter) return list;
    return list.filter((p) =>
      (memberLeagueMap.get(p.club_member_id) || []).some((c) => c.id === activeLeagueFilter)
    );
  };

  const renderColumn = (title: string, list: LadderPlayer[]) => {
    const filtered = applyFilter(list);
    return (
      <div>
        <h2 className="text-sm font-heading font-bold text-foreground mb-2 uppercase tracking-wide">
          {title}
          <span className="text-muted-foreground font-normal ml-1.5">({filtered.length})</span>
        </h2>
        <div className="space-y-1.5">
          {filtered.map((player, index) => (
            <LadderPlayerCard
              key={player.id}
              player={player}
              index={index}
              isMe={isMe(player)}
              isAdmin={false}
              onNavigate={(playerId, isMePlayer) => {
                if (isMePlayer) navigate("/profile");
                else navigate(`/players/${playerId}`);
              }}
              onChallenge={() => handleChallengeClick(player)}
              challengeBlocked={!isChallengeable(player)}
              highlightChallengeable={isChallengeable(player)}
              leagues={getPlayerLeagues(player)}
              onLeagueClick={handleLeagueClick}
              activeLeagueFilter={activeLeagueFilter}
            />
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">No players</p>
          )}
        </div>
      </div>
    );
  };

  // ---- Grouped-by-league rendering ----
  const renderGrouped = (genderTitle: string, list: LadderPlayer[]) => {
    const filteredList = applyFilter(list);
    // Build sections: one per league, then a 'Social' section for un-registered
    const sections: Array<{ key: string; label: string; players: LadderPlayer[] }> = [];
    leaguesList.forEach((lg) => {
      const players = filteredList.filter((p) =>
        (memberLeagueMap.get(p.club_member_id) || []).some((c) => c.id === lg.id)
      );
      if (players.length > 0) sections.push({ key: lg.id, label: `${lg.name} (${lg.shortLabel})`, players });
    });
    if (!activeLeagueFilter) {
      const social = filteredList.filter(
        (p) => (memberLeagueMap.get(p.club_member_id) || []).length === 0
      );
      if (social.length > 0) sections.push({ key: "__social", label: "Social Players", players: social });
    }

    return (
      <div>
        <h2 className="text-sm font-heading font-bold text-foreground mb-2 uppercase tracking-wide">
          {genderTitle}
          <span className="text-muted-foreground font-normal ml-1.5">({filteredList.length})</span>
        </h2>
        <div className="space-y-4">
          {sections.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">No players</p>
          )}
          {sections.map((sec) => (
            <div key={sec.key}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1.5 flex items-center gap-1.5">
                <span className="h-px flex-1 bg-primary/20" />
                <span>{sec.label}</span>
                <span className="text-muted-foreground font-normal">({sec.players.length})</span>
                <span className="h-px flex-1 bg-primary/20" />
              </h3>
              <div className="space-y-1.5">
                {sec.players.map((player, index) => (
                  <LadderPlayerCard
                    key={player.id}
                    player={player}
                    index={index}
                    isMe={isMe(player)}
                    isAdmin={false}
                    onNavigate={(playerId, isMePlayer) => {
                      if (isMePlayer) navigate("/profile");
                      else navigate(`/players/${playerId}`);
                    }}
                    onChallenge={() => handleChallengeClick(player)}
                    challengeBlocked={!isChallengeable(player)}
                    highlightChallengeable={isChallengeable(player)}
                    leagues={getPlayerLeagues(player)}
                    onLeagueClick={handleLeagueClick}
                    activeLeagueFilter={activeLeagueFilter}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bottom-nav-safe">
      <SEO title="Player Ladder" description="See the latest squash ladder rankings." path="/ladder" noIndex />
      <PageHeader
        title="Player Ladder"
        subtitle={`${(players || []).length} players ranked`}
      />

      {/* Controls: filter chip + group toggle */}
      {leaguesList.length > 0 && !isLoading && (
        <div className="px-4 mt-3 flex flex-wrap items-center gap-3">
          {activeLeagueChip && (
            <button
              type="button"
              onClick={() => setActiveLeagueFilter(null)}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <span>{activeLeagueChip.name}</span>
              <X className="w-3 h-3" />
            </button>
          )}
          <label className="ml-auto inline-flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
            <Layers className="w-3.5 h-3.5" />
            <span>Group by league</span>
            <Switch checked={groupByLeague} onCheckedChange={setGroupByLeague} />
          </label>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="px-4 mt-3 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupByLeague ? renderGrouped("Men's Ladder", menPlayers) : renderColumn("Men's Ladder", menPlayers)}
          {groupByLeague ? renderGrouped("Ladies' Ladder", ladiesPlayers) : renderColumn("Ladies' Ladder", ladiesPlayers)}
        </div>
      )}

      {/* Challenge Dialog */}
      <Dialog open={challengeDialog.open} onOpenChange={(open) => setChallengeDialog((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Swords className="w-4 h-4" />
              Challenge {challengeDialog.player?.name}
            </DialogTitle>
            <DialogDescription>
              Propose a date and time. Your opponent can accept, decline, or suggest an alternative.
            </DialogDescription>
          </DialogHeader>

          {challengeDialog.player && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                <PlayerAvatar initials={getInitials(challengeDialog.player.name)} size="sm" avatarUrl={challengeDialog.player.avatar_url} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{challengeDialog.player.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    #{positionMap.get(challengeDialog.player.id)} on ladder · {challengeDialog.player.wins}W-{challengeDialog.player.losses}L
                  </p>
                </div>
              </div>
              {challengeDialog.player.club_member_id && myMemberId && (
                <OpponentStatsInline memberId={challengeDialog.player.club_member_id} myMemberId={myMemberId} />
              )}
            </>
          )}

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Proposed Date</Label>
              <Input
                type="date"
                value={proposedDate}
                min={format(addDays(new Date(), 1), "yyyy-MM-dd")}
                onChange={(e) => setProposedDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Proposed Time</Label>
              <Input
                type="time"
                value={proposedTime}
                onChange={(e) => setProposedTime(e.target.value)}
                className="mt-1"
              />
            </div>
            {courts.length > 0 && (
              <div>
                <Label className="text-xs">Court</Label>
                <Select value={courtId} onValueChange={setCourtId}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {courts.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setChallengeDialog({ open: false, player: null })}>
              Cancel
            </Button>
            <Button onClick={handleSendChallenge} disabled={sending || !proposedDate || !proposedTime}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Swords className="w-4 h-4 mr-2" />}
              Send Challenge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blocked reason dialog */}
      <Dialog open={blockedChallenge.open} onOpenChange={(open) => setBlockedChallenge((s) => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Can't challenge this player</DialogTitle>
            <DialogDescription>{blockedChallenge.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setBlockedChallenge((s) => ({ ...s, open: false }))}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <BackToDashboard />
    </div>
  );
}

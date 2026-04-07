import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Trophy, UserPlus, Users, ChevronLeft, UserCheck, Globe } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Switch } from "@/components/ui/switch";

import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useLadder, useCreateMatch } from "@/hooks/use-data";
import { useMyClub } from "@/hooks/use-club";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

type MatchType = "friendly" | "league" | "ladder" | "club_champs" | "tournament";
type ScoringFormat = "par11" | "par15" | "english9";
type BestOf = 3 | 5;
type DeuceRule = "win_by_2" | "sudden_death";

type GameScore = { playerA: string; playerB: string };

interface PlayerSelection {
  mode: "myself" | "club" | "external" | "visitor";
  clubMemberId: string | null;
  userId: string | null;
  name: string;
  externalClub: string;
}

const MATCH_TYPES: { value: MatchType; label: string; description: string }[] = [
  { value: "friendly", label: "Friendly", description: "Casual / social match" },
  { value: "ladder", label: "Ladder Challenge", description: "Club ladder match" },
  { value: "league", label: "League", description: "League or inter-club match" },
  { value: "club_champs", label: "Club Champs", description: "Club championship match" },
  { value: "tournament", label: "Tournament", description: "Tournament match" },
];

const SCORING_FORMATS: { value: ScoringFormat; label: string; maxScore: number; description: string }[] = [
  { value: "par11", label: "PAR 11", maxScore: 11, description: "Point-a-rally to 11 (standard)" },
  { value: "par15", label: "PAR 15", maxScore: 15, description: "Point-a-rally to 15" },
  { value: "english9", label: "English 9", maxScore: 9, description: "Hand-in/hand-out to 9" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getMaxScore(format: ScoringFormat) {
  return SCORING_FORMATS.find((f) => f.value === format)?.maxScore ?? 11;
}

function determineGameWinner(scoreA: number, scoreB: number, format: ScoringFormat, deuceRule: DeuceRule = "win_by_2"): "a" | "b" | null {
  const target = getMaxScore(format);
  if (deuceRule === "sudden_death") {
    // At deuce, next point wins (no need for 2-point lead)
    if (scoreA >= target && scoreA > scoreB) return "a";
    if (scoreB >= target && scoreB > scoreA) return "b";
    // Both at target-1 or above and tied → not won yet
    if (scoreA >= target - 1 && scoreB >= target - 1 && scoreA === scoreB) return null;
    if (scoreA >= target) return "a";
    if (scoreB >= target) return "b";
    return null;
  }
  if (scoreA >= target && scoreA - scoreB >= 2) return "a";
  if (scoreB >= target && scoreB - scoreA >= 2) return "b";
  return null;
}

function computeMatchResult(games: GameScore[], format: ScoringFormat, deuceRule: DeuceRule = "win_by_2") {
  let gamesA = 0;
  let gamesB = 0;
  const validGames: { a: number; b: number; winner: "a" | "b" }[] = [];

  for (const g of games) {
    const a = parseInt(g.playerA) || 0;
    const b = parseInt(g.playerB) || 0;
    const winner = determineGameWinner(a, b, format, deuceRule);
    if (winner) {
      validGames.push({ a, b, winner });
      if (winner === "a") gamesA++;
      else gamesB++;
    }
  }

  return { gamesA, gamesB, validGames };
}

const emptyPlayer = (mode: "myself" | "club" | "external" | "visitor" = "myself"): PlayerSelection => ({
  mode,
  clubMemberId: null,
  userId: null,
  name: "",
  externalClub: "",
});

// Reusable player selector component
function PlayerSelector({
  label,
  player,
  onChange,
  showMyself,
  myName,
  myUserId,
  availableMembers,
  search,
  onSearchChange,
  excludeUserId,
  visitors,
  visitorSearch,
  onVisitorSearchChange,
}: {
  label: string;
  player: PlayerSelection;
  onChange: (p: PlayerSelection) => void;
  showMyself: boolean;
  myName: string;
  myUserId: string | null;
  availableMembers: any[];
  search: string;
  onSearchChange: (s: string) => void;
  excludeUserId?: string | null;
  visitors?: any[];
  visitorSearch?: string;
  onVisitorSearchChange?: (s: string) => void;
}) {
  const filteredMembers = useMemo(() => {
    let list = availableMembers;
    if (excludeUserId) {
      list = list.filter((p) => p.user_id !== excludeUserId && p.club_member_id !== excludeUserId);
    }
    if (!search.trim()) return list;
    return list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [availableMembers, search, excludeUserId]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold font-heading">{label}</h3>

      <div className="flex gap-2">
        {showMyself && (
          <Button
            variant={player.mode === "myself" ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() =>
              onChange({
                mode: "myself",
                clubMemberId: null,
                userId: myUserId,
                name: myName,
                externalClub: "",
              })
            }
          >
            <UserCheck className="w-4 h-4 mr-1" />
            Myself
          </Button>
        )}
        <Button
          variant={player.mode === "club" ? "default" : "outline"}
          size="sm"
          className="flex-1"
          onClick={() => onChange(emptyPlayer("club"))}
        >
          <Users className="w-4 h-4 mr-1" />
          Club Member
        </Button>
        <Button
          variant={player.mode === "external" ? "default" : "outline"}
          size="sm"
          className="flex-1"
          onClick={() => onChange(emptyPlayer("external"))}
        >
          <UserPlus className="w-4 h-4 mr-1" />
          External
        </Button>
        <Button
          variant={player.mode === "visitor" ? "default" : "outline"}
          size="sm"
          className="flex-1"
          onClick={() => onChange(emptyPlayer("visitor"))}
        >
          <Globe className="w-4 h-4 mr-1" />
          Visitor
        </Button>
      </div>

      {player.mode === "myself" && (
        <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 p-3">
          <PlayerAvatar initials={initials(myName)} size="sm" />
          <p className="text-sm font-medium">{myName}</p>
          <Badge variant="outline" className="text-[10px] ml-auto">You</Badge>
        </div>
      )}

      {player.mode === "club" && (
        <div className="space-y-2">
          <Input
            placeholder="Search members…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <div className="max-h-52 overflow-y-auto space-y-1">
            {filteredMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No members found</p>
            ) : (
              filteredMembers.map((p: any) => {
                const isSelected = player.clubMemberId === p.club_member_id;
                return (
                  <button
                    key={p.club_member_id}
                    type="button"
                    onClick={() =>
                      onChange({
                        mode: "club",
                        clubMemberId: p.club_member_id,
                        userId: p.user_id || null,
                        name: p.name,
                        externalClub: "",
                      })
                    }
                    className={`w-full text-left rounded-lg border p-3 transition-colors flex items-center gap-3 ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <PlayerAvatar initials={initials(p.name)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <div className="flex gap-2 mt-0.5">
                        {p.rank != null && (
                          <Badge variant="outline" className="text-[10px]">#{p.rank}</Badge>
                        )}
                        {p.gender && (
                          <span className="text-[10px] text-muted-foreground">{p.gender}</span>
                        )}
                        {!p.user_id && (
                          <span className="text-[10px] text-muted-foreground">No account</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {player.mode === "external" && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Player Name *</Label>
            <Input
              placeholder="e.g. John Smith"
              value={player.name}
              onChange={(e) => onChange({ ...player, name: e.target.value })}
              maxLength={100}
            />
          </div>
          <div>
            <Label className="text-xs">Club / Organisation</Label>
            <Input
              placeholder="e.g. Wanderers Squash Club"
              value={player.externalClub}
              onChange={(e) => onChange({ ...player, externalClub: e.target.value })}
              maxLength={100}
            />
          </div>
        </div>
      )}

      {player.mode === "visitor" && (
        <div className="space-y-2">
          <Input
            placeholder="Search visitors…"
            value={visitorSearch || ""}
            onChange={(e) => onVisitorSearchChange?.(e.target.value)}
          />
          <div className="max-h-52 overflow-y-auto space-y-1">
            {(() => {
              const term = (visitorSearch || "").toLowerCase();
              const filtered = (visitors || []).filter((v: any) =>
                !term || `${v.first_name} ${v.last_name}`.toLowerCase().includes(term) || v.home_club_name.toLowerCase().includes(term)
              );
              if (filtered.length === 0) {
                return <p className="text-xs text-muted-foreground text-center py-4">No visitors found</p>;
              }
              return filtered.map((v: any) => {
                const vName = `${v.first_name} ${v.last_name}`;
                const isSelected = player.name === vName && player.externalClub === v.home_club_name;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() =>
                      onChange({
                        mode: "visitor",
                        clubMemberId: null,
                        userId: null,
                        name: vName,
                        externalClub: v.home_club_name,
                      })
                    }
                    className={`w-full text-left rounded-lg border p-3 transition-colors flex items-center gap-3 ${
                      isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <PlayerAvatar initials={initials(vName)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{vName}</p>
                      <div className="flex gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Visitor</Badge>
                        <span className="text-[10px] text-muted-foreground">{v.home_club_name}</span>
                        {v.member_number && <span className="text-[10px] text-muted-foreground">#{v.member_number}</span>}
                      </div>
                    </div>
                  </button>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function isPlayerValid(p: PlayerSelection): boolean {
  if (p.mode === "myself") return !!p.userId;
  if (p.mode === "club") return !!p.clubMemberId;
  if (p.mode === "external") return p.name.trim().length > 0;
  if (p.mode === "visitor") return p.name.trim().length > 0;
  return false;
}

function getPlayerDisplayName(p: PlayerSelection, fallback = "Player"): string {
  if (p.mode === "myself") return p.name || "You";
  if (p.mode === "club") return p.name || fallback;
  if (p.mode === "external") return p.name || fallback;
  if (p.mode === "visitor") return p.name || fallback;
  return fallback;
}

export default function AddMatchResult() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { activeMember } = useMemberContext();
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;
  const { data: ladder } = useLadder(clubId);
  const createMatch = useCreateMatch();

  // URL params from challenge flow or booking flow
  const urlChallengeId = searchParams.get("challengeId");
  const urlOpponentId = searchParams.get("opponentId");
  const urlOpponentMemberId = searchParams.get("opponentMemberId");
  const urlPlayerAMemberId = searchParams.get("playerAMemberId");
  const urlPlayerBMemberId = searchParams.get("playerBMemberId");
  const urlPlayerAUserId = searchParams.get("playerAUserId");
  const urlPlayerBUserId = searchParams.get("playerBUserId");
  const urlMatchDate = searchParams.get("matchDate");

  const [step, setStep] = useState(1);

  // Player selections
  const [player1, setPlayer1] = useState<PlayerSelection>(() => ({
    mode: "myself" as const,
    clubMemberId: null,
    userId: user?.id ?? null,
    name: "",
    externalClub: "",
  }));
  const [player2, setPlayer2] = useState<PlayerSelection>(emptyPlayer("club"));
  const [search1, setSearch1] = useState("");
  const [search2, setSearch2] = useState("");

  // Match settings
  const [matchType, setMatchType] = useState<MatchType>("friendly");
  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>("par11");
  const [bestOf, setBestOf] = useState<BestOf>(5);
  const [deuceRule, setDeuceRule] = useState<DeuceRule>("win_by_2");
  const [matchDate, setMatchDate] = useState(urlMatchDate || new Date().toISOString().split("T")[0]);

  // Scores
  const [games, setGames] = useState<GameScore[]>(
    Array.from({ length: 5 }, () => ({ playerA: "", playerB: "" }))
  );
  const [submitting, setSubmitting] = useState(false);

  const myName = useMemo(() => {
    if (!user || !ladder) return "You";
    const me = ladder.find((p: any) => p.id === user.id);
    return me?.name || "You";
  }, [user, ladder]);

  // Update player1 name when myName loads
  useMemo(() => {
    if (player1.mode === "myself" && myName !== "You" && !player1.name) {
      setPlayer1((prev) => ({ ...prev, name: myName, userId: user?.id ?? null }));
    }
  }, [myName, user?.id]);

  // Pre-select opponent from URL params (challenge flow)
  const [challengePreFilled, setChallengePreFilled] = useState(false);
  useEffect(() => {
    if (challengePreFilled || !ladder || !urlOpponentMemberId) return;
    const opponent = ladder.find(
      (p: any) => p.club_member_id === urlOpponentMemberId
    );
    if (opponent) {
      setPlayer2({
        mode: "club",
        clubMemberId: opponent.club_member_id,
        userId: opponent.user_id || urlOpponentId || null,
        name: opponent.name,
        externalClub: "",
      });
      setMatchType("ladder");
      setChallengePreFilled(true);
    }
  }, [ladder, urlOpponentMemberId, urlOpponentId, challengePreFilled]);

  // Pre-fill both players from booking flow
  const [bookingPreFilled, setBookingPreFilled] = useState(false);
  useEffect(() => {
    if (bookingPreFilled || !ladder) return;
    if (!urlPlayerAMemberId && !urlPlayerAUserId) return;

    // Find player A by member ID or user_id
    const memberA = urlPlayerAMemberId
      ? ladder.find((p: any) => p.club_member_id === urlPlayerAMemberId)
      : urlPlayerAUserId
        ? ladder.find((p: any) => p.user_id === urlPlayerAUserId)
        : null;

    // Find player B by member ID or user_id
    const memberB = urlPlayerBMemberId
      ? ladder.find((p: any) => p.club_member_id === urlPlayerBMemberId)
      : urlPlayerBUserId
        ? ladder.find((p: any) => p.user_id === urlPlayerBUserId)
        : null;

    if (memberA) {
      const isMe = memberA.user_id === user?.id || memberA.id === user?.id;
      setPlayer1({
        mode: isMe ? "myself" : "club",
        clubMemberId: memberA.club_member_id,
        userId: memberA.user_id || null,
        name: memberA.name,
        externalClub: "",
      });
    }

    if (memberB) {
      const isMe = memberB.user_id === user?.id || memberB.id === user?.id;
      setPlayer2({
        mode: isMe ? "myself" : "club",
        clubMemberId: memberB.club_member_id,
        userId: memberB.user_id || null,
        name: memberB.name,
        externalClub: "",
      });
    }

    if (memberA && memberB) {
      setStep(2);
    }

    setBookingPreFilled(true);
  }, [ladder, urlPlayerAMemberId, urlPlayerBMemberId, urlPlayerAUserId, urlPlayerBUserId, user?.id, bookingPreFilled]);

  const availableMembers = useMemo(() => {
    if (!ladder) return [];
    return ladder;
  }, [ladder]);

  const player1Name = getPlayerDisplayName(player1, "Player 1");
  const player2Name = getPlayerDisplayName(player2, "Player 2");

  const canProceedStep1 = isPlayerValid(player1) && isPlayerValid(player2) && (
    // Can't be the same person
    !(player1.userId && player2.userId && player1.userId === player2.userId) &&
    !(player1.clubMemberId && player2.clubMemberId && player1.clubMemberId === player2.clubMemberId)
  );

  // Match result computation
  const { gamesA, gamesB, validGames } = useMemo(
    () => computeMatchResult(games.slice(0, bestOf), scoringFormat, deuceRule),
    [games, bestOf, scoringFormat, deuceRule]
  );

  const neededToWin = Math.ceil(bestOf / 2);
  const matchWinner = gamesA >= neededToWin ? "a" : gamesB >= neededToWin ? "b" : null;
  const matchComplete = matchWinner !== null;

  const scoreString = useMemo(() => {
    if (validGames.length === 0) return null;
    return `${gamesA}-${gamesB}`;
  }, [gamesA, gamesB, validGames]);

  const gameScoresJson = useMemo(() => {
    if (validGames.length === 0) return null;
    return JSON.stringify({
      format: scoringFormat,
      bestOf,
      sets: validGames.map((g) => ({ a: g.a, b: g.b })),
    });
  }, [validGames, scoringFormat, bestOf]);

  const updateGame = (idx: number, field: "playerA" | "playerB", value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 2);
    setGames((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: cleaned };
      return next;
    });
  };

  const canSubmit = matchComplete;

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    try {
      const p1HasAccount = player1.mode !== "external" && !!player1.userId;
      const p2HasAccount = player2.mode !== "external" && !!player2.userId;

      // Determine if we can create a proper match record (need user_ids for both)
      if (p1HasAccount && p2HasAccount) {
        // Both have accounts — full match record
        const winnerId = matchWinner === "a" ? player1.userId! : player2.userId!;
        const winnerMemberId = matchWinner === "a" ? (player1.clubMemberId || null) : (player2.clubMemberId || null);
        await createMatch.mutateAsync({
          playerA: player1.userId!,
          playerB: player2.userId!,
          winnerId,
          score: scoreString,
          matchDate,
          gameScores: gameScoresJson,
          challengeId: urlChallengeId || null,
          notes: `Match type: ${matchType}`,
          playerAMemberId: player1.clubMemberId || null,
          playerBMemberId: player2.clubMemberId || null,
          winnerMemberId,
          submittedByMemberId: activeMember?.id || null,
        });
        toast.success("Match result submitted! Awaiting player confirmation.");
      } else {
        // One or both players don't have accounts — store with notes
        const submitterId = user.id;
        const noteParts: string[] = [];
        
        const p1Label = player1.mode === "external" 
          ? `${player1.name}${player1.externalClub ? ` (${player1.externalClub})` : ""}`
          : player1.name;
        const p2Label = player2.mode === "external"
          ? `${player2.name}${player2.externalClub ? ` (${player2.externalClub})` : ""}`
          : player2.name;

        noteParts.push(`Player 1: ${p1Label}`);
        noteParts.push(`Player 2: ${p2Label}`);
        noteParts.push(`Winner: ${matchWinner === "a" ? p1Label : p2Label}`);
        noteParts.push(`Match type: ${matchType}`);

        // Use the available user_ids, fallback to submitter
        const playerAId = player1.userId || submitterId;
        const playerBId = player2.userId || submitterId;
        const winnerId = matchWinner === "a" ? (player1.userId || null) : (player2.userId || null);

        await createMatch.mutateAsync({
          playerA: playerAId,
          playerB: playerBId,
          winnerId,
          score: scoreString,
          matchDate,
          gameScores: gameScoresJson,
          challengeId: urlChallengeId || null,
          notes: noteParts.join(". "),
          playerAMemberId: player1.clubMemberId || null,
          playerBMemberId: player2.clubMemberId || null,
          winnerMemberId: matchWinner === "a" ? (player1.clubMemberId || null) : (player2.clubMemberId || null),
          submittedByMemberId: activeMember?.id || null,
        });
        toast.success("Match result recorded.");
      }

      navigate("/dashboard");
    } catch (e: any) {
      toast.error(e?.message || "Failed to submit match result");
    } finally {
      setSubmitting(false);
    }
  };

  // Compute the exclude id for player selectors (avoid selecting same person)
  const excludeForPlayer2 = player1.mode !== "external" ? (player1.clubMemberId || player1.userId) : null;
  const excludeForPlayer1 = player2.mode !== "external" ? (player2.clubMemberId || player2.userId) : null;

  return (
    <div className="bottom-nav-safe">
      <PageHeader
        title="Add Match Result"
        subtitle="Record a match result"
      />

      <div className="px-4 mt-3 space-y-4 mb-4 max-w-lg mx-auto">
        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </div>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {s === 1 ? "Players" : s === 2 ? "Match Type" : "Scores"}
              </span>
              {s < 3 && <Separator className="flex-1" />}
            </div>
          ))}
        </div>

        {/* STEP 1: Select Players */}
        {step === 1 && (
          <Card className="p-4 space-y-5">
            <PlayerSelector
              label="Player 1"
              player={player1}
              onChange={setPlayer1}
              showMyself={true}
              myName={myName}
              myUserId={user?.id ?? null}
              availableMembers={availableMembers}
              search={search1}
              onSearchChange={setSearch1}
              excludeUserId={excludeForPlayer1}
            />

            <Separator />

            <PlayerSelector
              label="Player 2"
              player={player2}
              onChange={setPlayer2}
              showMyself={false}
              myName={myName}
              myUserId={user?.id ?? null}
              availableMembers={availableMembers}
              search={search2}
              onSearchChange={setSearch2}
              excludeUserId={excludeForPlayer2}
            />

            {player1.userId && player2.userId && player1.userId === player2.userId && (
              <p className="text-xs text-destructive">Both players cannot be the same person.</p>
            )}

            <Button
              className="w-full"
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </Card>
        )}

        {/* STEP 2: Match Type & Format */}
        {step === 2 && (
          <Card className="p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold font-heading flex items-center gap-2">
                <Trophy className="w-4 h-4" /> Match Settings
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {player1Name} vs {player2Name}
              </p>
            </div>

            <div>
              <Label className="text-xs">Match Type</Label>
              <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div>
                        <span>{t.label}</span>
                        <span className="text-muted-foreground text-xs ml-2">— {t.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Scoring Format</Label>
              <Select value={scoringFormat} onValueChange={(v) => setScoringFormat(v as ScoringFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORING_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      <div>
                        <span>{f.label}</span>
                        <span className="text-muted-foreground text-xs ml-2">— {f.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Best Of</Label>
              <div className="flex gap-2 mt-1">
                {([3, 5] as BestOf[]).map((n) => (
                  <Button
                    key={n}
                    variant={bestOf === n ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setBestOf(n);
                      setGames(Array.from({ length: 5 }, (_, i) => games[i] || { playerA: "", playerB: "" }));
                    }}
                  >
                    Best of {n}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Deuce Rule</Label>
              <div className="flex gap-2 mt-1">
                {([{ value: "win_by_2", label: "Win by 2" }, { value: "sudden_death", label: "Sudden Death" }] as const).map((opt) => (
                  <Button
                    key={opt.value}
                    variant={deuceRule === opt.value ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setDeuceRule(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Match Date</Label>
              <Input
                type="date"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </Card>
        )}

        {/* STEP 3: Game Scores */}
        {step === 3 && (
          <Card className="p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold font-heading">Game Scores</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {SCORING_FORMATS.find((f) => f.value === scoringFormat)?.label} · Best of {bestOf} · {player1Name} vs {player2Name}
              </p>
            </div>

            {/* Score header */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <div className="text-center">
                <p className="text-xs font-semibold truncate">{player1Name}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Game</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold truncate">{player2Name}</p>
              </div>
            </div>

            {/* Game rows */}
            {Array.from({ length: bestOf }).map((_, i) => {
              const game = games[i];
              const a = parseInt(game.playerA) || 0;
              const b = parseInt(game.playerB) || 0;
              const winner = determineGameWinner(a, b, scoringFormat, deuceRule);
              const previousGamesComplete = i === 0 || games.slice(0, i).every((g) => {
                const ga = parseInt(g.playerA) || 0;
                const gb = parseInt(g.playerB) || 0;
                return determineGameWinner(ga, gb, scoringFormat, deuceRule) !== null;
              });

              const gamesBeforeThis = games.slice(0, i);
              let winsA = 0, winsB = 0;
              for (const g of gamesBeforeThis) {
                const ga = parseInt(g.playerA) || 0;
                const gb = parseInt(g.playerB) || 0;
                const w = determineGameWinner(ga, gb, scoringFormat, deuceRule);
                if (w === "a") winsA++;
                if (w === "b") winsB++;
              }
              const matchAlreadyWon = winsA >= neededToWin || winsB >= neededToWin;

              if (matchAlreadyWon || !previousGamesComplete) return null;

              return (
                <div
                  key={i}
                  className={`grid grid-cols-[1fr_auto_1fr] gap-2 items-center ${winner ? "opacity-80" : ""}`}
                >
                  <Input
                    type="text"
                    inputMode="numeric"
                    className={`text-center text-lg font-bold h-12 ${winner === "a" ? "border-primary bg-primary/5" : ""}`}
                    value={game.playerA}
                    onChange={(e) => updateGame(i, "playerA", e.target.value)}
                    placeholder="0"
                  />
                  <div className="text-center">
                    <Badge
                      variant={winner ? "default" : "outline"}
                      className="text-xs tabular-nums w-8 justify-center"
                    >
                      {i + 1}
                    </Badge>
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className={`text-center text-lg font-bold h-12 ${winner === "b" ? "border-primary bg-primary/5" : ""}`}
                    value={game.playerB}
                    onChange={(e) => updateGame(i, "playerB", e.target.value)}
                    placeholder="0"
                  />
                </div>
              );
            })}

            {/* Match summary */}
            <Separator />
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <p className={`text-2xl font-bold tabular-nums ${matchWinner === "a" ? "text-primary" : ""}`}>
                  {gamesA}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {matchWinner === "a" ? "WINNER" : ""}
                </p>
              </div>
              <div className="text-center px-4">
                <p className="text-xs text-muted-foreground font-semibold">GAMES</p>
              </div>
              <div className="text-center flex-1">
                <p className={`text-2xl font-bold tabular-nums ${matchWinner === "b" ? "text-primary" : ""}`}>
                  {gamesB}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {matchWinner === "b" ? "WINNER" : ""}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={!canSubmit || submitting}
                onClick={handleSubmit}
              >
                {submitting ? "Submitting…" : "Submit Result"}
              </Button>
            </div>
          </Card>
        )}
      </div>
      <BackToDashboard />
    </div>
  );
}

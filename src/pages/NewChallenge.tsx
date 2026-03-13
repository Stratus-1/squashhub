import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import {
  Loader2, Swords, X, TrendingUp, Target, Trophy, ChevronRight,
  Shield, Flame, BarChart3, Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useCreateChallenge, useLadder, useProfile,
  useProposeChallengeSchedule, useHeadToHead,
} from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClub } from "@/hooks/use-club";

/* ── helpers ────────────────────────────────────────────────── */

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}
function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
}
function addMinutesToTime(t: string, delta: number) {
  return minutesToTime(timeToMinutes(t) + delta);
}
function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}
function winRate(w: number, total: number) {
  return total > 0 ? Math.round((w / total) * 100) : 0;
}

/* ── component ──────────────────────────────────────────────── */

export default function NewChallenge() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;
  const { data: ladder, isLoading } = useLadder(clubId);
  const { data: profile } = useProfile();
  const { data: h2hData } = useHeadToHead(user?.id, 50);
  const createChallenge = useCreateChallenge();
  const proposeSchedule = useProposeChallengeSchedule();

  const today = useMemo(() => new Date(), []);
  const todayStr = format(today, "yyyy-MM-dd");
  const defaultProposed = format(addDays(today, 3), "yyyy-MM-dd");

  const initialOpponent = params.get("opponent") || "";
  const [opponentId, setOpponentId] = useState(initialOpponent);
  const [proposedDate, setProposedDate] = useState(defaultProposed);
  const [startTime, setStartTime] = useState("18:00");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [courtId, setCourtId] = useState("1");
  const [query, setQuery] = useState("");
  const [listTab, setListTab] = useState("eligible");

  const challengeLevelsUp = (clubData?.club as any)?.challenge_levels_up ?? 2;

  // Find my ladder position from the ladder data
  const myLadderPosition = useMemo(() => {
    if (!user?.id || !ladder) return null;
    const me = ladder.find(p => p.id === user.id);
    return me?.ladder_position ?? null;
  }, [ladder, user?.id]);

  const isEligible = (ladderPosition: number | null) => {
    if (!myLadderPosition || !ladderPosition) return false;
    if (myLadderPosition <= ladderPosition) return false; // can only challenge above
    const diff = myLadderPosition - ladderPosition;
    return diff >= 1 && diff <= challengeLevelsUp;
  };

  const opponentProfile = useMemo(
    () => (ladder || []).find((p) => p.id === opponentId) || null,
    [ladder, opponentId],
  );

  const selectedEligible = isEligible(opponentProfile?.ladder_position ?? null);

  /* head-to-head map for quick lookup */
  const h2hMap = useMemo(() => {
    const m = new Map<string, { wins: number; losses: number; matches: number }>();
    (h2hData || []).forEach((r) =>
      m.set(r.opponent_id, { wins: r.wins, losses: r.losses, matches: r.matches }),
    );
    return m;
  }, [h2hData]);

  /* path to #1 calculation */
  const pathToTop = useMemo(() => {
    if (!myLadderPosition || !ladder) return [];
    const steps: typeof ladder = [];
    let currentPos = myLadderPosition;
    while (currentPos > 1) {
      const target = ladder.find(
        (p) => p.ladder_position !== null && p.ladder_position >= Math.max(1, currentPos - challengeLevelsUp) && p.ladder_position < currentPos,
      );
      if (!target || target.ladder_position === null) break;
      steps.push(target);
      currentPos = target.ladder_position;
    }
    return steps;
  }, [myLadderPosition, ladder, challengeLevelsUp]);

  /* filtered & sorted player lists */
  const { eligible, allPlayers } = useMemo(() => {
    const list = (ladder || []).filter((p) => p.id !== user?.id);
    const q = query.trim().toLowerCase();
    const searched = q ? list.filter((p) => (p.name || "").toLowerCase().includes(q)) : list;
    return {
      eligible: searched.filter((p) => isEligible(p.ladder_position)),
      allPlayers: searched,
    };
  }, [ladder, query, user?.id, myLadderPosition]);

  const onSend = async () => {
    if (!myLadderPosition) return toast.error("You need a ladder position to challenge players");
    if (!selectedEligible) return toast.error(`You can only challenge players within ${challengeLevelsUp} ladder positions`);

    try {
      const challenge = await createChallenge.mutateAsync({
        opponentId,
        proposedDate: proposedDate || null,
      });

      try {
        const minutes = Number(durationMinutes) || 60;
        if (minutes <= 0 || minutes > 240) throw new Error("Invalid duration");
        await proposeSchedule.mutateAsync({
          challengeId: (challenge as any).id,
          proposedDate,
          startTime: `${startTime}:00`,
          endTime: `${addMinutesToTime(startTime, minutes)}:00`,
          courtId: Number(courtId) || 1,
        });
      } catch (e: any) {
        toast.error(e.message || "Challenge sent, but proposing a time failed");
      }

      toast.success("Challenge sent");
      navigate("/challenges");
    } catch (err: any) {
      toast.error(err.message || "Failed to send challenge");
    }
  };

  /* ── render helpers ─────────────────────────────────── */

  function PlayerCard({ p, compact }: { p: (typeof ladder extends (infer U)[] | undefined ? U : never); compact?: boolean }) {
    const isSelected = p.id === opponentId;
    const canChallenge = isEligible(p.ladder_position);
    const wr = winRate(p.wins, p.matches_played);
    const h2h = h2hMap.get(p.id);
    const rankDiff = myLadderPosition && p.ladder_position ? myLadderPosition - p.ladder_position : null;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
      >
        <Card
          className={cn(
            "p-3 transition-all",
            canChallenge ? "cursor-pointer hover:bg-muted/40 hover:shadow-sm" : "opacity-50 cursor-not-allowed",
            isSelected && "border-primary/50 bg-primary/5 shadow-sm",
          )}
          onClick={() => canChallenge && setOpponentId(p.id)}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <PlayerAvatar initials={getInitials(p.name)} size="sm" />
              {p.ladder_position && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {p.ladder_position}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold truncate">{p.name}</p>
                {canChallenge && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary">
                    Eligible
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[11px] text-muted-foreground">
                  {p.wins}W-{p.losses}L
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {wr}% WR
                </span>
                {rankDiff !== null && rankDiff !== 0 && (
                  <span className="text-[11px] text-primary font-medium">
                    {Math.abs(rankDiff)} rank{Math.abs(rankDiff) > 1 ? "s" : ""} {rankDiff > 0 ? "above" : "below"}
                  </span>
                )}
              </div>

              {!compact && h2h && h2h.matches > 0 && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">H2H</span>
                  <div className="flex-1 max-w-[120px]">
                    <Progress value={h2h.matches > 0 ? (h2h.wins / h2h.matches) * 100 : 50} className="h-1.5" />
                  </div>
                  <span className="text-[10px] font-medium">
                    {h2h.wins}-{h2h.losses}
                  </span>
                  {h2h.wins > h2h.losses && (
                    <Flame className="w-3 h-3 text-orange-500" />
                  )}
                </div>
              )}
            </div>

            <div
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                isSelected ? "border-primary bg-primary" : "border-muted-foreground/30",
              )}
            >
              {isSelected && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="New Challenge" subtitle="Choose an opponent and propose a time" />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3 space-y-4 pb-4">

        {/* Your Position */}
        {profile && (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold font-heading">{profile.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {myLadderPosition ? (
                    <Badge className="bg-primary/15 text-primary border-primary/30">Rank #{myLadderPosition}</Badge>
                  ) : (
                    <Badge variant="secondary">Unranked</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {profile.wins}W-{profile.losses}L · {winRate(profile.wins, profile.matches_played)}%
                  </span>
                </div>
              </div>
            </div>

            {!myLadderPosition && (
              <div className="mt-3 p-3 rounded-md bg-destructive/5 border border-destructive/20">
                <p className="text-xs text-destructive font-medium">
                  You need a ladder rank before you can challenge. Ask your club admin to rank you.
                </p>
              </div>
            )}

            {myLadderPosition && (
              <div className="mt-3 p-3 rounded-md bg-muted/50 border">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                    Eligible to challenge
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  You can challenge players within <strong className="text-foreground">{challengeLevelsUp}</strong> ladder positions above you
                  (positions <strong className="text-foreground">{Math.max(1, myLadderPosition - challengeLevelsUp)}</strong> to{" "}
                  <strong className="text-foreground">{myLadderPosition - 1}</strong>).
                </p>
              </div>
            )}
          </Card>
        )}

        {/* Path to #1 */}
        {pathToTop.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold font-heading">Path to #1</p>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-[200px]">
                    A suggested set of nearby-rank challenges that could help you climb if you keep winning.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <div className="shrink-0 flex flex-col items-center">
                <span className="text-[10px] text-muted-foreground">You</span>
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary">
                  #{myLadderPosition}
                </div>
              </div>
              {pathToTop.map((step, i) => {
                const h2h = h2hMap.get(step.id);
                return (
                  <div key={step.id} className="flex items-center gap-1 shrink-0">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                    <div
                      className={cn(
                        "flex flex-col items-center cursor-pointer hover:opacity-80",
                        isEligible(step.ladder_position) && "ring-2 ring-primary/30 rounded-lg p-1",
                      )}
                      onClick={() => isEligible(step.ladder_position) && setOpponentId(step.id)}
                    >
                      <span className="text-[9px] text-muted-foreground truncate max-w-[60px]">
                        {step.name.split(" ")[0]}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                        #{step.ladder_position}
                      </div>
                      {h2h && h2h.matches > 0 && (
                        <span className={cn(
                          "text-[9px] font-medium",
                          h2h.wins > h2h.losses ? "text-primary" : "text-destructive",
                        )}>
                          {h2h.wins}-{h2h.losses}
                        </span>
                      )}
                      {isEligible(step.ladder_position) && (
                        <Badge className="text-[8px] px-1 py-0 mt-0.5 bg-primary/15 text-primary border-0">
                          Challenge
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-1 shrink-0">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                <div className="flex flex-col items-center">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-accent-foreground">
                    #1
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {pathToTop.length} challenge{pathToTop.length !== 1 ? "s" : ""} needed to reach #1
              {pathToTop.length > 0 && " (best case)"}
            </p>
          </Card>
        )}

        {/* Selected Opponent Detail */}
        <AnimatePresence>
          {opponentProfile && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="p-4 border-primary/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar initials={getInitials(opponentProfile.name)} size="md" />
                    <div>
                      <p className="text-sm font-semibold font-heading">{opponentProfile.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">
                          Rank #{opponentProfile.rank}
                        </Badge>
                        {!selectedEligible && (
                          <Badge variant="destructive" className="text-[10px]">Not eligible</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setOpponentId("")}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="text-lg font-bold">{opponentProfile.matches_played}</p>
                    <p className="text-[10px] text-muted-foreground">Matches</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="text-lg font-bold text-primary">{opponentProfile.wins}</p>
                    <p className="text-[10px] text-muted-foreground">Wins</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="text-lg font-bold">{winRate(opponentProfile.wins, opponentProfile.matches_played)}%</p>
                    <p className="text-[10px] text-muted-foreground">Win Rate</p>
                  </div>
                </div>

                {(() => {
                  const h2h = h2hMap.get(opponentProfile.id);
                  if (!h2h || h2h.matches === 0) return (
                    <div className="mt-3 p-3 rounded-md bg-muted/30 border border-dashed text-center">
                      <p className="text-xs text-muted-foreground">No previous matches — this will be your first encounter! 🎯</p>
                    </div>
                  );

                  const yourWr = winRate(h2h.wins, h2h.matches);
                  return (
                    <div className="mt-3 p-3 rounded-md bg-muted/50 border">
                      <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                          Head to Head
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-primary">{h2h.wins}</span>
                        <Progress value={yourWr} className="flex-1 h-2" />
                        <span className="text-sm font-bold text-destructive">{h2h.losses}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {h2h.wins > h2h.losses
                          ? `You lead ${h2h.wins}-${h2h.losses}. Keep the momentum going! 🔥`
                          : h2h.wins < h2h.losses
                            ? `They lead ${h2h.losses}-${h2h.wins}. Time for revenge! 💪`
                            : `It's tied ${h2h.wins}-${h2h.losses}. Time to break the deadlock!`}
                      </p>
                    </div>
                  );
                })()}

                {selectedEligible && (
                  <div className="mt-3 p-3 rounded-md bg-primary/5 border border-primary/20">
                    <p className="text-xs text-primary font-medium">
                      ✅ Win this challenge to move from #{myLadderPosition} → #{opponentProfile.ladder_position}
                    </p>
                  </div>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scheduling */}
        <Card className="p-4">
          <p className="text-sm font-semibold font-heading mb-3">Propose a Time</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="proposed-date">Date</Label>
              <Input id="proposed-date" type="date" min={todayStr} value={proposedDate} onChange={(e) => setProposedDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Start time</Label>
              <Input type="time" step={1800} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                  <SelectItem value="90">90 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Court</Label>
              <Select value={courtId} onValueChange={setCourtId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Court 1</SelectItem>
                  <SelectItem value="2">Court 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 rounded-md border p-3 bg-muted/30">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Preview</p>
            <p className="text-sm font-medium mt-1">
              {proposedDate} · {startTime}–{addMinutesToTime(startTime, Number(durationMinutes || "60"))} · Court {courtId}
            </p>
          </div>
        </Card>

        {/* Player List */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold font-heading">Choose Opponent</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/ladder")}>
            Full Ladder
          </Button>
        </div>

        <Input
          placeholder="Search players…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <Tabs value={listTab} onValueChange={setListTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="eligible" className="gap-1.5 text-xs">
              <Target className="w-3.5 h-3.5" /> Eligible ({eligible.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5 text-xs">
              <BarChart3 className="w-3.5 h-3.5" /> All Players ({allPlayers.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="eligible" className="mt-3 space-y-2">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : eligible.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {myRank
                    ? myRank === 1
                      ? "You're #1! No one to challenge above you. 👑"
                      : "No eligible opponents found. Try the All Players tab."
                    : "Get ranked first to see eligible opponents."}
                </p>
              </Card>
            ) : (
              <AnimatePresence>
                {eligible.map((p) => (
                  <PlayerCard key={p.id} p={p} />
                ))}
              </AnimatePresence>
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-3 space-y-2">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <AnimatePresence>
                {allPlayers.map((p) => (
                  <PlayerCard key={p.id} p={p} compact />
                ))}
              </AnimatePresence>
            )}
          </TabsContent>
        </Tabs>

        {/* Send */}
        <Button
          className="w-full"
          disabled={!myRank || !opponentId || !selectedEligible || createChallenge.isPending || proposeSchedule.isPending}
          onClick={onSend}
        >
          {createChallenge.isPending || proposeSchedule.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
          ) : (
            <><Swords className="w-4 h-4 mr-2" /> Send Challenge</>
          )}
        </Button>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Check,
  Clock,
  Loader2,
  Plus,
  Swords,
  Trophy,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChallengeWithProfiles,
  MatchWithProfiles,
  useChallenges,
  useCreateMatch,
  useMatches,
  useUpdateChallengeStatus,
  useUpdateMatch,
} from "@/hooks/use-data";

const statusConfig = {
  pending: { color: "bg-accent/20 text-accent-foreground", icon: Clock },
  accepted: { color: "bg-primary/15 text-primary", icon: Check },
  declined: { color: "bg-destructive/15 text-destructive", icon: X },
  completed: { color: "bg-muted text-muted-foreground", icon: Trophy },
} as const;

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

type RecordDialogState = {
  open: boolean;
  challenge: ChallengeWithProfiles | null;
  score: string;
  winnerId: string;
  matchDate: string;
  courtId: string;
  durationMinutes: string;
  notes: string;
  sets: Array<{ a: string; b: string }>;
};

type AcceptDialogState = {
  open: boolean;
  challenge: ChallengeWithProfiles | null;
  date: string;
};

function parseGameScores(value: string | null): { sets?: Array<{ a: number; b: number }>; notes?: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as any;
  } catch {
    return null;
  }
}

function computeFromSets(sets: Array<{ a: number; b: number }>) {
  if (sets.length === 0) return null;
  if (sets.length > 5) return { error: "Max 5 sets" } as const;

  let aSets = 0;
  let bSets = 0;
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i];
    if (!Number.isFinite(s.a) || !Number.isFinite(s.b)) return { error: "Invalid set score" } as const;
    if (s.a < 0 || s.b < 0) return { error: "Set score can't be negative" } as const;
    if (s.a === s.b) return { error: "Set score can't be tied" } as const;

    const aWins = s.a === 15 && s.b >= 0 && s.b <= 14;
    const bWins = s.b === 15 && s.a >= 0 && s.a <= 14;
    if (!aWins && !bWins) return { error: "Each set must be first to 15 (15-x)" } as const;

    if (aWins) aSets += 1;
    if (bWins) bSets += 1;

    if (aSets === 3 || bSets === 3) {
      if (i !== sets.length - 1) return { error: "Remove extra sets after match is won" } as const;
    }
  }

  if (aSets !== 3 && bSets !== 3) return { error: "Best of 5: first to 3 sets wins" } as const;
  return { aSets, bSets } as const;
}

export default function Challenges() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: challenges, isLoading: challengesLoading } = useChallenges();
  const { data: matches, isLoading: matchesLoading } = useMatches();
  const updateChallenge = useUpdateChallengeStatus();
  const createMatch = useCreateMatch();
  const updateMatch = useUpdateMatch();

  const matchByChallengeId = useMemo(() => {
    const map = new Map<string, MatchWithProfiles>();
    for (const m of matches || []) {
      if (m.challenge_id) map.set(m.challenge_id, m);
    }
    return map;
  }, [matches]);

  const [record, setRecord] = useState<RecordDialogState>(() => ({
    open: false,
    challenge: null,
    score: "",
    winnerId: "",
    matchDate: format(new Date(), "yyyy-MM-dd"),
    courtId: "1",
    durationMinutes: "",
    notes: "",
    sets: [{ a: "", b: "" }, { a: "", b: "" }, { a: "", b: "" }],
  }));

  const [accept, setAccept] = useState<AcceptDialogState>(() => ({
    open: false,
    challenge: null,
    date: format(new Date(), "yyyy-MM-dd"),
  }));

  const openRecord = (challenge: ChallengeWithProfiles) => {
    const existing = matchByChallengeId.get(challenge.id);
    const date = (existing?.match_date || challenge.proposed_date) ?? format(new Date(), "yyyy-MM-dd");
    const parsed = parseGameScores(existing?.game_scores ?? null);
    const existingSets =
      parsed?.sets?.slice(0, 5)?.map((s) => ({ a: String(s.a), b: String(s.b) })) || null;
    setRecord({
      open: true,
      challenge,
      score: existing?.score || "",
      winnerId: existing?.winner_id || "",
      matchDate: date,
      courtId: String(existing?.court_id || 1),
      durationMinutes: existing?.duration_s ? String(Math.round((existing.duration_s as any) / 60)) : "",
      notes: (existing?.notes as any) || parsed?.notes || "",
      sets: existingSets || [{ a: "", b: "" }, { a: "", b: "" }, { a: "", b: "" }],
    });
  };

  const closeRecord = () => {
    setRecord((s) => ({ ...s, open: false, challenge: null }));
  };

  const openAccept = (challenge: ChallengeWithProfiles) => {
    setAccept({
      open: true,
      challenge,
      date: challenge.proposed_date ?? format(new Date(), "yyyy-MM-dd"),
    });
  };

  const closeAccept = () => setAccept((s) => ({ ...s, open: false, challenge: null }));

  const respond = async (challengeId: string, status: "accepted" | "declined", proposedDate?: string | null) => {
    try {
      await updateChallenge.mutateAsync({ challengeId, status, proposedDate });
      toast.success(status === "accepted" ? "Challenge accepted" : "Challenge declined");
    } catch (err: any) {
      toast.error(err.message || "Failed to update challenge");
    }
  };

  const withdraw = async (challengeId: string) => {
    try {
      await updateChallenge.mutateAsync({ challengeId, status: "declined" });
      toast.success("Challenge withdrawn");
    } catch (err: any) {
      toast.error(err.message || "Failed to withdraw challenge");
    }
  };

  const submitResult = async () => {
    const challenge = record.challenge;
    if (!challenge || !user) return;

    const existing = matchByChallengeId.get(challenge.id);
    if (existing) {
      toast.error("A result has already been submitted for this challenge");
      return;
    }

    const cleanedSets = record.sets
      .map((s) => ({ a: s.a.trim(), b: s.b.trim() }))
      .filter((s) => s.a !== "" || s.b !== "");

    let winnerId = record.winnerId || null;
    let score = (record.score || "").trim() || null;
    let gameScores: string | null = null;

    if (cleanedSets.length > 0) {
      const numericSets = cleanedSets.map((s) => ({ a: Number(s.a), b: Number(s.b) }));
      const computed = computeFromSets(numericSets);
      if ((computed as any)?.error) {
        toast.error((computed as any).error);
        return;
      }
      const { aSets, bSets } = computed as any;
      score = `${aSets}-${bSets}`;
      winnerId = aSets > bSets ? challenge.challenger_id : challenge.opponent_id;
      gameScores = JSON.stringify({
        format: { best_of: 5, points_to: 15 },
        sets: numericSets,
      });
    } else {
      if (!winnerId) {
        toast.error("Choose a winner (or enter set scores)");
        return;
      }
      if (!score) {
        toast.error("Enter a score (e.g. 3-1) or set scores");
        return;
      }
    }

    const minutes = record.durationMinutes.trim() ? Number(record.durationMinutes) : null;
    if (minutes != null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 600)) {
      toast.error("Duration must be between 0 and 600 minutes");
      return;
    }
    const durationS = minutes == null ? null : Math.round(minutes * 60);
    const notes = record.notes.trim() || null;

    try {
      await createMatch.mutateAsync({
        playerA: challenge.challenger_id,
        playerB: challenge.opponent_id,
        winnerId,
        score,
        matchDate: record.matchDate,
        courtId: Number(record.courtId) || 1,
        challengeId: challenge.id,
        gameScores,
        durationS,
        notes,
      });
      toast.success("Result submitted (awaiting confirmation)");
      closeRecord();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit result");
    }
  };

  const confirmMatch = async (matchId: string) => {
    try {
      await updateMatch.mutateAsync({ matchId, confirmed: true, disputed: false });
      toast.success("Match confirmed");
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm match");
    }
  };

  const disputeMatch = async (matchId: string) => {
    try {
      await updateMatch.mutateAsync({ matchId, disputed: true });
      toast.success("Marked as disputed");
    } catch (err: any) {
      toast.error(err.message || "Failed to dispute match");
    }
  };

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Challenges" subtitle="Challenge & compete" />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-2">
        <Button className="w-full" onClick={() => navigate("/challenges/new")}>
          <Plus className="w-4 h-4 mr-2" /> New Challenge
        </Button>
      </div>

      <Tabs defaultValue="challenges" className="px-4 sm:px-6 lg:px-[5%] mt-3">
        <TabsList className="w-full">
          <TabsTrigger value="challenges" className="flex-1">Challenges</TabsTrigger>
          <TabsTrigger value="results" className="flex-1">Match Results</TabsTrigger>
        </TabsList>

        <TabsContent value="challenges" className="mt-3 space-y-2">
          {challengesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (challenges || []).length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No challenges yet. Create one to get started.
            </Card>
          ) : (
            (challenges || []).map((challenge, i) => {
              const config = statusConfig[challenge.status as keyof typeof statusConfig];
              const StatusIcon = config.icon;

              const isIncoming = user?.id === challenge.opponent_id;
              const isOutgoing = user?.id === challenge.challenger_id;
              const canRespond = challenge.status === "pending" && isIncoming;
              const canWithdraw = challenge.status === "pending" && isOutgoing;

              const match = matchByChallengeId.get(challenge.id);
              const canRecord = challenge.status === "accepted" && !match;

              return (
                <div
                  key={challenge.id}
                  className={cn("transition-opacity", i === 0 ? "opacity-100" : "opacity-100")}
                >
                  <Card className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon className="w-4 h-4 text-muted-foreground" />
                        <Badge className={cn("text-[10px] capitalize", config.color)} variant="secondary">
                          {challenge.status}
                        </Badge>
                        {isIncoming && (
                          <Badge variant="secondary" className="text-[10px]">
                            Incoming
                          </Badge>
                        )}
                        {isOutgoing && (
                          <Badge variant="secondary" className="text-[10px]">
                            Outgoing
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {format(new Date(challenge.created_at), "yyyy-MM-dd")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <PlayerAvatar initials={initials(challenge.challenger_name)} size="sm" />
                        <span className="text-sm font-medium truncate">
                          {challenge.challenger_name}
                        </span>
                      </div>
                      <span className="text-xs font-heading font-bold text-muted-foreground shrink-0">
                        VS
                      </span>
                      <div className="flex items-center gap-2 min-w-0 justify-end">
                        <span className="text-sm font-medium truncate">
                          {challenge.opponent_name}
                        </span>
                        <PlayerAvatar initials={initials(challenge.opponent_name)} size="sm" />
                      </div>
                    </div>

                    {challenge.proposed_date && (
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        Proposed: {challenge.proposed_date}
                      </p>
                    )}

                    {match?.score && (
                      <p className="text-xs mt-2 text-center">
                        <span className="text-muted-foreground">Score:</span>{" "}
                        <span className="font-semibold text-primary">{match.score}</span>
                        {!match.confirmed && (
                          <span className="ml-2 text-muted-foreground">
                            (awaiting confirmation)
                          </span>
                        )}
                      </p>
                    )}
                    {match?.game_scores && (() => {
                      const parsed = parseGameScores(match.game_scores);
                      const sets = parsed?.sets?.map((s) => `${s.a}-${s.b}`).join(" · ");
                      if (!sets) return null;
                      return (
                        <p className="text-[11px] text-muted-foreground mt-1 text-center">
                          Sets: {sets}
                        </p>
                      );
                    })()}

                    {canRespond && (
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          disabled={updateChallenge.isPending}
                          onClick={() => openAccept(challenge)}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs"
                          disabled={updateChallenge.isPending}
                          onClick={() => respond(challenge.id, "declined")}
                        >
                          Decline
                        </Button>
                      </div>
                    )}

                    {canWithdraw && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-8 text-xs"
                          disabled={updateChallenge.isPending}
                          onClick={() => withdraw(challenge.id)}
                        >
                          Withdraw
                        </Button>
                      </div>
                    )}

                    {canRecord && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-8 text-xs gap-1"
                          onClick={() => openRecord(challenge)}
                        >
                          <Swords className="w-3 h-3" /> Record Result
                        </Button>
                      </div>
                    )}

                    {challenge.status === "accepted" && match && !match.confirmed && (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full h-8 text-xs"
                          onClick={() => openRecord(challenge)}
                        >
                          View Submitted Result
                        </Button>
                      </div>
                    )}
                  </Card>
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="results" className="mt-3 space-y-2">
          {matchesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (matches || []).length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No match results yet.
            </Card>
          ) : (
            (matches || []).map((match) => {
              const needsConfirmation = !match.confirmed && !match.disputed;
              const canConfirm =
                needsConfirmation && !!user && match.submitted_by !== user.id;

              return (
                <Card key={match.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{match.match_date}</span>
                    {match.disputed ? (
                      <Badge variant="secondary" className="text-[10px] bg-destructive/15 text-destructive">
                        Disputed
                      </Badge>
                    ) : !match.confirmed ? (
                      <Badge variant="secondary" className="text-[10px] bg-accent/20">
                        Awaiting confirmation
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Confirmed
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar initials={initials(match.player_a_name)} size="sm" />
                      <p className={cn(
                        "text-sm font-medium truncate",
                        match.winner_id === match.player_a && "text-win"
                      )}>
                        {match.player_a_name}
                      </p>
                    </div>

                    <span className="text-lg font-heading font-bold text-primary shrink-0">
                      {match.score || "—"}
                    </span>

                    <div className="flex items-center gap-2 min-w-0 justify-end">
                      <p className={cn(
                        "text-sm font-medium truncate text-right",
                        match.winner_id === match.player_b && "text-win"
                      )}>
                        {match.player_b_name}
                      </p>
                      <PlayerAvatar initials={initials(match.player_b_name)} size="sm" />
                    </div>
                  </div>

                  {match.game_scores && (() => {
                    const parsed = parseGameScores(match.game_scores);
                    const sets = parsed?.sets?.map((s) => `${s.a}-${s.b}`).join(" · ");
                    if (!sets) return null;
                    return (
                      <p className="text-[11px] text-muted-foreground mt-2 text-center">
                        Sets: {sets}
                      </p>
                    );
                  })()}

                  {canConfirm && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        disabled={updateMatch.isPending}
                        onClick={() => confirmMatch(match.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs"
                        disabled={updateMatch.isPending}
                        onClick={() => disputeMatch(match.id)}
                      >
                        Dispute
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={record.open} onOpenChange={(open) => (!open ? closeRecord() : null)}>
        <DialogContent className="flex flex-col max-h-[90vh] overflow-hidden p-0 gap-0">
          <div className="p-6 pb-4 border-b">
            <DialogHeader>
              <DialogTitle>Record Match Result</DialogTitle>
            </DialogHeader>
          </div>

          {record.challenge && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {matchByChallengeId.get(record.challenge.id) && (
                <Card className="p-3 border-primary/20 bg-primary/5">
                  <p className="text-xs text-muted-foreground">
                    A result has already been submitted for this challenge.
                  </p>
                </Card>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <PlayerAvatar initials={initials(record.challenge.challenger_name)} size="sm" />
                  <span className="text-sm font-medium truncate">
                    {record.challenge.challenger_name}
                  </span>
                </div>
                <span className="text-xs font-heading font-bold text-muted-foreground">VS</span>
                <div className="flex items-center gap-2 min-w-0 justify-end">
                  <span className="text-sm font-medium truncate">
                    {record.challenge.opponent_name}
                  </span>
                  <PlayerAvatar initials={initials(record.challenge.opponent_name)} size="sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="match-date">Match date</Label>
                  <Input
                    id="match-date"
                    type="date"
                    value={record.matchDate}
                    onChange={(e) => setRecord((s) => ({ ...s, matchDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Court</Label>
                  <Select
                    value={record.courtId}
                    onValueChange={(value) => setRecord((s) => ({ ...s, courtId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select court" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Court 1</SelectItem>
                      <SelectItem value="2">Court 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Set scores (optional)</Label>
                <div className="space-y-2">
                  {record.sets.slice(0, 5).map((set, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_24px_1fr] gap-2 items-center">
                      <Input
                        inputMode="numeric"
                        placeholder="15"
                        value={set.a}
                        onChange={(e) =>
                          setRecord((s) => {
                            const next = [...s.sets];
                            next[idx] = { ...next[idx], a: e.target.value };
                            return { ...s, sets: next };
                          })
                        }
                      />
                      <span className="text-center text-xs text-muted-foreground">-</span>
                      <Input
                        inputMode="numeric"
                        placeholder="12"
                        value={set.b}
                        onChange={(e) =>
                          setRecord((s) => {
                            const next = [...s.sets];
                            next[idx] = { ...next[idx], b: e.target.value };
                            return { ...s, sets: next };
                          })
                        }
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => setRecord((s) => ({ ...s, sets: [...s.sets, { a: "", b: "" }].slice(0, 5) }))}
                      disabled={record.sets.length >= 5}
                    >
                      Add set
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => setRecord((s) => ({ ...s, sets: s.sets.slice(0, Math.max(1, s.sets.length - 1)) }))}
                      disabled={record.sets.length <= 1}
                    >
                      Remove set
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Best of 5 · first to 15 each set.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="score">Match score (if not using set scores)</Label>
                <Input
                  id="score"
                  placeholder="e.g. 3-1"
                  value={record.score}
                  onChange={(e) => setRecord((s) => ({ ...s, score: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Winner</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={record.winnerId === record.challenge.challenger_id ? "default" : "outline"}
                    className="h-9 text-xs"
                    onClick={() => setRecord((s) => ({ ...s, winnerId: record.challenge!.challenger_id }))}
                  >
                    {record.challenge.challenger_name}
                  </Button>
                  <Button
                    type="button"
                    variant={record.winnerId === record.challenge.opponent_id ? "default" : "outline"}
                    className="h-9 text-xs"
                    onClick={() => setRecord((s) => ({ ...s, winnerId: record.challenge!.opponent_id }))}
                  >
                    {record.challenge.opponent_name}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Tip: entering set scores will auto-pick the winner.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Duration (minutes)</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="e.g. 45"
                    value={record.durationMinutes}
                    onChange={(e) => setRecord((s) => ({ ...s, durationMinutes: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Input
                    placeholder="Optional"
                    value={record.notes}
                    onChange={(e) => setRecord((s) => ({ ...s, notes: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="p-6 pt-4 border-t bg-background">
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={closeRecord}>
                Cancel
              </Button>
              <Button
                onClick={submitResult}
                disabled={
                  createMatch.isPending ||
                  updateChallenge.isPending ||
                  (!!record.challenge && !!matchByChallengeId.get(record.challenge.id))
                }
              >
                {createMatch.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                  </>
                ) : (
                  "Submit Result"
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={accept.open} onOpenChange={(open) => (!open ? closeAccept() : null)}>
        <DialogContent className="flex flex-col max-h-[90vh] overflow-hidden p-0 gap-0">
          <div className="p-6 pb-4 border-b">
            <DialogHeader>
              <DialogTitle>Accept Challenge</DialogTitle>
            </DialogHeader>
          </div>

          {accept.challenge && (
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                Confirm the date for this match. You can still record the result later.
              </p>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={accept.date}
                  onChange={(e) => setAccept((s) => ({ ...s, date: e.target.value }))}
                />
              </div>
            </div>
          )}

          <div className="p-6 pt-4 border-t bg-background">
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={closeAccept}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!accept.challenge) return;
                  await respond(accept.challenge.id, "accepted", accept.date || null);
                  closeAccept();
                }}
                disabled={updateChallenge.isPending}
              >
                Accept
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

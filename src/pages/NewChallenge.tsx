import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { Loader2, Swords, X } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCreateChallenge, useLadder, useProfile, useProposeChallengeSchedule } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":").map((x) => Number(x));
  return hh * 60 + mm;
}

function minutesToTime(m: number) {
  const mm = ((m % 60) + 60) % 60;
  const hh = Math.floor(m / 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function addMinutesToTime(t: string, delta: number) {
  return minutesToTime(timeToMinutes(t) + delta);
}

export default function NewChallenge() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { data: ladder, isLoading } = useLadder();
  const { data: profile } = useProfile();
  const createChallenge = useCreateChallenge();
  const proposeSchedule = useProposeChallengeSchedule();

  const today = useMemo(() => new Date(), []);
  const todayStr = format(today, "yyyy-MM-dd");
  const defaultProposed = format(addDays(today, 3), "yyyy-MM-dd");

  const initialOpponent = params.get("opponent") || "";
  const [opponentId, setOpponentId] = useState(initialOpponent);
  const [proposedDate, setProposedDate] = useState<string>(defaultProposed);
  const [startTime, setStartTime] = useState<string>("18:00");
  const [durationMinutes, setDurationMinutes] = useState<string>("60");
  const [courtId, setCourtId] = useState<string>("1");
  const [query, setQuery] = useState("");

  const opponentProfile = useMemo(() => {
    if (!ladder || !opponentId) return null;
    return ladder.find((p) => p.id === opponentId) || null;
  }, [ladder, opponentId]);

  const myRank = profile?.rank ?? null;
  const isEligibleOpponent = (opponentRank: number | null) => {
    if (!myRank || !opponentRank) return false;
    const diff = myRank - opponentRank;
    return diff >= 1 && diff <= 2;
  };

  const selectedEligible = isEligibleOpponent(opponentProfile?.rank ?? null);

  const filtered = useMemo(() => {
    const list = ladder || [];
    const q = query.trim().toLowerCase();
    return list.filter((p) => {
      if (p.id === user?.id) return false;
      if (!q) return true;
      return (p.name || "").toLowerCase().includes(q);
    });
  }, [ladder, query, user?.id]);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const onSend = async () => {
    if (!myRank) {
      toast.error("You need a ladder position to challenge players");
      return;
    }
    if (!selectedEligible) {
      toast.error("You can only challenge up to 2 positions above you");
      return;
    }

    try {
      const challenge = await createChallenge.mutateAsync({
        opponentId,
        proposedDate: proposedDate || null,
      });

      try {
        const minutes = durationMinutes.trim() ? Number(durationMinutes) : 60;
        if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 240) {
          throw new Error("Duration must be between 30 and 240 minutes");
        }
        const endTime = addMinutesToTime(startTime, minutes);
        await proposeSchedule.mutateAsync({
          challengeId: (challenge as any).id,
          proposedDate,
          startTime: `${startTime}:00`,
          endTime: `${endTime}:00`,
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

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="New Challenge" subtitle="Choose an opponent and propose a time" />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3 space-y-4">
        {!myRank && (
          <Card className="p-4 border-destructive/30 bg-destructive/5">
            <p className="text-sm font-semibold">Not ranked yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              You’ll be added from the bottom of the ladder. Once you have a position, you can start challenging up to 2 ranks above.
            </p>
          </Card>
        )}

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold font-heading">Opponent</p>
              <p className="text-xs text-muted-foreground">
                Select a player from the ladder
              </p>
            </div>

            {opponentProfile ? (
              <div className="flex items-center gap-2">
                <PlayerAvatar initials={getInitials(opponentProfile.name)} size="sm" />
                <span className="text-sm font-medium truncate max-w-[160px]">
                  {opponentProfile.name}
                </span>
                {!selectedEligible && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    Not eligible
                  </span>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setOpponentId("")}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">None selected</span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="challenge-search">Search</Label>
              <Input
                id="challenge-search"
                placeholder="Type a name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proposed-date">Proposed date</Label>
              <Input
                id="proposed-date"
                type="date"
                min={todayStr}
                value={proposedDate}
                onChange={(e) => setProposedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Start time</Label>
              <Input
                type="time"
                step={1800}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                <SelectTrigger>
                  <SelectValue placeholder="Duration" />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue placeholder="Court" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Court 1</SelectItem>
                  <SelectItem value="2">Court 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 rounded-md border p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Preview</p>
            <p className="text-sm font-medium mt-1">
              {proposedDate} · {startTime}-{addMinutesToTime(startTime, Number(durationMinutes || "60"))} · Court {courtId}
            </p>
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold font-heading">Players</p>
          <Button variant="outline" onClick={() => navigate("/ladder")}>
            View Ladder
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
              const isSelected = p.id === opponentId;
              const eligible = isEligibleOpponent(p.rank ?? null);
              const winRate =
                p.matches_played > 0
                  ? Math.round((p.wins / p.matches_played) * 100)
                  : 0;

              return (
                <Card
                  key={p.id}
                  className={cn(
                    "p-3 flex items-center gap-3 transition-colors",
                    eligible ? "cursor-pointer hover:bg-muted/40" : "opacity-60 cursor-not-allowed",
                    isSelected ? "border-primary/50 bg-primary/5" : "border-border"
                  )}
                  onClick={() => {
                    if (eligible) setOpponentId(p.id);
                  }}
                >
                  <PlayerAvatar initials={getInitials(p.name)} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {p.name}
                      {p.id === user?.id && (
                        <span className="ml-2 text-[10px] text-muted-foreground font-medium">
                          (You)
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.wins}W - {p.losses}L · {winRate}%
                    </p>
                  </div>
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border",
                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                    )}
                  />
                </Card>
              );
            })}
          </div>
        )}

        <Button
          className="w-full"
          disabled={!myRank || !opponentId || !selectedEligible || createChallenge.isPending || proposeSchedule.isPending}
          onClick={onSend}
        >
          {createChallenge.isPending || proposeSchedule.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…
            </>
          ) : (
            <>
              <Swords className="w-4 h-4 mr-2" /> Send Challenge
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

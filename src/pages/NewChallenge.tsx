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
import { cn } from "@/lib/utils";
import { useCreateChallenge, useLadder, useProfile } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";

export default function NewChallenge() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { data: ladder, isLoading } = useLadder();
  const { data: profile } = useProfile();
  const createChallenge = useCreateChallenge();

  const today = useMemo(() => new Date(), []);
  const todayStr = format(today, "yyyy-MM-dd");
  const defaultProposed = format(addDays(today, 3), "yyyy-MM-dd");

  const initialOpponent = params.get("opponent") || "";
  const [opponentId, setOpponentId] = useState(initialOpponent);
  const [proposedDate, setProposedDate] = useState<string>(defaultProposed);
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
      await createChallenge.mutateAsync({
        opponentId,
        proposedDate: proposedDate || null,
      });
      toast.success("Challenge sent");
      navigate("/challenges");
    } catch (err: any) {
      toast.error(err.message || "Failed to send challenge");
    }
  };

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="New Challenge" subtitle="Choose an opponent and propose a date" />

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
          disabled={!myRank || !opponentId || !selectedEligible || createChallenge.isPending}
          onClick={onSend}
        >
          {createChallenge.isPending ? (
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

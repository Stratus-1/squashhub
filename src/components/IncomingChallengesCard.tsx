import { useMemo } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, Clock, Swords, X } from "lucide-react";

import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChallengeWithProfiles, useUpdateChallengeStatus } from "@/hooks/use-data";

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function IncomingChallengesCard({
  userId,
  challenges,
  maxItems = 3,
  onViewAll,
}: {
  userId: string | null | undefined;
  challenges: ChallengeWithProfiles[] | null | undefined;
  maxItems?: number;
  onViewAll?: () => void;
}) {
  const updateChallenge = useUpdateChallengeStatus();

  const incoming = useMemo(() => {
    if (!userId) return [];
    return (challenges || []).filter((c) => c.opponent_id === userId && c.status === "pending");
  }, [challenges, userId]);

  if (!userId || incoming.length === 0) return null;

  const accept = async (challengeId: string) => {
    try {
      await updateChallenge.mutateAsync({ challengeId, status: "accepted" });
      toast.success("Challenge accepted");
    } catch (e: any) {
      toast.error(e?.message || "Could not accept challenge");
    }
  };

  const decline = async (challengeId: string) => {
    try {
      await updateChallenge.mutateAsync({ challengeId, status: "declined" });
      toast.success("Challenge declined");
    } catch (e: any) {
      toast.error(e?.message || "Could not decline challenge");
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold font-heading">Challenges for you</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Accept or decline. You can schedule a time after accepting.
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0 tabular-nums">
          {incoming.length} pending
        </Badge>
      </div>

      <div className="mt-3 space-y-2">
        {incoming.slice(0, maxItems).map((c) => (
          <div key={c.id} className="rounded-xl border border-border/70 bg-background/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-2">
                <PlayerAvatar initials={initials(c.challenger_name)} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.challenger_name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {c.proposed_date ? `Proposed: ${c.proposed_date}` : "No proposed date"}
                    {" · "}
                    {format(new Date(c.created_at), "yyyy-MM-dd")}
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <Clock className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <Button
                size="sm"
                className="h-9 sm:flex-1"
                disabled={updateChallenge.isPending}
                onClick={() => accept(c.id)}
              >
                <Check className="w-4 h-4 mr-2" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 sm:flex-1"
                disabled={updateChallenge.isPending}
                onClick={() => decline(c.id)}
              >
                <X className="w-4 h-4 mr-2" />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground flex items-center gap-2 min-w-0">
          <Swords className="w-4 h-4" />
          <span className="truncate">Tip: open Challenges to propose/accept times.</span>
        </div>
        {onViewAll ? (
          <Button size="sm" variant="ghost" className="h-8 text-xs shrink-0" onClick={onViewAll}>
            View all
          </Button>
        ) : null}
      </div>
    </Card>
  );
}


import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { LadderPlayerCard, type LadderPlayer } from "@/components/LadderPlayerCard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Swords } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLadder, useCreateChallenge } from "@/hooks/use-data";
import { useMyClub, useMyClubMember } from "@/hooks/use-club";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { PlayerAvatar } from "@/components/PlayerAvatar";

export default function Ladder() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: clubData } = useMyClub();
  const { data: myClubMember } = useMyClubMember();
  const clubId = clubData?.club?.id;
  const { data: players, isLoading } = useLadder(clubId);
  const queryClient = useQueryClient();
  const createChallenge = useCreateChallenge();

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
    const keys = [user?.id, myClubMember?.id].filter(Boolean) as string[];
    for (const key of keys) {
      const position = positionMap.get(key);
      if (typeof position === "number") return position;
    }
    return null;
  }, [positionMap, user?.id, myClubMember?.id]);

  const challengeLevelsUp = (clubData?.club as any)?.challenge_levels_up ?? 2;

  const canChallenge = (player: LadderPlayer): string | null => {
    if (!user?.id) return "You must be logged in.";
    if (player.user_id === user.id) return null; // hide button for self
    if (!player.user_id) return "This member has not linked an account yet.";
    if (!myPosition) return "Your account is not linked to your ladder rank yet.";

    const opponentPos =
      positionMap.get(player.user_id) ??
      positionMap.get(player.club_member_id) ??
      positionMap.get(player.id) ??
      null;

    if (!opponentPos) return "This player is not ranked.";
    if (myPosition <= opponentPos) return "You may only challenge players above you.";

    const diff = myPosition - opponentPos;
    if (diff > challengeLevelsUp) return `You can only challenge up to ${challengeLevelsUp} positions above you.`;

    return null;
  };

  const isChallengeable = (player: LadderPlayer): boolean => {
    if (!user?.id || player.user_id === user.id) return false;
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
    if (!challengeDialog.player.user_id) {
      toast.error("This member has not linked an account yet.");
      return;
    }

    setSending(true);
    try {
      await createChallenge.mutateAsync({
        opponentId: challengeDialog.player.user_id,
        proposedDate,
        proposedTime,
        courtId: courtId ? Number(courtId) : undefined,
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

  const renderColumn = (title: string, list: LadderPlayer[]) => (
    <div>
      <h2 className="text-sm font-heading font-bold text-foreground mb-2 uppercase tracking-wide">
        {title}
        <span className="text-muted-foreground font-normal ml-1.5">({list.length})</span>
      </h2>
      <div className="space-y-1.5">
        {list.map((player, index) => (
          <LadderPlayerCard
            key={player.id}
            player={player}
            index={index}
            isMe={player.user_id === user?.id || player.id === user?.id || player.club_member_id === myClubMember?.id}
            isAdmin={false}
            onNavigate={(id, isMe) => {
              if (isMe) navigate("/profile");
              else navigate(`/players/${id}`);
            }}
            onChallenge={() => handleChallengeClick(player)}
            challengeBlocked={!isChallengeable(player)}
            highlightChallengeable={isChallengeable(player)}
          />
        ))}
        {list.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">No players yet</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="bottom-nav-safe">
      <SEO title="Player Ladder" description="See the latest squash ladder rankings." path="/ladder" noIndex />
      <PageHeader
        title="Player Ladder"
        subtitle={`${(players || []).length} players ranked`}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="px-4 mt-3 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderColumn("Men's Ladder", menPlayers)}
          {renderColumn("Ladies' Ladder", ladiesPlayers)}
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
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <PlayerAvatar initials={getInitials(challengeDialog.player.name)} size="sm" avatarUrl={challengeDialog.player.avatar_url} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{challengeDialog.player.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  #{positionMap.get(challengeDialog.player.id)} on ladder · {challengeDialog.player.wins}W-{challengeDialog.player.losses}L
                </p>
              </div>
            </div>
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
    </div>
  );
}

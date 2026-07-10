import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fromExt } from "@/lib/supabase-ext";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champId: string;
  match: any | null;
  champ: any;
  allMatches: any[];
  getName: (memberId: string | null | undefined) => string;
}

/**
 * Mark a tournament match as a No Show / Injured forfeit.
 * Awards the configured opponent / player points (per `club_champs`).
 * Optionally cascades to all the player's remaining (not-yet-completed) games.
 */
export function NoShowInjuredDialog({
  open,
  onOpenChange,
  champId,
  match,
  champ,
  allMatches,
  getName,
}: Props) {
  const qc = useQueryClient();
  const [absentSide, setAbsentSide] = useState<"a" | "b">("a");
  const [cascadePromptOpen, setCascadePromptOpen] = useState(false);
  const [pendingForfeitMemberId, setPendingForfeitMemberId] = useState<string | null>(null);

  const opponentPoints = Number(champ?.no_show_opponent_points ?? 10);
  const playerPoints = Number(champ?.no_show_player_points ?? 0);

  useEffect(() => {
    if (open) setAbsentSide("a");
  }, [open, match?.id]);

  const sideAName = useMemo(() => getName(match?.player_a_member_id), [match, getName]);
  const sideBName = useMemo(() => getName(match?.player_b_member_id), [match, getName]);

  function buildForfeitPayload(m: any, absentMemberId: string) {
    const absentIsA = m.player_a_member_id === absentMemberId;
    const aPts = absentIsA ? playerPoints : opponentPoints;
    const bPts = absentIsA ? opponentPoints : playerPoints;
    const winnerMemberId = absentIsA ? m.player_b_member_id : m.player_a_member_id;
    return {
      status: "completed",
      winner_member_id: winnerMemberId,
      side_a_points: aPts,
      side_b_points: bPts,
      score: absentIsA ? "No show (B w/o)" : "No show (A w/o)",
      game_scores: null,
      forfeit_member_id: absentMemberId,
    };
  }

  const applyOne = useMutation({
    mutationFn: async () => {
      if (!match) throw new Error("No match");
      const absentMemberId = absentSide === "a" ? match.player_a_member_id : match.player_b_member_id;
      const payload = buildForfeitPayload(match, absentMemberId);
      const { error } = await fromExt("club_champs_matches").update(payload).eq("id", match.id);
      if (error) throw error;
      return absentMemberId as string;
    },
    onSuccess: (absentMemberId) => {
      qc.invalidateQueries({ queryKey: ["club-champ-matches", champId] });
      qc.invalidateQueries({ queryKey: ["bells-match", match?.id] });
      qc.invalidateQueries({ queryKey: ["tournaments-all-matches"] });
      toast.success("Match marked as No Show / Injured");
      onOpenChange(false);
      // Find any remaining not-yet-completed games for this player.
      const remaining = allMatches.filter(
        (m: any) =>
          !m.is_bye &&
          m.id !== match.id &&
          m.status !== "completed" &&
          (m.player_a_member_id === absentMemberId || m.player_b_member_id === absentMemberId),
      );
      if (remaining.length > 0) {
        setPendingForfeitMemberId(absentMemberId);
        setCascadePromptOpen(true);
      }
    },
    onError: (e: any) => toast.error(e?.message || "Failed to mark No Show"),
  });

  const cascade = useMutation({
    mutationFn: async () => {
      const absentMemberId = pendingForfeitMemberId;
      if (!absentMemberId) return 0;
      const remaining = allMatches.filter(
        (m: any) =>
          !m.is_bye &&
          m.status !== "completed" &&
          (m.player_a_member_id === absentMemberId || m.player_b_member_id === absentMemberId),
      );
      for (const m of remaining) {
        const payload = buildForfeitPayload(m, absentMemberId);
        const { error } = await fromExt("club_champs_matches").update(payload).eq("id", m.id);
        if (error) throw error;
      }
      return remaining.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["club-champ-matches", champId] });
      toast.success(`Applied to ${n} remaining match${n === 1 ? "" : "es"}`);
      setCascadePromptOpen(false);
      setPendingForfeitMemberId(null);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to cascade"),
  });

  const absentName =
    pendingForfeitMemberId === match?.player_a_member_id
      ? sideAName
      : pendingForfeitMemberId === match?.player_b_member_id
      ? sideBName
      : getName(pendingForfeitMemberId);

  const remainingCount = pendingForfeitMemberId
    ? allMatches.filter(
        (m: any) =>
          !m.is_bye &&
          m.status !== "completed" &&
          (m.player_a_member_id === pendingForfeitMemberId ||
            m.player_b_member_id === pendingForfeitMemberId),
      ).length
    : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>No Show / Injured</DialogTitle>
            <DialogDescription>
              Award {opponentPoints} pts to the opponent and {playerPoints} pts to the absent player. The match will be marked completed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label className="text-sm">Who couldn't play?</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded border hover:bg-muted/50">
                <input
                  type="radio"
                  name="no-show-side"
                  checked={absentSide === "a"}
                  onChange={() => setAbsentSide("a")}
                />
                <span className="text-sm">{sideAName || "Player A"}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded border hover:bg-muted/50">
                <input
                  type="radio"
                  name="no-show-side"
                  checked={absentSide === "b"}
                  onChange={() => setAbsentSide("b")}
                />
                <span className="text-sm">{sideBName || "Player B"}</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applyOne.isPending}>
              Cancel
            </Button>
            <Button onClick={() => applyOne.mutate()} disabled={applyOne.isPending}>
              {applyOne.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cascadePromptOpen} onOpenChange={setCascadePromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply to remaining games?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{absentName}</b> has <b>{remainingCount}</b> remaining scheduled match{remainingCount === 1 ? "" : "es"} in this tournament. Mark them all as No Show / Injured too? Each opponent will receive {opponentPoints} points; {absentName} will record {playerPoints}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cascade.isPending}>No, just this one</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); cascade.mutate(); }} disabled={cascade.isPending}>
              {cascade.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Yes, apply to all remaining
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

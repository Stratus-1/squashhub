import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  buildForfeitPayload,
  describeForfeitRule,
  forfeitOptionsForScoring,
  pointsForLeague,
  ruleForLeague,
  type ForfeitPointsMap,
  type ForfeitRuleMap,
} from "@/lib/tournaments/forfeit";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  champId: string;
  match: any | null;
  champ: any;
  allMatches: any[];
  getName: (memberId: string | null | undefined) => string;
  /** Called after the forfeit has been persisted (and any cascade prompt closed). */
  onApplied?: () => void;
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
  onApplied,
}: Props) {

  const qc = useQueryClient();
  const [absentSide, setAbsentSide] = useState<"a" | "b">("a");
  const [cascadePromptOpen, setCascadePromptOpen] = useState(false);
  const [pendingForfeitMemberId, setPendingForfeitMemberId] = useState<string | null>(null);

  // Per-league rules live on the tournaments row (the club_champs view only carries
  // the legacy tournament-wide points, which we still use as the fallback).
  const { data: leagueCfg } = useQuery({
    queryKey: ["tournament-forfeit-config", champId],
    enabled: !!champId,
    queryFn: async () => {
      const { data, error } = await fromExt("tournaments")
        .select("league_forfeit_rules, league_forfeit_points, league_scoring_modes")
        .eq("id", champId)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as {
        league_forfeit_rules: ForfeitRuleMap | null;
        league_forfeit_points: ForfeitPointsMap | null;
        league_scoring_modes: Record<string, "standard" | "time_capped_points"> | null;
      } | null;
    },
  });

  /** Scoring format, forfeit rule and points for the league a match sits in. */
  function configFor(m: any) {
    const gn = Number(m?.group_number ?? 1) || 1;
    const scoring =
      leagueCfg?.league_scoring_modes?.[String(gn)] ??
      (champ?.scoring_mode === "time_capped_points" ? "time_capped_points" : "standard");
    const rule = ruleForLeague(leagueCfg?.league_forfeit_rules, gn, scoring);
    const points = pointsForLeague(leagueCfg?.league_forfeit_points, gn, {
      opponent: champ?.no_show_opponent_points,
      player: champ?.no_show_player_points,
    });
    return { scoring, rule, points };
  }

  const activeCfg = configFor(match);

  useEffect(() => {
    if (open) setAbsentSide("a");
  }, [open, match?.id]);

  const sideAName = useMemo(() => getName(match?.player_a_member_id), [match, getName]);
  const sideBName = useMemo(() => getName(match?.player_b_member_id), [match, getName]);

  /** Payload for one match, using that match's own league rule. */
  function forfeitPayloadFor(m: any, absentMemberId: string) {
    const { rule, points } = configFor(m);
    return buildForfeitPayload({
      match: m,
      absentMemberId,
      rule,
      points,
      bestOf: Number(champ?.best_of) || 3,
      pointsPerGame: Number(champ?.points_per_game) || 11,
    });
  }

  const applyOne = useMutation({
    mutationFn: async () => {
      if (!match) throw new Error("No match");
      const absentMemberId = absentSide === "a" ? match.player_a_member_id : match.player_b_member_id;
      const payload = forfeitPayloadFor(match, absentMemberId);
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
      } else {
        onApplied?.();
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
        const payload = forfeitPayloadFor(m, absentMemberId);
        const { error } = await fromExt("club_champs_matches").update(payload).eq("id", m.id);
        if (error) throw error;
      }
      return remaining.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["club-champ-matches", champId] });
      qc.invalidateQueries({ queryKey: ["bells-match", match?.id] });
      qc.invalidateQueries({ queryKey: ["tournaments-all-matches"] });
      toast.success(`Applied to ${n} remaining match${n === 1 ? "" : "es"}`);
      setCascadePromptOpen(false);
      setPendingForfeitMemberId(null);
      onApplied?.();
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
              {forfeitOptionsForScoring(activeCfg.scoring).find((o) => o.value === activeCfg.rule)?.hint ||
                "The match will be marked completed."}{" "}
              <span className="font-medium text-foreground">
                ({describeForfeitRule(activeCfg.rule, activeCfg.points)} — set per league in the tournament Structure step.)
              </span>
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
              <b>{absentName}</b> has <b>{remainingCount}</b> remaining scheduled match{remainingCount === 1 ? "" : "es"} in this tournament. Mark them all as No Show / Injured too? Each game uses its own league's forfeit rule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cascade.isPending} onClick={() => { setPendingForfeitMemberId(null); onApplied?.(); }}>No, just this one</AlertDialogCancel>
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

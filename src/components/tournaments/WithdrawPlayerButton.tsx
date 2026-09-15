/**
 * "Pull a player out" — the tournament-wide withdrawal action for organisers,
 * reachable straight from the Tournament Games screen.
 *
 * A player may be entered in several leagues of the same tournament, so the
 * organiser picks ONE league (or all of them). Every game of theirs still to
 * be played there is closed as a walkover for the opponent (who stays alive
 * in the draw); games already played keep their real result and the player's
 * other leagues are untouched. Same rules as the Players list pull-out — one
 * shared code path in `src/lib/tournaments/withdraw.ts`.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, UserMinus } from "lucide-react";
import { fromExt } from "@/lib/supabase-ext";
import { withdrawalUpdates } from "@/lib/tournaments/withdraw";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface Props {
  /** Current (not past) tournaments on the Games screen. */
  champs: any[];
}

export function WithdrawPlayerButton({ champs }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [champId, setChampId] = useState<string>("");
  const [memberId, setMemberId] = useState<string>("");
  const [groupChoice, setGroupChoice] = useState<string>("all");
  const [confirming, setConfirming] = useState(false);

  const champ = useMemo(
    () => champs.find((c: any) => c.id === champId) || champs[0] || null,
    [champs, champId],
  );
  const effectiveChampId = champ?.id as string | undefined;

  const { data: registrations = [], isLoading: regsLoading } = useQuery({
    queryKey: ["champ-registrations", effectiveChampId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_registrations")
        .select("id, club_member_id, status, member:club_member_id(id, name, profiles:user_id(name))")
        .eq("champ_id", effectiveChampId)
        .order("created_at");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!effectiveChampId && open,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["champ-entries", effectiveChampId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_entries")
        .select("club_member_id, group_number, partner_member_id")
        .eq("champ_id", effectiveChampId);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!effectiveChampId && open,
  });

  const memberLeagues = (id: string): number[] =>
    Array.from(
      new Set(
        entries
          .filter((e: any) => e.club_member_id === id || e.partner_member_id === id)
          .map((e: any) => Number(e.group_number) || 1),
      ),
    ).sort((a, b) => a - b);

  const leagueLabel = (gn: number) =>
    String((champ as any)?.group_labels?.[String(gn)] || "").trim() || `League ${gn}`;

  const activeRegs = registrations.filter((r: any) => r.status !== "cancelled");
  const nameOf = (r: any) => r?.member?.name || r?.member?.profiles?.name || "Unknown";
  const reg = activeRegs.find((r: any) => r.club_member_id === memberId) || null;
  const leagues = memberId ? memberLeagues(memberId) : [];

  const withdraw = useMutation({
    mutationFn: async ({ reg, groupNumber }: { reg: any; groupNumber: number | null }) => {
      const mid = reg.club_member_id as string;
      const { data: matches, error: mErr } = await fromExt("club_champs_matches")
        .select(
          "id, status, is_bye, group_number, booking_id, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id",
        )
        .eq("champ_id", effectiveChampId);
      if (mErr) throw mErr;
      const updates = withdrawalUpdates((matches || []) as any[], mid, {
        bestOf: Number(champ?.best_of) || 3,
        pointsPerGame: Number(champ?.points_per_game) || 11,
        groupNumber,
      });
      for (const u of updates) {
        const { error } = await fromExt("club_champs_matches").update(u.payload).eq("id", u.id);
        if (error) throw error;
      }
      // Free every court that was held for a game that will never be played.
      const bookingIds = updates.map((u) => u.bookingId).filter(Boolean) as string[];
      if (bookingIds.length > 0) {
        await fromExt("bookings").update({ status: "cancelled" }).in("id", bookingIds);
      }
      let del = fromExt("club_champs_entries")
        .delete()
        .eq("champ_id", effectiveChampId)
        .eq("club_member_id", mid);
      if (groupNumber != null) del = del.eq("group_number", groupNumber);
      const { error: eErr } = await del;
      if (eErr) throw eErr;

      // Only cancel the whole entry once no league is left.
      const remaining = groupNumber == null ? 0 : memberLeagues(mid).filter((g) => g !== groupNumber).length;
      if (remaining === 0) {
        const { error } = await fromExt("club_champs_registrations")
          .update({ status: "cancelled" })
          .eq("id", reg.id);
        if (error) throw error;
        await purgeFromSetup(effectiveChampId!, mid);
      }
      return { closed: updates.length, remaining };
    },

    onSuccess: ({ closed, remaining }) => {
      toast.success(
        closed > 0
          ? `Player pulled out — ${closed} outstanding game${closed === 1 ? "" : "s"} awarded to their opponent${closed === 1 ? "" : "s"}.${remaining > 0 ? " Their other leagues are unchanged." : ""}`
          : remaining > 0
            ? "Player pulled out of that league. Their other leagues are unchanged."
            : "Player pulled out of the tournament.",
      );
      setConfirming(false);
      setMemberId("");
      setGroupChoice("all");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["champ-entries", effectiveChampId] });
      qc.invalidateQueries({ queryKey: ["champ-registrations", effectiveChampId] });
      qc.invalidateQueries({ queryKey: ["club-champ-matches", effectiveChampId] });
      qc.invalidateQueries({ queryKey: ["tournaments-all-matches"] });
    },
    onError: (e: any) => toast.error(e.message || "Could not pull the player out"),
  });

  if (champs.length === 0) return null;

  const chosenGroup = groupChoice === "all" ? null : Number(groupChoice);
  const chosenLabel =
    chosenGroup == null ? "the whole tournament" : leagueLabel(chosenGroup);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1 h-7"
        onClick={() => setOpen(true)}
        title="Remove a player from a league of this tournament — their unplayed games become walkovers (admin only)"
      >
        <UserMinus className="w-3.5 h-3.5" /> Pull a player out
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pull a player out</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {champs.length > 1 && (
              <div className="space-y-1">
                <p className="text-xs font-medium">Tournament</p>
                <Select
                  value={effectiveChampId}
                  onValueChange={(v) => {
                    setChampId(v);
                    setMemberId("");
                    setGroupChoice("all");
                  }}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {champs.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs font-medium">Player</p>
              <Select
                value={memberId}
                onValueChange={(v) => {
                  setMemberId(v);
                  setGroupChoice("all");
                }}
                disabled={regsLoading}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={regsLoading ? "Loading players…" : "Pick a player"} />
                </SelectTrigger>
                <SelectContent>
                  {activeRegs.map((r: any) => (
                    <SelectItem key={r.club_member_id} value={r.club_member_id}>
                      {nameOf(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {memberId && (
              <div className="space-y-1">
                <p className="text-xs font-medium">Pull out of</p>
                <Select value={groupChoice} onValueChange={setGroupChoice}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {leagues.map((gn) => (
                      <SelectItem key={gn} value={String(gn)}>
                        {leagueLabel(gn)} only
                      </SelectItem>
                    ))}
                    <SelectItem value="all">Whole tournament (all leagues)</SelectItem>
                  </SelectContent>
                </Select>
                {leagues.length > 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    This player is in {leagues.length} leagues:{" "}
                    {leagues.map((gn) => leagueLabel(gn)).join(", ")}. Their other leagues stay
                    untouched unless you choose the whole tournament.
                  </p>
                )}
              </div>
            )}

            {memberId && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                Every game of theirs still to be played in {chosenLabel} becomes a walkover win for
                the opponent, who stays in the draw. Games already played keep their real result.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!reg || withdraw.isPending}
                onClick={() => setConfirming(true)}
              >
                {withdraw.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5 mr-1" />}
                Pull out
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pull {reg ? nameOf(reg) : "this player"} out of {chosenLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their unplayed games there are awarded to their opponents as walkovers. This cannot be
              undone from here.
              {reg && leagues.length > 1 && chosenGroup != null && (
                <> Their other league{leagues.length > 2 ? "s" : ""} ({leagues.filter((g) => g !== chosenGroup).map((gn) => leagueLabel(gn)).join(", ")}) stay{leagues.length > 2 ? "" : "s"} exactly as {leagues.length > 2 ? "they are" : "it is"}.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them in</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reg && withdraw.mutate({ reg, groupNumber: chosenGroup })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, pull them out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

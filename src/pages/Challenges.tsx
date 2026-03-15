import { useMemo, useState } from "react";
import { format, parseISO, differenceInHours } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Check, Clock, Loader2, Swords, Trophy, X, CalendarDays,
  ArrowRightLeft, Ban, BarChart3
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useMyClub } from "@/hooks/use-club";
import {
  ChallengeWithProfiles, useChallenges, useUpdateChallengeStatus,
  useSquashTotals, useHeadToHead
} from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
  pending: { color: "bg-accent/20 text-accent-foreground", icon: Clock, label: "Pending" },
  accepted: { color: "bg-primary/15 text-primary", icon: Check, label: "Accepted" },
  declined: { color: "bg-destructive/15 text-destructive", icon: X, label: "Declined" },
  completed: { color: "bg-muted text-muted-foreground", icon: Trophy, label: "Completed" },
};

/** Can this challenge still be cancelled? (up to 1 hour before) */
function canCancel(c: ChallengeWithProfiles): boolean {
  if (c.status !== "pending" && c.status !== "accepted") return false;
  const matchDate = (c as any).counter_date || c.proposed_date;
  const matchTime = (c as any).counter_time || (c as any).proposed_time;
  if (!matchDate || !matchTime) return true; // no date set yet, can always cancel
  try {
    const matchDateTime = parseISO(`${matchDate}T${matchTime}`);
    return differenceInHours(matchDateTime, new Date()) >= 1;
  } catch {
    return true;
  }
}

/** Does this accepted challenge need a result entered? (match date is in the past) */
function needsResult(c: ChallengeWithProfiles): boolean {
  if (c.status !== "accepted") return false;
  const matchDate = (c as any).counter_date || c.proposed_date;
  if (!matchDate) return false;
  try {
    return parseISO(matchDate) < new Date();
  } catch {
    return false;
  }
}

// ---------- Opponent Stats Panel ----------
function OpponentStatsPanel({ userId, myUserId }: { userId: string; myUserId: string }) {
  const { data: stats, isLoading } = useSquashTotals(userId);
  const { data: h2h } = useHeadToHead(myUserId, 20);

  const h2hRecord = useMemo(() => {
    if (!h2h) return null;
    return h2h.find((r) => r.opponent_id === userId) || null;
  }, [h2h, userId]);

  if (isLoading) return <div className="text-xs text-muted-foreground py-2">Loading stats…</div>;
  if (!stats) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <BarChart3 className="w-3 h-3" /> Opponent Stats
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-foreground">{stats.wins}</p>
          <p className="text-[10px] text-muted-foreground">Wins</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{stats.losses}</p>
          <p className="text-[10px] text-muted-foreground">Losses</p>
        </div>
        <div>
          <p className="text-lg font-bold text-primary">{stats.win_rate}%</p>
          <p className="text-[10px] text-muted-foreground">Win Rate</p>
        </div>
      </div>
      {stats.current_streak && (
        <p className="text-[11px] text-muted-foreground">Streak: {stats.current_streak}</p>
      )}
      {h2hRecord && (
        <div className="pt-1 border-t">
          <p className="text-[11px] font-medium">
            Head-to-head: <span className="text-primary">{h2hRecord.wins}W</span>–<span className="text-destructive">{h2hRecord.losses}L</span>
            {" "}in {h2hRecord.matches} match{h2hRecord.matches !== 1 ? "es" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Challenges() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: challenges, isLoading } = useChallenges();
  const updateChallenge = useUpdateChallengeStatus();
  const { data: clubData } = useMyClub();
  const { activeMember } = useMemberContext();
  const clubId = clubData?.club?.id;

  // Courts for counter-proposals
  const [courts, setCourts] = useState<{ id: number; name: string }[]>([]);
  useMemo(() => {
    if (!clubId) return;
    supabase.from("courts").select("id, name").eq("club_id", clubId).then(({ data }) => {
      setCourts(data || []);
    });
  }, [clubId]);

  // Counter-propose dialog
  const [counterDialog, setCounterDialog] = useState<{
    open: boolean;
    challenge: ChallengeWithProfiles | null;
  }>({ open: false, challenge: null });
  const [counterDate, setCounterDate] = useState("");
  const [counterTime, setCounterTime] = useState("18:00");
  const [counterCourtId, setCounterCourtId] = useState("");

  // Stats dialog
  const [statsDialog, setStatsDialog] = useState<{
    open: boolean;
    opponentId: string;
    opponentName: string;
  }>({ open: false, opponentId: "", opponentName: "" });

  const { incoming, outgoing, past } = useMemo(() => {
    if (!user || !challenges) return { incoming: [], outgoing: [], past: [] };
    const active = challenges.filter((c) => c.status === "pending" || c.status === "accepted");
    const done = challenges.filter((c) => c.status === "declined" || c.status === "completed");
    return {
      incoming: active.filter((c) => c.opponent_id === user.id),
      outgoing: active.filter((c) => c.challenger_id === user.id),
      past: done.slice(0, 20),
    };
  }, [challenges, user]);

  const handleAccept = async (c: ChallengeWithProfiles) => {
    try {
      await updateChallenge.mutateAsync({ challengeId: c.id, status: "accepted" });

      // Auto-create court booking
      const matchDate = c.proposed_date;
      const matchTime = (c as any).proposed_time;
      const courtId = (c as any).court_id;
      if (matchDate && matchTime && courtId && user) {
        const endTimeStr = matchTime.replace(/^(\d{2}):(\d{2})/, (_: any, h: string, m: string) => {
          const endH = (parseInt(h) + 1) % 24;
          return `${String(endH).padStart(2, "0")}:${m}`;
        });
        try {
          await supabase.from("bookings").insert({
            user_id: c.challenger_id,
            opponent_id: c.opponent_id,
            court_id: courtId,
            date: matchDate,
            start_time: matchTime.length === 5 ? matchTime + ":00" : matchTime,
            end_time: endTimeStr.length === 5 ? endTimeStr + ":00" : endTimeStr,
            challenge_id: c.id,
            club_member_id: (c as any).challenger_member_id || null,
            opponent_member_id: (c as any).opponent_member_id || null,
          } as any);
        } catch {
          // non-critical
        }
      }

      // Notify challenger
      try {
        await fromExt("notifications").insert({
          user_id: c.challenger_id,
          title: "Challenge Accepted!",
          message: `${c.opponent_name} has accepted your challenge${matchDate ? ` on ${matchDate}` : ""}.`,
          type: "challenge",
          url: "/challenges",
        });
      } catch { /* non-critical */ }

      toast.success("Challenge accepted! Court booking created.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to accept");
    }
  };

  const handleDecline = async (c: ChallengeWithProfiles) => {
    if (!canCancel(c)) {
      toast.error("Cannot cancel less than 1 hour before the match.");
      return;
    }
    try {
      await updateChallenge.mutateAsync({ challengeId: c.id, status: "declined" });

      // Notify the other party
      const otherUserId = c.challenger_id === user?.id ? c.opponent_id : c.challenger_id;
      const otherName = c.challenger_id === user?.id ? c.opponent_name : c.challenger_name;
      try {
        await fromExt("notifications").insert({
          user_id: otherUserId,
          title: "Challenge Cancelled",
          message: `The challenge has been cancelled.`,
          type: "challenge",
          url: "/challenges",
        });
      } catch { /* non-critical */ }

      toast.success("Challenge cancelled");
    } catch (e: any) {
      toast.error(e?.message || "Failed to cancel");
    }
  };

  const handleCounterPropose = async () => {
    if (!counterDialog.challenge || !counterDate || !counterTime) return;
    try {
      const patch: Record<string, any> = {
        counter_date: counterDate,
        counter_time: counterTime,
      };
      if (counterCourtId) patch.court_id = Number(counterCourtId);

      const { error } = await fromExt("challenges")
        .update(patch)
        .eq("id", counterDialog.challenge.id);
      if (error) throw error;

      // Notify challenger about counter-proposal
      try {
        await fromExt("notifications").insert({
          user_id: counterDialog.challenge.challenger_id,
          title: "Counter-Proposal Received",
          message: `${counterDialog.challenge.opponent_name} suggests ${counterDate} at ${counterTime.slice(0, 5)}.`,
          type: "challenge",
          url: "/challenges",
        });
      } catch { /* non-critical */ }

      toast.success("Counter-proposal sent!");
      setCounterDialog({ open: false, challenge: null });
    } catch (e: any) {
      toast.error(e?.message || "Failed to counter-propose");
    }
  };

  const handleAcceptCounter = async (c: ChallengeWithProfiles) => {
    try {
      const finalDate = (c as any).counter_date;
      const finalTime = (c as any).counter_time;
      const courtId = (c as any).court_id;

      // Accept the challenge with counter terms
      const { error } = await fromExt("challenges")
        .update({
          status: "accepted",
          proposed_date: finalDate,
          proposed_time: finalTime,
          confirmed_by: user!.id,
        })
        .eq("id", c.id);
      if (error) throw error;

      // Auto-create court booking
      if (finalDate && finalTime && courtId && user) {
        const endTimeStr = finalTime.replace(/^(\d{2}):(\d{2})/, (_: any, h: string, m: string) => {
          const endH = (parseInt(h) + 1) % 24;
          return `${String(endH).padStart(2, "0")}:${m}`;
        });
        try {
          await supabase.from("bookings").insert({
            user_id: c.challenger_id,
            opponent_id: c.opponent_id,
            court_id: courtId,
            date: finalDate,
            start_time: finalTime.length === 5 ? finalTime + ":00" : finalTime,
            end_time: endTimeStr.length === 5 ? endTimeStr + ":00" : endTimeStr,
            challenge_id: c.id,
            club_member_id: (c as any).challenger_member_id || null,
            opponent_member_id: (c as any).opponent_member_id || null,
          } as any);
        } catch { /* non-critical */ }
      }

      // Notify opponent
      try {
        await fromExt("notifications").insert({
          user_id: c.opponent_id,
          title: "Counter-Proposal Accepted",
          message: `Your counter-proposal for ${finalDate} at ${finalTime?.slice(0, 5)} has been accepted. Court booked!`,
          type: "challenge",
          url: "/challenges",
        });
      } catch { /* non-critical */ }

      toast.success("Counter accepted & court booked!");
    } catch (e: any) {
      toast.error(e?.message || "Failed to accept counter");
    }
  };

  const handleEnterResult = (c: ChallengeWithProfiles) => {
    navigate(`/add-result?challengeId=${c.id}&opponentId=${c.challenger_id === user?.id ? c.opponent_id : c.challenger_id}`);
  };

  const renderChallengeCard = (c: ChallengeWithProfiles, type: "incoming" | "outgoing" | "past") => {
    const isIncoming = type === "incoming";
    const opponentName = isIncoming ? c.challenger_name : c.opponent_name;
    const opponentId = isIncoming ? c.challenger_id : c.opponent_id;
    const cfg = statusConfig[c.status] || statusConfig.pending;
    const StatusIcon = cfg.icon;
    const hasCounter = !!(c as any).counter_date;
    const showResult = needsResult(c);
    const isCancellable = canCancel(c);
    const isChallenger = c.challenger_id === user?.id;

    // For outgoing with counter: challenger needs to accept or decline counter
    const needsCounterResponse = type === "outgoing" && c.status === "pending" && hasCounter;

    return (
      <Card key={c.id} className="p-3">
        <div className="flex items-start gap-3">
          <PlayerAvatar initials={initials(opponentName)} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{opponentName}</p>
              <Badge className={`text-[10px] ${cfg.color}`}>
                <StatusIcon className="w-3 h-3 mr-0.5" />
                {cfg.label}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
              {c.proposed_date && (
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {c.proposed_date} {(c as any).proposed_time && `at ${(c as any).proposed_time?.slice(0, 5)}`}
                </span>
              )}
              {hasCounter && (
                <span className="flex items-center gap-1 text-primary">
                  <ArrowRightLeft className="w-3 h-3" />
                  Counter: {(c as any).counter_date} at {(c as any).counter_time?.slice(0, 5)}
                </span>
              )}
              <span>{format(new Date(c.created_at), "d MMM yyyy")}</span>
            </div>
          </div>

          {/* View stats button */}
          {type !== "past" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] shrink-0"
              onClick={() => setStatsDialog({ open: true, opponentId, opponentName })}
            >
              <BarChart3 className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Incoming pending: Accept / Counter / Decline */}
        {type === "incoming" && c.status === "pending" && !hasCounter && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1 h-8 text-xs" disabled={updateChallenge.isPending} onClick={() => handleAccept(c)}>
              <Check className="w-3.5 h-3.5 mr-1" /> Accept
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
              setCounterDate((c as any).proposed_date || "");
              setCounterTime((c as any).proposed_time?.slice(0, 5) || "18:00");
              setCounterCourtId(String((c as any).court_id || ""));
              setCounterDialog({ open: true, challenge: c });
            }}>
              <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> Counter
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" disabled={updateChallenge.isPending} onClick={() => handleDecline(c)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Outgoing with counter-proposal: Challenger accepts or declines counter */}
        {needsCounterResponse && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => handleAcceptCounter(c)}>
              <Check className="w-3.5 h-3.5 mr-1" /> Accept Counter & Book
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => handleDecline(c)}>
              Withdraw
            </Button>
          </div>
        )}

        {/* Outgoing pending without counter: can withdraw */}
        {type === "outgoing" && c.status === "pending" && !hasCounter && isCancellable && (
          <div className="mt-3">
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" disabled={updateChallenge.isPending} onClick={() => handleDecline(c)}>
              <X className="w-3.5 h-3.5 mr-1" /> Withdraw
            </Button>
          </div>
        )}

        {/* Accepted: show cancel (if >1hr before) or enter result (if date passed) */}
        {c.status === "accepted" && (
          <div className="mt-3 flex gap-2">
            {showResult && isChallenger && (
              <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => handleEnterResult(c)}>
                <Trophy className="w-3.5 h-3.5 mr-1" /> Enter Result
              </Button>
            )}
            {showResult && !isChallenger && (
              <p className="text-[11px] text-muted-foreground italic flex-1">
                Waiting for {c.challenger_name} to enter the result…
              </p>
            )}
            {isCancellable && (
              <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => handleDecline(c)}>
                <Ban className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
            )}
            {!isCancellable && !showResult && (
              <p className="text-[11px] text-muted-foreground italic">
                Match is less than 1 hour away — cancellation closed.
              </p>
            )}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="bottom-nav-safe">
      <SEO title="Challenges" path="/challenges" noIndex />
      <PageHeader title="Challenges" subtitle="Manage your ladder challenges" />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="px-4 mt-3 mb-4 space-y-5">
          {incoming.length > 0 && (
            <div>
              <p className="text-xs font-heading font-bold uppercase tracking-wide text-foreground mb-2">
                Incoming <Badge variant="secondary" className="ml-1 text-[10px]">{incoming.length}</Badge>
              </p>
              <div className="space-y-2">
                {incoming.map((c) => renderChallengeCard(c, "incoming"))}
              </div>
            </div>
          )}

          {outgoing.length > 0 && (
            <div>
              <p className="text-xs font-heading font-bold uppercase tracking-wide text-foreground mb-2">
                Outgoing <Badge variant="secondary" className="ml-1 text-[10px]">{outgoing.length}</Badge>
              </p>
              <div className="space-y-2">
                {outgoing.map((c) => renderChallengeCard(c, "outgoing"))}
              </div>
            </div>
          )}

          {incoming.length === 0 && outgoing.length === 0 && (
            <Card className="p-6 text-center">
              <Swords className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No active challenges</p>
              <p className="text-xs text-muted-foreground mt-1">Go to the ladder and challenge a player above you!</p>
              <Button size="sm" className="mt-3" onClick={() => navigate("/ladder")}>
                View Ladder
              </Button>
            </Card>
          )}

          {past.length > 0 && (
            <div>
              <p className="text-xs font-heading font-bold uppercase tracking-wide text-muted-foreground mb-2">
                History
              </p>
              <div className="space-y-2">
                {past.map((c) => renderChallengeCard(c, "past"))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Counter-propose dialog */}
      <Dialog open={counterDialog.open} onOpenChange={(open) => setCounterDialog((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Propose Alternative</DialogTitle>
            <DialogDescription>
              Suggest a different date, time, or court. The challenger will need to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={counterDate} onChange={(e) => setCounterDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Time</Label>
              <Input type="time" value={counterTime} onChange={(e) => setCounterTime(e.target.value)} className="mt-1" />
            </div>
            {courts.length > 0 && (
              <div>
                <Label className="text-xs">Court</Label>
                <Select value={counterCourtId} onValueChange={setCounterCourtId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select court" /></SelectTrigger>
                  <SelectContent>
                    {courts.map((ct) => (
                      <SelectItem key={ct.id} value={String(ct.id)}>{ct.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCounterDialog({ open: false, challenge: null })}>Cancel</Button>
            <Button onClick={handleCounterPropose} disabled={!counterDate || !counterTime}>
              Send Counter-Proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Opponent stats dialog */}
      <Dialog open={statsDialog.open} onOpenChange={(open) => setStatsDialog((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{statsDialog.opponentName} — Stats</DialogTitle>
          </DialogHeader>
          {statsDialog.open && user && (
            <OpponentStatsPanel userId={statsDialog.opponentId} myUserId={user.id} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatsDialog((s) => ({ ...s, open: false }))}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

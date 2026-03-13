import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Check, Clock, Loader2, Swords, Trophy, X, CalendarDays, ArrowRightLeft } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { ChallengeWithProfiles, useChallenges, useUpdateChallengeStatus } from "@/hooks/use-data";
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

export default function Challenges() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: challenges, isLoading } = useChallenges();
  const updateChallenge = useUpdateChallengeStatus();

  // Counter-propose dialog
  const [counterDialog, setCounterDialog] = useState<{
    open: boolean;
    challenge: ChallengeWithProfiles | null;
  }>({ open: false, challenge: null });
  const [counterDate, setCounterDate] = useState("");
  const [counterTime, setCounterTime] = useState("18:00");

  // Confirm dialog for challenger
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    challenge: ChallengeWithProfiles | null;
  }>({ open: false, challenge: null });

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
      toast.success("Challenge accepted! Waiting for confirmation.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to accept");
    }
  };

  const handleDecline = async (c: ChallengeWithProfiles) => {
    try {
      await updateChallenge.mutateAsync({ challengeId: c.id, status: "declined" });
      toast.success("Challenge declined");
    } catch (e: any) {
      toast.error(e?.message || "Failed to decline");
    }
  };

  const handleCounterPropose = async () => {
    if (!counterDialog.challenge || !counterDate || !counterTime) return;
    try {
      // Accept but set counter date/time
      const { error } = await fromExt("challenges")
        .update({
          status: "accepted",
          counter_date: counterDate,
          counter_time: counterTime,
        } as any)
        .eq("id", counterDialog.challenge.id);
      if (error) throw error;
      toast.success("Counter-proposal sent! Waiting for challenger to confirm.");
      setCounterDialog({ open: false, challenge: null });
      // Refresh
      updateChallenge.reset();
    } catch (e: any) {
      toast.error(e?.message || "Failed to counter-propose");
    }
  };

  const handleConfirmChallenge = async (c: ChallengeWithProfiles) => {
    try {
      // Use the counter date if available, otherwise original proposed date
      const finalDate = (c as any).counter_date || c.proposed_date;
      const finalTime = (c as any).counter_time || (c as any).proposed_time;

      const { error } = await fromExt("challenges")
        .update({
          confirmed_by: user!.id,
          proposed_date: finalDate,
          proposed_time: finalTime,
        } as any)
        .eq("id", c.id);
      if (error) throw error;
      toast.success("Challenge confirmed! Booking will be created.");
      setConfirmDialog({ open: false, challenge: null });
    } catch (e: any) {
      toast.error(e?.message || "Failed to confirm");
    }
  };

  const renderChallengeCard = (c: ChallengeWithProfiles, type: "incoming" | "outgoing" | "past") => {
    const isIncoming = type === "incoming";
    const opponentName = isIncoming ? c.challenger_name : c.opponent_name;
    const cfg = statusConfig[c.status] || statusConfig.pending;
    const StatusIcon = cfg.icon;
    const hasCounter = !!(c as any).counter_date;
    const needsConfirm = type === "outgoing" && c.status === "accepted" && !(c as any).confirmed_by;

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
        </div>

        {/* Actions */}
        {type === "incoming" && c.status === "pending" && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1 h-8 text-xs" disabled={updateChallenge.isPending} onClick={() => handleAccept(c)}>
              <Check className="w-3.5 h-3.5 mr-1" /> Accept
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
              setCounterDate((c as any).proposed_date || "");
              setCounterTime((c as any).proposed_time?.slice(0, 5) || "18:00");
              setCounterDialog({ open: true, challenge: c });
            }}>
              <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> Counter
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" disabled={updateChallenge.isPending} onClick={() => handleDecline(c)}>
              <X className="w-3.5 h-3.5 mr-1" /> Decline
            </Button>
          </div>
        )}

        {needsConfirm && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => {
              setConfirmDialog({ open: true, challenge: c });
            }}>
              <Check className="w-3.5 h-3.5 mr-1" />
              {hasCounter ? "Accept Counter & Confirm" : "Confirm Booking"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" disabled={updateChallenge.isPending} onClick={() => handleDecline(c)}>
              Withdraw
            </Button>
          </div>
        )}

        {type === "outgoing" && c.status === "pending" && (
          <div className="mt-3">
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" disabled={updateChallenge.isPending} onClick={() => handleDecline(c)}>
              <X className="w-3.5 h-3.5 mr-1" /> Withdraw
            </Button>
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
          {/* Incoming */}
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

          {/* Outgoing */}
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

          {/* Past */}
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
              Suggest a different date and time. The challenger will need to confirm.
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCounterDialog({ open: false, challenge: null })}>Cancel</Button>
            <Button onClick={handleCounterPropose} disabled={!counterDate || !counterTime}>
              Send Counter-Proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Challenge</DialogTitle>
            <DialogDescription>
              {confirmDialog.challenge && (c => {
                const hasCounter = !!(c as any).counter_date;
                const finalDate = hasCounter ? (c as any).counter_date : c.proposed_date;
                const finalTime = hasCounter ? (c as any).counter_time?.slice(0, 5) : (c as any).proposed_time?.slice(0, 5);
                return `Confirm the match on ${finalDate} at ${finalTime}? A court booking will be created automatically.`;
              })(confirmDialog.challenge)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, challenge: null })}>Cancel</Button>
            <Button onClick={() => confirmDialog.challenge && handleConfirmChallenge(confirmDialog.challenge)}>
              <Check className="w-4 h-4 mr-2" />
              Confirm & Book
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

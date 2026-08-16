import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fromExt } from "@/lib/supabase-ext";

interface Props {
  champId: string;
  matchId: string;
  currentScore?: string | null;
  /** Optional trigger label override. */
  label?: string;
}

/**
 * Phase 3b — result-correction workflow.
 * A player (or anyone who can view the tournament) proposes a corrected score
 * with a reason; a tournament manager approves or rejects it.
 */
export function RequestCorrectionDialog({ champId, matchId, currentScore, label = "Request correction" }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [proposedScore, setProposedScore] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("Please give a reason for the correction");
      const { error } = await fromExt("match_correction_requests").insert({
        tournament_id: champId,
        match_id: matchId,
        reason: reason.trim(),
        proposed_score: proposedScore.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Correction request sent to the tournament admin");
      setOpen(false);
      setReason("");
      setProposedScore("");
    },
    onError: (e: any) => toast.error(e.message || "Could not send the request"),
  });

  return (
    <>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setOpen(true)}>
        <AlertCircle className="w-3 h-3 mr-1" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request a result correction</DialogTitle>
            <DialogDescription>
              {currentScore ? `Current result: ${currentScore}. ` : ""}
              A tournament admin will review and confirm the change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="corr-score">Correct score (optional)</Label>
              <Input id="corr-score" value={proposedScore} onChange={(e) => setProposedScore(e.target.value)} placeholder="e.g. 3-1" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="corr-reason">What is wrong?</Label>
              <Textarea id="corr-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Explain the error…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default RequestCorrectionDialog;

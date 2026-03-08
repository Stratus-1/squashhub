import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface MatchDisputeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
}

export function MatchDisputeDialog({ open, onOpenChange, matchId }: MatchDisputeDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !reason.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).from("match_disputes").insert({
        match_id: matchId,
        raised_by: user.id,
        reason: reason.trim(),
      });
      if (error) throw error;

      // Also flag the match as disputed
      await supabase.from("matches").update({ disputed: true }).eq("id", matchId);

      toast.success("Dispute submitted. An admin will review it.");
      queryClient.invalidateQueries({ queryKey: ["match-disputes", matchId] });
      setReason("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit dispute");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Dispute Match Result
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            If you disagree with the recorded score, describe what happened below.
            An admin will review and resolve the dispute.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">What happened?</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. The score was recorded incorrectly — I won 3-1 not 3-2"
              rows={3}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={submitting || !reason.trim()}
            onClick={handleSubmit}
          >
            {submitting ? "Submitting..." : "Submit Dispute"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

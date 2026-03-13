import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SEO } from "@/components/SEO";

const declineReasons = [
  "I'm not available at that time",
  "I have another commitment",
  "I'm injured / not feeling well",
  "I'd prefer a different court or time",
  "Other",
];

export default function BookingResponse() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const action = params.get("action") || "";

  const [status, setStatus] = useState<"loading" | "decline-form" | "done" | "error">("loading");
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Invalid invite link — no token found.");
      return;
    }

    if (action === "accept") {
      respondToInvite("accepted");
    } else if (action === "decline") {
      setStatus("decline-form");
    } else {
      setStatus("error");
      setErrorMsg("Invalid action.");
    }
  }, [token, action]);

  async function respondToInvite(newStatus: "accepted" | "declined", reason?: string) {
    try {
      setSubmitting(true);
      const { error } = await (supabase.rpc as any)("respond_to_booking_invite", {
        invite_token: token,
        new_status: newStatus,
        reason: reason || null,
      });
      if (error) throw error;
      setResult(newStatus);
      setStatus("done");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Something went wrong. The invite may have already been responded to.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDeclineSubmit() {
    const reason = selectedReason === "Other" ? customReason.trim() : selectedReason;
    if (!reason) return;
    respondToInvite("declined", reason);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <SEO
        title="Booking Response"
        description="Respond to a squash court booking invitation."
        path="/booking-response"
        noIndex
      />

      <Card className="w-full max-w-md p-6 space-y-6">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Processing your response...</p>
          </div>
        )}

        {status === "done" && result === "accepted" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-heading font-bold">You're in! 🏸</h2>
            <p className="text-sm text-muted-foreground">
              Your booking has been confirmed. See you on the court!
            </p>
            <Button asChild className="mt-4">
              <a href="/">Go to SquashHub</a>
            </Button>
          </div>
        )}

        {status === "done" && result === "declined" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-heading font-bold">Invitation Declined</h2>
            <p className="text-sm text-muted-foreground">
              Thanks for letting us know. We've notified the organiser.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <a href="/">Go to SquashHub</a>
            </Button>
          </div>
        )}

        {status === "decline-form" && (
          <div className="space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-heading font-bold">Decline Invitation</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Please let us know why you can't make it
              </p>
            </div>

            <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
              {declineReasons.map((reason) => (
                <div key={reason} className="flex items-center space-x-3 rounded-md border p-3">
                  <RadioGroupItem value={reason} id={reason} />
                  <Label htmlFor={reason} className="flex-1 cursor-pointer text-sm">
                    {reason}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {selectedReason === "Other" && (
              <div className="space-y-2">
                <Label className="text-xs">Please specify</Label>
                <Textarea
                  placeholder="Tell us why you can't make it..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  rows={3}
                />
              </div>
            )}

            <Button
              className="w-full"
              variant="destructive"
              disabled={!selectedReason || (selectedReason === "Other" && !customReason.trim()) || submitting}
              onClick={handleDeclineSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                "Submit & Decline"
              )}
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-heading font-bold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button asChild variant="outline" className="mt-4">
              <a href="/">Go to GB Squash Hub</a>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

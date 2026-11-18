import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Users, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";

/**
 * One-tap approval page for a family package request, opened from the
 * officials' email or the admin's in-app notice. Reading goes through the
 * approver-only `family_request_review_context`; deciding goes through the
 * unchanged `family_review_addition` writer, so approval rights never widen.
 */
type Ctx = {
  state: "signed_out" | "not_found" | "forbidden" | "pending" | "approved" | "declined" | "closed";
  club_name?: string;
  primary_name?: string;
  member_name?: string;
  member_email?: string | null;
  member_phone?: string | null;
  member_number?: string | null;
  relationship?: string | null;
  is_new_member?: boolean;
  accepted?: boolean;
  requested_at?: string;
  decided_at?: string | null;
};

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" }) : "";

export default function FamilyRequestReview() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.rpc("family_request_review_context", { _family_member_id: id });
    setCtx(error ? { state: "not_found" } : (data as unknown as Ctx));
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const decide = async (approve: boolean) => {
    setBusy(approve ? "approve" : "decline");
    setError(null);
    const { error } = await supabase.rpc("family_review_addition", { _family_member_id: id, _approve: approve });
    setBusy(null);
    setConfirmDecline(false);
    if (error) { setError(error.message); await load(); return; }
    qc.invalidateQueries({ queryKey: ["club-families"] });
    qc.invalidateQueries({ queryKey: ["club-members"] });
    await load();
  };

  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rel = ctx.relationship ? ctx.relationship.toLowerCase() : null;

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <Card className="max-w-md mx-auto p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <div>
            <h1 className="font-semibold text-base">Family package request</h1>
            {ctx.club_name && <p className="text-xs text-muted-foreground">{ctx.club_name}</p>}
          </div>
        </div>

        {ctx.state === "not_found" && (
          <p className="text-sm text-muted-foreground">This request could not be found. It may have been removed.</p>
        )}

        {ctx.state === "forbidden" && (
          <div className="flex gap-2 text-sm">
            <ShieldAlert className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
            <p>
              Only club admins and people with members access can approve family requests. Please ask one of them, or
              check that you are signed in with your club account.
            </p>
          </div>
        )}

        {ctx.member_name && (
          <div className="rounded-md border border-border p-3 space-y-1 text-sm">
            <p>
              <span className="font-medium">{ctx.primary_name || "A member"}</span> wants to add{" "}
              <span className="font-medium">{ctx.member_name}</span>
              {rel ? ` (${rel})` : ""} to their family package.
            </p>
            <p className="text-xs text-muted-foreground">
              {ctx.is_new_member ? "New to the club." : "Already a club member."}{" "}
              {ctx.is_new_member ? "" : ctx.accepted ? `${ctx.member_name} has accepted.` : `${ctx.member_name} still needs to accept in their own account.`}
            </p>
            {(ctx.member_number || ctx.member_email || ctx.member_phone) && (
              <p className="text-xs text-muted-foreground">
                {[ctx.member_number && `#${ctx.member_number}`, ctx.member_email, ctx.member_phone].filter(Boolean).join(" · ")}
              </p>
            )}
            {ctx.requested_at && <p className="text-xs text-muted-foreground">Requested {fmt(ctx.requested_at)}</p>}
          </div>
        )}

        {ctx.state === "pending" && (
          <div className="space-y-2">
            {!confirmDecline ? (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => decide(true)} disabled={!!busy}>
                  {busy === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Approve
                </Button>
                <Button variant="outline" onClick={() => setConfirmDecline(true)} disabled={!!busy}>
                  <XCircle className="w-4 h-4" />
                  Decline
                </Button>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                <p className="text-sm">Decline this request? {ctx.member_name} will not be added to the family package.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="destructive" onClick={() => decide(false)} disabled={!!busy}>
                    {busy === "decline" && <Loader2 className="w-4 h-4 animate-spin" />}
                    Yes, decline
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmDecline(false)} disabled={!!busy}>Back</Button>
                </div>
              </div>
            )}
            {!ctx.is_new_member && !ctx.accepted && (
              <p className="text-xs text-muted-foreground">
                If you approve now, it becomes active as soon as {ctx.member_name} accepts.
              </p>
            )}
          </div>
        )}

        {ctx.state === "approved" && (
          <p className="flex items-center gap-2 text-sm text-primary">
            <CheckCircle2 className="w-4 h-4" /> Approved{ctx.decided_at ? ` on ${fmt(ctx.decided_at)}` : ""}.
          </p>
        )}
        {ctx.state === "declined" && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="w-4 h-4" /> Declined{ctx.decided_at ? ` on ${fmt(ctx.decided_at)}` : ""}.
          </p>
        )}
        {ctx.state === "closed" && (
          <p className="text-sm text-muted-foreground">This request is no longer waiting for approval.</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-between text-xs">
          <Link to="/" className="text-muted-foreground underline">Back to dashboard</Link>
          {(ctx.state !== "forbidden" && ctx.state !== "not_found") && (
            <Link to="/club-admin?tab=fees" className="text-muted-foreground underline">All family packages</Link>
          )}
        </div>
      </Card>
    </div>
  );
}

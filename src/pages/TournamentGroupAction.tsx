/**
 * /t/:champId/enter and /t/:champId/withdraw
 *
 * The two links that live in the tournament WhatsApp group description.
 *
 * Someone in the group taps a link. If they are signed in we take them
 * straight to their own entry. If not, they give their membership number and
 * the last four digits of their mobile — that is a LOOKUP ONLY, never a login:
 * the personal link is sent to their full registered number, so only the real
 * owner of that phone can act. Nobody who is not a member is ever told whether
 * a membership number exists.
 *
 * Withdrawals before the draw use the normal safe withdrawal path on the
 * personal link. Once fixtures exist or entries are locked, nothing is
 * cancelled here — a request is filed for the organiser so a draw can never be
 * silently broken.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Summary = {
  found: boolean;
  tournament_name?: string;
  club_name?: string;
  club_subdomain?: string | null;
  entries_locked?: boolean;
};

export default function TournamentGroupAction({ action }: { action: "enter" | "withdraw" }) {
  const { champId } = useParams<{ champId: string }>();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [checking, setChecking] = useState(true);
  const [memberNumber, setMemberNumber] = useState("");
  const [last4, setLast4] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: string; masked?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any).rpc("tournament_public_summary", {
        p_champ_id: champId,
      });
      if (cancelled) return;
      setSummary((data ?? { found: false }) as Summary);

      // Signed in? Go straight to their own personal entry link.
      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user) {
        const { data: members } = await supabase
          .from("club_members")
          .select("id")
          .eq("user_id", auth.user.id);
        const ids = (members ?? []).map((m: any) => m.id);
        if (ids.length) {
          const { data: reg } = await (supabase as any)
            .from("club_champs_registrations")
            .select("invite_token")
            .eq("champ_id", champId)
            .in("club_member_id", ids)
            .maybeSingle();
          if (!cancelled && (reg as any)?.invite_token) {
            navigate(`/i/${(reg as any).invite_token}`, { replace: true });
            return;
          }
        }
        if (!cancelled && action === "enter") {
          navigate(`/club-champs/${champId}`, { replace: true });
          return;
        }
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [champId, action, navigate]);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("tournament-group", {
        body: {
          action: action === "withdraw" ? "withdraw_request" : "request_link",
          champ_id: champId,
          member_number: memberNumber.trim(),
          last4: last4.replace(/\D/g, ""),
          intent: action,
          reason: reason.trim() || undefined,
        },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.found === false) setResult({ kind: d.reason === "locked" ? "locked" : "no_match" });
      else setResult({ kind: d?.outcome ?? "link_sent", masked: d?.masked_phone });
    } catch {
      setResult({ kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const title = action === "withdraw" ? "Withdraw from" : "Enter";
  const clubBase = summary?.club_subdomain
    ? `https://${summary.club_subdomain}.squashhub.co.za`
    : "";

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            {title} {summary?.tournament_name ?? "this tournament"}
          </CardTitle>
          {summary?.club_name && (
            <p className="text-xs text-muted-foreground">{summary.club_name}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!summary?.found ? (
            <p className="text-muted-foreground">This tournament link is no longer available.</p>
          ) : result?.kind === "link_sent" ? (
            <div className="space-y-2">
              <p className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 text-primary" />
                We sent your personal link to your registered number ending {result.masked ?? "••••"}.
                Open it on your phone to finish.
              </p>
              <p className="text-xs text-muted-foreground">
                Only the owner of that phone can act on it.
              </p>
            </div>
          ) : result?.kind === "request_filed" ? (
            <p>
              The draw is already out, so your withdrawal has been sent to the organiser to handle.
              They will confirm with you.
            </p>
          ) : result?.kind === "no_entry" ? (
            <p>You are not entered for this tournament, so there is nothing to withdraw.</p>
          ) : result?.kind === "link_not_sent" ? (
            <p>
              We found you but could not send the message. Please contact the organiser, or sign in
              to SquashHub and open the tournament directly.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Being in the WhatsApp group does not enter you. Give your membership number and the
                last four digits of your mobile, and we will send your personal link to that number.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="memno" className="text-xs">Membership number</Label>
                <Input id="memno" value={memberNumber} onChange={(e) => setMemberNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last4" className="text-xs">Last 4 digits of your mobile</Label>
                <Input
                  id="last4"
                  inputMode="numeric"
                  maxLength={4}
                  value={last4}
                  onChange={(e) => setLast4(e.target.value)}
                />
              </div>
              {action === "withdraw" && (
                <div className="space-y-1.5">
                  <Label htmlFor="reason" className="text-xs">Reason (optional)</Label>
                  <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              )}
              {result?.kind === "no_match" && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-xs">
                    We could not match those details. If you are not a member yet, register first —
                    you will come back here afterwards.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const next = encodeURIComponent(`/t/${champId}/${action}`);
                      window.location.href = clubBase
                        ? `${clubBase}/auth?next=${next}`
                        : `/auth?next=${next}`;
                    }}
                  >
                    Register {summary?.club_name ? `at ${summary.club_name}` : "on SquashHub"}
                  </Button>
                </div>
              )}
              {result?.kind === "locked" && (
                <p className="text-xs text-destructive">
                  Too many attempts. Please try again in 15 minutes.
                </p>
              )}
              {result?.kind === "error" && (
                <p className="text-xs text-destructive">Something went wrong. Please try again.</p>
              )}
              <Button
                className="w-full"
                onClick={submit}
                disabled={busy || memberNumber.trim().length < 1 || last4.replace(/\D/g, "").length !== 4}
              >
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {action === "withdraw" ? "Send withdrawal link" : "Send my entry link"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

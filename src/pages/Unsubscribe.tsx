import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, MailX } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type State =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "already" }
  | { kind: "invalid"; message: string }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setState({ kind: "invalid", message: "Missing unsubscribe token." });
        return;
      }
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "invalid", message: data.error || "Invalid or expired link." });
          return;
        }
        if (data.valid === false && data.reason === "already_unsubscribed") {
          setState({ kind: "already" });
          return;
        }
        if (data.valid === true) {
          setState({ kind: "valid" });
          return;
        }
        setState({ kind: "invalid", message: "Invalid link." });
      } catch (e: any) {
        if (!cancelled) setState({ kind: "invalid", message: e?.message || "Network error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const confirm = async () => {
    setState({ kind: "submitting" });
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", message: data.error || "Failed to unsubscribe." });
        return;
      }
      setState({ kind: "done" });
    } catch (e: any) {
      setState({ kind: "error", message: e?.message || "Network error" });
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(220_45%_8%)] text-white flex items-center justify-center p-6">
      <SEO title="Unsubscribe — SquashHub" noIndex />
      <Card className="w-full max-w-md bg-[hsl(220_45%_10%/0.9)] border-white/10 rounded-2xl p-8 text-center space-y-5">
        <div className="flex justify-center">
          <div className="p-3 rounded-full bg-white/5 border border-white/10">
            <MailX className="h-6 w-6 text-amber-400" />
          </div>
        </div>
        <h1 className="text-xl font-semibold">Email preferences</h1>

        {state.kind === "loading" && (
          <div className="flex items-center justify-center gap-2 text-white/70 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your link…
          </div>
        )}

        {state.kind === "valid" && (
          <>
            <p className="text-sm text-white/70">
              Click below to unsubscribe from SquashHub emails.
            </p>
            <Button onClick={confirm} className="w-full">
              Confirm unsubscribe
            </Button>
          </>
        )}

        {state.kind === "submitting" && (
          <div className="flex items-center justify-center gap-2 text-white/70 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Processing…
          </div>
        )}

        {state.kind === "done" && (
          <div className="space-y-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
            <p className="text-sm text-white/80">
              You've been unsubscribed. We won't email you again.
            </p>
          </div>
        )}

        {state.kind === "already" && (
          <div className="space-y-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
            <p className="text-sm text-white/80">You're already unsubscribed.</p>
          </div>
        )}

        {(state.kind === "invalid" || state.kind === "error") && (
          <div className="space-y-3">
            <XCircle className="h-10 w-10 text-red-400 mx-auto" />
            <p className="text-sm text-white/80">{state.message}</p>
          </div>
        )}

        <div className="pt-2 text-xs text-white/40">
          <Link to="/" className="hover:text-white">Back to SquashHub</Link>
        </div>
      </Card>
    </div>
  );
}

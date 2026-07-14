import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { clearPendingClubSession, verifyClubCheckout } from "@/lib/club-payments";

const allowedStitchHost = "express.stitch.money";

function safeReturnPath(raw: string | null) {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/my-account";
}

function safeStitchUrl(raw: string | null) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== allowedStitchHost) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default function StitchPaymentBridge() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get("session") || "";
  const stitchUrl = useMemo(() => safeStitchUrl(params.get("url")), [params]);
  const returnPath = safeReturnPath(params.get("return"));
  const openedRef = useRef(false);
  const [message, setMessage] = useState("Waiting for Stitch payment…");
  const [checking, setChecking] = useState(false);

  const openPayment = () => {
    if (!stitchUrl) return;
    openedRef.current = true;
    window.open(stitchUrl, "_blank", "noopener,noreferrer");
    setMessage("Complete the payment in the Stitch tab. This page will update automatically.");
  };

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;
    let attempts = 0;

    const poll = async () => {
      while (!stopped && attempts < 90) {
        attempts += 1;
        try {
          setChecking(true);
          const { data } = await verifyClubCheckout("stitch", sessionId);
          const status = String((data as any)?.status || "");
          if (status === "completed") {
            clearPendingClubSession("stitch", sessionId);
            navigate(returnPath, { replace: true });
            return;
          }
          if (["failed", "expired", "cancelled"].includes(status)) {
            clearPendingClubSession("stitch", sessionId);
            setMessage(`Payment ${status}. You can return to your account and try again.`);
            return;
          }
        } catch {
          setMessage("Still waiting for confirmation from Stitch…");
        } finally {
          if (!stopped) setChecking(false);
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      if (!stopped) setMessage("Payment is still pending. Return to your account; it will keep checking there.");
    };

    void poll();
    return () => {
      stopped = true;
    };
  }, [sessionId, returnPath, navigate]);

  if (!sessionId || !stitchUrl) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Payment link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">Return to your account and start the payment again.</p>
          <Button className="mt-5" onClick={() => navigate("/my-account", { replace: true })}>
            My Account
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <section className="w-full max-w-md border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted">
          {checking ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <span className="text-lg font-semibold text-primary">R</span>
          )}
        </div>
        <h1 className="text-lg font-semibold text-foreground">Secure Stitch payment</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={openPayment}>{openedRef.current ? "Reopen Stitch" : "Open Stitch"}</Button>
          <Button variant="outline" onClick={() => navigate(returnPath, { replace: true })}>
            Return to account
          </Button>
        </div>
      </section>
    </main>
  );
}
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useMyClub, useMyClubMember } from "@/hooks/use-club";
import { isSupportedGateway, readReturnSession, clearPendingClubSession, verifyClubCheckout, startClubCheckout, type GatewayId } from "@/lib/club-payments";
import { SEO } from "@/components/SEO";

const RETURN_PATH = "/mobile-checkout";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

function notifyApp(status: string) {
  const bridge = window.ReactNativeWebView;
  if (bridge?.postMessage) bridge.postMessage(JSON.stringify({ type: "squashhub-payment", status }));
}

export default function MobileCheckout() {
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { activeMember, isLoading: memberLoading } = useMemberContext();
  const { data: clubData, isLoading: clubLoading } = useMyClub();
  const { data: clubMember, isLoading: clubMemberLoading } = useMyClubMember();
  const [message, setMessage] = useState("Preparing your secure payment…");
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const started = useRef(false);
  const gateway = params.get("gateway") || "";
  const purpose = params.get("purpose") || "fee";
  const feeIds = useMemo(() => (params.get("fee_ids") || "").split(",").filter(Boolean), [params]);
  const amount = Number(params.get("amount"));
  const club = clubData?.club;
  const memberId = activeMember?.id || clubMember?.id || null;
  const query = params.toString();
  const returnPath = `${RETURN_PATH}?${query}`;

  useEffect(() => {
    if (authLoading || memberLoading || clubLoading || clubMemberLoading || started.current) return;
    const returned = readReturnSession(new URLSearchParams(window.location.search), returnPath);
    if (returned) {
      started.current = true;
      const verify = async () => {
        if (returned.cancelled) {
          setState("error"); setMessage("Payment was cancelled. No payment was confirmed.");
          notifyApp("cancelled"); clearPendingClubSession(returned.gateway, returned.sid); return;
        }
        try {
          let status = "";
          for (let attempt = 0; attempt < 12; attempt += 1) {
            const result = await verifyClubCheckout(returned.gateway, returned.sid || null);
            if (result.error) throw result.error;
            status = String((result.data as { status?: unknown } | null)?.status || returned.statusHint || "processing").toLowerCase();
            if (["completed", "failed", "expired", "cancelled", "canceled"].includes(status)) break;
            await new Promise(resolve => window.setTimeout(resolve, 1500));
          }
          if (["completed", "paid", "success", "succeeded"].includes(status)) {
            setState("success"); setMessage("Payment confirmed. You can return to SquashHub."); notifyApp("completed");
            clearPendingClubSession(returned.gateway, returned.sid);
          } else if (["failed", "cancelled", "canceled", "expired"].includes(status)) {
            setState("error"); setMessage("The payment was not completed. You can close this window and try again."); notifyApp("failed");
            clearPendingClubSession(returned.gateway, returned.sid);
          } else {
            setState("loading"); setMessage("Payment submitted. The provider is still confirming it. You can return to SquashHub and refresh Billing shortly.");
            notifyApp("processing");
          }
          const clean = new URL(window.location.href);
          ["yoco_session", "yoco_cancelled", "yoco_status", "stitch_session", "stitch_status", "paynow_session", "payfast_session", "payfast_cancelled", "reference", "payment_id", "id"].forEach(key => clean.searchParams.delete(key));
          window.history.replaceState({}, "", clean.toString());
        } catch (error) {
          setState("error"); setMessage(error instanceof Error ? error.message : "Payment status could not be confirmed."); notifyApp("check-required");
        }
      };
      void verify();
      return;
    }
    if (!user || !club?.id || !memberId || !isSupportedGateway(gateway) || !["fee", "topup"].includes(purpose) || (purpose === "fee" && !feeIds.length) || !Number.isFinite(amount) || amount <= 0) {
      started.current = true; setState("error"); setMessage("This secure checkout link is incomplete or expired. Close it and start again from Billing."); notifyApp("failed"); return;
    }
    started.current = true;
    void startClubCheckout(gateway as GatewayId, {
      clubId: club.id, clubMemberId: memberId, amount, purpose: purpose as "fee" | "topup", fee_ids: purpose === "fee" ? feeIds : [],
      description: params.get("description") || (purpose === "topup" ? "Wallet credit top-up" : "Club fees"), returnPath,
      ...(gateway === "stitch" ? { method: "paybybank" as const } : {}),
    }).then(() => setMessage("Opening the club’s secure payment provider…"))
      .catch(error => { setState("error"); setMessage(error instanceof Error ? error.message : "Could not start payment."); notifyApp("failed"); });
  }, [activeMember?.id, amount, authLoading, club?.id, clubLoading, clubMemberLoading, feeIds, gateway, memberId, memberLoading, params, purpose, query, returnPath, user]);

  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground">
      <SEO title="Secure payment" description="Complete your club payment securely." path="/mobile-checkout" noIndex />
      <section className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          {state === "loading" ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : state === "success" ? <CheckCircle2 className="h-7 w-7 text-primary" /> : <XCircle className="h-7 w-7 text-destructive" />}
        </div>
        <h1 className="text-xl font-semibold">{state === "loading" ? "Secure club checkout" : state === "success" ? "Payment confirmed" : "Payment needs attention"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </section>
    </main>
  );
}

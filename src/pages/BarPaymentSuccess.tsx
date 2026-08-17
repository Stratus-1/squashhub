/** Plain confirmation screen for Scan-to-Pay card checkouts. */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Loader2 } from "lucide-react";


const PENDING_SALE_KEY = "sh.scanpay.pendingSale";

interface PendingSale {
  saleId: string;
  code: string;
}

export default function BarPaymentSuccess() {
  const { code = "" } = useParams();

  const [status, setStatus] = useState<"verifying" | "paid" | "failed" | "no-sale">("verifying");
  // Read the pending sale from local storage and poll until the bank confirms.
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(PENDING_SALE_KEY) : null;
    if (!raw) {
      setStatus("no-sale");
      return;
    }

    let parsed: PendingSale | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      localStorage.removeItem(PENDING_SALE_KEY);
      setStatus("no-sale");
      return;
    }

    if (!parsed?.saleId || parsed.code !== code) {
      setStatus("no-sale");
      return;
    }

    let cancelled = false;
    const poll = async (attempt = 0) => {
      if (cancelled) return;
      const { data: res } = await supabase.functions.invoke("bar-card-verify", {
        body: { sale_id: parsed.saleId },
      });
      const st = (res as { status?: string } | null)?.status;
      if (st === "paid") {
        localStorage.removeItem(PENDING_SALE_KEY);
        setStatus("paid");
        return;
      }
      if (st === "failed" || attempt >= 60) {
        localStorage.removeItem(PENDING_SALE_KEY);
        setStatus(st === "failed" ? "failed" : "no-sale");
        return;
      }
      setTimeout(() => poll(attempt + 1), 2000);
    };
    poll();

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
      <SEO
        title="Payment complete"
        description="Thank you for your payment"
        path={`/s/${code}/success`}
        noIndex
      />
      <main className="w-full max-w-sm space-y-6">
        {status === "verifying" ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Completing your payment…</p>
          </>
        ) : status === "failed" ? (
          <>
            <h1 className="text-xl font-semibold">Payment not confirmed.</h1>
            <p className="text-sm text-muted-foreground">Please check with the bar if your card was charged.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Thank you for your payment.</h1>
            <p className="text-base text-muted-foreground">Enjoy your squash. Bye.</p>
          </>
        )}
      </main>
    </div>
  );
}

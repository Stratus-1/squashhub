/**
 * Branded payment success page for Scan-to-Pay card checkouts.
 *
 * Reached after the payer completes a Stitch card payment. Shows the tenant
 * club logo and the SquashHub app logo, confirms the amount, and tries to
 * close the tab automatically after a few seconds.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Loader2, CheckCircle2, XCircle, ShoppingBag } from "lucide-react";
import { formatMoney } from "@/lib/qr-shortcodes";
import shLogo from "@/assets/sh-logo.png";
import { closeStitchPaymentWindow } from "@/lib/stitch-checkout";


const PENDING_SALE_KEY = "sh.scanpay.pendingSale";

interface ScanPayload {
  found: boolean;
  kind?: "item" | "venue";
  code?: string;
  club?: {
    id: string;
    name: string;
    logo_url: string | null;
    subdomain: string | null;
    currency_code: string | null;
    bar_enabled: boolean;
  };
}

interface PendingSale {
  saleId: string;
  itemName: string;
  total: number;
  code: string;
}

export default function BarPaymentSuccess() {
  const { code = "" } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"verifying" | "paid" | "failed" | "no-sale">("verifying");
  const [pending, setPending] = useState<PendingSale | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [canCloseTab] = useState(
    () => typeof window !== "undefined" && Boolean(window.opener),
  );

  const { data, isLoading } = useQuery({
    queryKey: ["scan-code", code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "resolve_qr_short_code" as never,
        { _code: code } as never,
      );
      if (error) throw error;
      return data as unknown as ScanPayload;
    },
    enabled: !!code,
  });

  const club = data?.club;

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

    setPending(parsed);

    let cancelled = false;
    const poll = async (attempt = 0) => {
      if (cancelled) return;
      const { data: res } = await supabase.functions.invoke("bar-card-verify", {
        body: { sale_id: parsed.saleId },
      });
      const st = (res as { status?: string } | null)?.status;
      if (st === "paid") {
        localStorage.removeItem(PENDING_SALE_KEY);
        void closeStitchPaymentWindow();
        setStatus("paid");
        return;
      }
      if (st === "failed" || attempt >= 60) {
        localStorage.removeItem(PENDING_SALE_KEY);
        setStatus(st === "failed" ? "failed" : "no-sale");
        return;
      }
      setTimeout(() => poll(attempt + 1), 3000);
    };
    poll();

    return () => {
      cancelled = true;
    };
  }, [code]);

  // Auto-close the tab after the payment is confirmed.
  useEffect(() => {
    if (status !== "paid" || !canCloseTab) return;
    if (countdown <= 0) {
      window.close();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [status, countdown, canCloseTab]);

  const attemptClose = () => {
    window.close();
    // Browsers block window.close() for tabs the script did not open.
    setTimeout(() => setCloseBlocked(true), 300);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.found || !club) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-lg font-semibold mb-1">Code not recognised</h1>
          <p className="text-sm text-muted-foreground">This QR code is no longer active.</p>
        </div>
      </div>
    );
  }

  const currency = club?.currency_code;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title={`Payment successful · ${club.name}`}
        description="Thank you for your payment"
        path={`/s/${code}/success`}
        noIndex
      />

      <header className="px-4 py-5 flex items-center justify-center gap-4 border-b">
        {club.logo_url ? (
          <img
            src={club.logo_url}
            alt={`${club.name} logo`}
            className="h-12 w-12 object-contain rounded"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            {club.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className="text-muted-foreground">×</span>
        <img src={shLogo} alt="SquashHub" className="h-12 w-12 object-contain rounded" />
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-sm w-full p-8 text-center space-y-6">
          {status === "verifying" ? (
            <div className="space-y-4">
              <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
              <h1 className="text-lg font-semibold">Waiting for your card payment…</h1>
              <p className="text-sm text-muted-foreground">
                Finish the payment in the secure payment tab. This page updates
                automatically — you can leave it open.
              </p>

            </div>
          ) : status === "failed" ? (
            <div className="space-y-4">
              <XCircle className="w-12 h-12 mx-auto text-destructive" />
              <h1 className="text-lg font-semibold">Payment not confirmed</h1>
              <p className="text-sm text-muted-foreground">
                We could not confirm the card payment. If you were charged, please show this screen at the bar.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-primary" />
              </div>
              <h1 className="text-xl font-semibold text-primary">Thank you very much!</h1>
              <p className="text-sm text-muted-foreground">
                {status === "paid" && pending ? (
                  <>
                    Your payment of{" "}
                    <strong className="text-foreground">
                      {formatMoney(pending.total, currency)}
                    </strong>{" "}
                    for <strong className="text-foreground">{pending.itemName}</strong> has been received.
                  </>
                ) : (
                  <>Your payment has been received.</>
                )}
              </p>
              <p className="text-sm font-medium text-accent">
                {canCloseTab ? "You can close this tab now." : "You can now return to the bar."}
              </p>
              {status === "paid" && canCloseTab && (
                <p className="text-xs text-muted-foreground">
                  This tab will close automatically in {countdown}s…
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3">
            <Button className="w-full gap-2" onClick={attemptClose}>
              <ShoppingBag className="w-4 h-4" />
              {canCloseTab ? "Close this tab" : "Done — back to bar"}
            </Button>
            {canCloseTab && (
              <Button variant="ghost" className="w-full gap-2" onClick={() => navigate(`/s/${code}`, { replace: true })}>
                <ShoppingBag className="w-4 h-4" /> Back to bar
              </Button>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}

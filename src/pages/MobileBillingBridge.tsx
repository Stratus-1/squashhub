import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Loader2, WalletCards } from "lucide-react";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const DEFAULT_PLAYER_API = "https://squashhub-player-gateway-9essk3i1.uc.gateway.dev";

export default function MobileBillingBridge() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const mobileToken = searchParams.get("mobile_token");

  const subdomain = useMemo(() => {
    if (typeof window === "undefined") return null;
    const host = window.location.hostname;
    const suffix = ".squashhub.co.za";
    if (!host.endsWith(suffix)) return null;
    const sub = host.slice(0, -suffix.length);
    return sub && sub !== "www" ? sub : null;
  }, []);

  useEffect(() => {
    if (loading || user || !mobileToken || error) return;

    const run = async () => {
      try {
        const api = ((import.meta.env.VITE_PLAYER_MOBILE_API_URL as string | undefined) || DEFAULT_PLAYER_API).replace(/\/+$/, "");
        const response = await fetch(`${api}/auth/web-billing-session`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mobileToken}`,
            "X-Mobile-Authorization": `Bearer ${mobileToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ subdomain }),
        });
        const payload = await response.json().catch(() => null) as { actionLink?: string; error?: string; message?: string } | null;
        if (!response.ok || !payload?.actionLink) {
          throw new Error(payload?.error || payload?.message || "Could not create a web billing session.");
        }
        window.location.replace(payload.actionLink);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not open billing from the mobile app.";
        setError(message);
        toast.error(message);
      }
    };

    void run();
  }, [error, loading, mobileToken, subdomain, user]);

  useEffect(() => {
    if (!user || !mobileToken) return;
    const next = new URL("/my-account?pay=1", window.location.origin);
    window.location.replace(next.toString());
  }, [mobileToken, user]);

  if (!mobileToken && !loading && !user) {
    return <Navigate to={`/auth?redirectTo=${encodeURIComponent("/my-account?pay=1")}`} replace />;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <SEO title="Opening billing" description="Opening your SquashHub billing account." path="/mobile-billing" noIndex />
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          {error ? <WalletCards className="h-6 w-6 text-primary" /> : <Loader2 className="h-6 w-6 animate-spin text-primary" />}
        </div>
        <h1 className="text-lg font-semibold">{error ? "Billing sign-in needs setup" : "Opening your account"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error || "Signing you into SquashHub and taking you straight to billing."}
        </p>
      </div>
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export default function StravaCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);

  const code = params.get("code");
  const error = params.get("error");
  const scope = params.get("scope");
  const state = params.get("state");

  const expectedState = useMemo(
    () => sessionStorage.getItem("strava_oauth_state"),
    []
  );

  useEffect(() => {
    const run = async () => {
      try {
        if (error) throw new Error(error);
        if (!code) throw new Error("Missing authorization code");
        if (!state || !expectedState || state !== expectedState) {
          throw new Error("Invalid OAuth state. Please try connecting again.");
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("You must be logged in");
        if (!accessToken.startsWith("eyJ") || accessToken.split(".").length !== 3) {
          throw new Error("Your login session looks invalid. Please sign out and sign in again.");
        }

        const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
          ?.trim()
          ?.replace(/\/+$/, "");
        const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();
        if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL");
        if (!supabaseKey) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");

        const res = await fetch(`${supabaseUrl}/functions/v1/strava`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: "exchange", code, scope }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Failed to connect Strava");
        if (!data?.connected) throw new Error("Failed to connect Strava");

        toast.success("Strava connected");
        sessionStorage.removeItem("strava_oauth_state");
        navigate("/profile");
      } catch (e: any) {
        toast.error(e.message || "Strava connection failed");
        sessionStorage.removeItem("strava_oauth_state");
        navigate("/profile");
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground mt-3">
          {loading ? "Connecting Strava…" : "Redirecting…"}
        </p>
      </div>
    </div>
  );
}

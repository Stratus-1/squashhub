import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // PKCE flow
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (data.session) {
          const user = data.session.user;
          const meta = user.user_metadata || {};
          const clubSubdomain = meta.club_subdomain as string | undefined;
          const registrationType = meta.club_registration_type as string | undefined;

          // If this user signed up with club/association registration metadata, redirect to their tenant
          // Only do the sign-out + redirect flow for tenant OWNERS (not members)
          const isTenantOwner = registrationType === "club_owner" || registrationType === "association_owner";
          if (clubSubdomain && isTenantOwner) {
            // Clear club metadata so it doesn't re-trigger
            await supabase.auth.updateUser({
              data: { club_name: null, club_subdomain: null, club_registration_type: null },
            });

            // Send registration confirmation email (fire-and-forget)
            const clubName = meta.club_name as string | undefined;
            const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
            const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
            if (projectId && anonKey && clubName) {
              fetch(
                `https://${projectId}.supabase.co/functions/v1/auth-email-hook?action=club-registered`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: anonKey },
                  body: JSON.stringify({
                    to: user.email,
                    name: meta.name || "",
                    clubName,
                    clubAdminUrl: `${window.location.origin}/c/${clubSubdomain}/club-admin`,
                  }),
                }
              ).catch((err) => console.warn("Registration email failed:", err));
            }

            toast.success(
              registrationType === "association_owner"
                ? "Email verified! Your association is ready."
                : "Email verified! Your club is ready."
            );

            // Redirect to the tenant subdomain login
            const isPreview = window.location.hostname.includes("lovable.app") || window.location.hostname === "localhost";
            if (isPreview) {
              await supabase.auth.signOut({ scope: "local" });
              navigate(`/c/${clubSubdomain}/auth`, { replace: true });
            } else {
              await supabase.auth.signOut({ scope: "local" });
              window.location.href = `https://${clubSubdomain}.squashhub.co.za/auth`;
            }
            return;
          }

          // For club members, preserve club context via query param
          if (clubSubdomain && !isTenantOwner) {
            // Clear metadata so it doesn't re-trigger
            await supabase.auth.updateUser({
              data: { club_name: null, club_subdomain: null, club_registration_type: null },
            });
            navigate(`/?club=${encodeURIComponent(clubSubdomain)}`, { replace: true });
          } else {
            navigate("/", { replace: true });
          }
        } else {
          navigate("/auth", { replace: true });
        }
      } catch (e: any) {
        toast.error(e.message || "Auth callback failed");
        navigate("/auth", { replace: true });
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [navigate]);

  if (!loading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Setting up your account...</p>
      </div>
    </div>
  );
}

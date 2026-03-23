import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
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
          const clubName = meta.club_name as string | undefined;
          const clubSubdomain = meta.club_subdomain as string | undefined;

          // If this user signed up with club registration metadata, create the club now
          if (clubName && clubSubdomain) {
            try {
              // Check if club already exists for this user (idempotency)
              const { data: existing } = await fromExt("club_members")
                .select("club_id")
                .eq("user_id", user.id)
                .limit(1);

              if (!existing || existing.length === 0) {
                // Create the club
                const { data: newClub, error: clubErr } = await fromExt("clubs")
                  .insert({
                    name: clubName,
                    subdomain: clubSubdomain,
                    created_by: user.id,
                  })
                  .select()
                  .single();

                if (clubErr) {
                  console.error("Failed to create club:", clubErr);
                  toast.error("Club creation failed: " + clubErr.message);
                } else {
                  // Add creator as captain
                  const { error: memErr } = await fromExt("club_members").insert({
                    club_id: newClub.id,
                    user_id: user.id,
                    role: "captain",
                    name: meta.name || "",
                    email: user.email || "",
                  });
                  if (memErr) console.error("Failed to add captain:", memErr);

                  // Clear club metadata from user profile so it doesn't re-trigger
                  await supabase.auth.updateUser({
                    data: { club_name: null, club_subdomain: null },
                  });

                  // Send club registration confirmation email (fire-and-forget)
                  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
                  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
                  if (projectId && anonKey) {
                    fetch(
                      `https://${projectId}.supabase.co/functions/v1/auth-email-hook?action=club-registered`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json", apikey: anonKey },
                        body: JSON.stringify({
                          to: user.email,
                          name: meta.name || "",
                          clubName: newClub.name,
                          clubAdminUrl: `${window.location.origin}/c/${clubSubdomain}/club-admin`,
                        }),
                      }
                    ).catch((err) => console.warn("Club registration email failed:", err));
                  }

                  toast.success("Email verified! Your club has been created.");

                  // Redirect to the club subdomain login
                  // Use path-based routing for preview environments
                  const isPreview = window.location.hostname.includes("lovable.app") || window.location.hostname === "localhost";
                  if (isPreview) {
                    // Sign out so they land on the club login page
                    await supabase.auth.signOut({ scope: "local" });
                    navigate(`/c/${clubSubdomain}/auth`, { replace: true });
                  } else {
                    // Production: redirect to subdomain
                    await supabase.auth.signOut({ scope: "local" });
                    window.location.href = `https://${clubSubdomain}.squashhub.co.za/auth`;
                  }
                  return;
                }
              }
            } catch (e) {
              console.error("Club creation in callback failed:", e);
            }
          }

          navigate("/", { replace: true });
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

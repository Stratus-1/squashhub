import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getClubSubdomain } from "@/lib/subdomain";
import { getPublicClubBySubdomain } from "@/lib/public-clubs";

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

          // Mandatory first-time password setup (bulk-invited visitors).
          if (meta.needs_password_setup) {
            navigate("/set-password", { replace: true });
            return;
          }

          // Tournament / membership claim deep link: return the newly verified
          // user to the invitation or other claim context they started from.
          const claimRedirectTo = meta.claim_redirect_to as string | undefined;
          if (claimRedirectTo) {
            await supabase.auth.updateUser({ data: { claim_redirect_to: null } });
            navigate(claimRedirectTo, { replace: true });
            return;
          }

          const metadataClubSubdomain = meta.club_subdomain as string | undefined;
          const oauthReturnClub = getClubSubdomain();
          const registrationType = meta.club_registration_type as string | undefined;

          // If a Google-visitor registration is pending for any club, return the
          // user to /auth on the current (tenant) origin so ClubAuth can finish it.
          try {
            const TTL = 30 * 60 * 1000;
            let hasFreshPendingVisitor = false;
            Object.keys(localStorage)
              .filter((k) => k.startsWith("sh.pending_visitor_registration."))
              .forEach((k) => {
                try {
                  const parsed = JSON.parse(localStorage.getItem(k) || "");
                  const savedAt = Number(parsed?.saved_at || 0);
                  if (savedAt && Date.now() - savedAt < TTL) {
                    hasFreshPendingVisitor = true;
                  } else {
                    localStorage.removeItem(k);
                  }
                } catch { localStorage.removeItem(k); }
              });
            if (hasFreshPendingVisitor) {
              navigate("/auth", { replace: true });
              return;
            }
          } catch { /* ignore */ }

          // If this user signed up with club/association registration metadata, redirect to their tenant
          // Only do the sign-out + redirect flow for tenant OWNERS (not members)
          const isTenantOwner = registrationType === "club_owner" || registrationType === "association_owner";
          if (metadataClubSubdomain && isTenantOwner) {
            const clubName = (meta.club_name as string) || "";
            const tenantType = registrationType === "association_owner" ? "association" : "club";

            // Idempotent provisioning: only call create-club if this user doesn't
            // already own a club at this subdomain. This heals signups where the
            // initial provisioning attempt failed (e.g. previous unauthenticated path).
            const existingClub = await getPublicClubBySubdomain(metadataClubSubdomain);

            let provisioned = !!existingClub;
            if (!existingClub) {
              const { error: provErr } = await supabase.functions.invoke("create-club", {
                body: {
                  clubName,
                  subdomain: metadataClubSubdomain,
                  userName: (meta.name as string) || "",
                  userEmail: user.email,
                  tenantType,
                },
              });
              if (provErr) {
                console.error("[AuthCallback] create-club failed:", provErr);
                toast.error(
                  "Email verified, but we couldn't create your " +
                    tenantType +
                    " automatically. Please contact support."
                );
                // Do NOT clear metadata — leaving it allows a retry on next login.
                navigate("/auth", { replace: true });
                return;
              }
              provisioned = true;
            }

            // Clear club metadata so it doesn't re-trigger
            await supabase.auth.updateUser({
              data: { club_name: null, club_subdomain: null, club_registration_type: null },
            });

            // Send registration confirmation email (fire-and-forget)
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
                    clubAdminUrl: `${window.location.origin}/c/${metadataClubSubdomain}/club-admin`,
                  }),
                }
              ).catch((err) => console.warn("Registration email failed:", err));
            }

            toast.success(
              tenantType === "association"
                ? "Email verified! Your association is ready."
                : "Email verified! Your club is ready."
            );

            // Redirect to the tenant subdomain login
            const isPreview = window.location.hostname.includes("lovable.app") || window.location.hostname === "localhost";
            if (isPreview) {
              await supabase.auth.signOut({ scope: "local" });
              navigate(`/c/${metadataClubSubdomain}/auth`, { replace: true });
            } else {
              await supabase.auth.signOut({ scope: "local" });
              window.location.href = `https://${metadataClubSubdomain}.squashhub.co.za/auth`;
            }
            return;
          }


          // For club members, preserve club context via query param
          const memberRedirectClub = oauthReturnClub || metadataClubSubdomain;
          if (memberRedirectClub && !isTenantOwner) {
            // Provision the member at the association tenant if applicable
            if (registrationType === "association_member" && metadataClubSubdomain) {
              const homeClubId = (meta.home_club_id as string) || null;
              const homeClubName = (meta.home_club_name as string) || null;
              try {
                const { error: provErr } = await supabase.functions.invoke(
                  "provision-association-member",
                  {
                    body: {
                      associationSubdomain: metadataClubSubdomain,
                      homeClubId,
                      homeClubName,
                    },
                  }
                );
                if (provErr) {
                  console.warn("[AuthCallback] provision failed:", provErr.message);
                } else {
                  toast.success("Email verified! Welcome to the league.");
                }
              } catch (err) {
                console.warn("[AuthCallback] provision error:", err);
              }
            }

            // Clear metadata so it doesn't re-trigger
            await supabase.auth.updateUser({
              data: {
                club_name: null,
                club_subdomain: null,
                club_registration_type: null,
                home_club_id: null,
                home_club_name: null,
                home_club_subdomain: null,
              },
            });
            navigate(`/?club=${encodeURIComponent(memberRedirectClub)}`, { replace: true });
          } else {
            navigate("/", { replace: true });
          }
        } else {
          navigate("/auth", { replace: true });
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Auth callback failed";
        toast.error(message);
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

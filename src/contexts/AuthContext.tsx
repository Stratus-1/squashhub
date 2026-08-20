import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getTenantAwareAuthRedirect } from "@/lib/site";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    name: string,
    phone?: string,
    consents?: { termsAcceptedAt?: string; privacyAcceptedAt?: string },
    club?: { clubName: string; subdomain: string; registrationType?: "club_owner" | "club_member" | "association_owner" | "association_member"; homeClubId?: string; homeClubName?: string; homeClubSubdomain?: string }
  ) => Promise<{ error: Error | null; userId: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth-email redirect URLs are built per-call via getTenantAwareAuthRedirect()
  // so they always land on the production root and bounce back to the active
  // tenant subdomain via the bootstrap script in index.html.

  useEffect(() => {
    const forceLocalSignOut = async () => {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // ignore
      }
      // Clear any stale supabase tokens from storage as a hard reset
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        // ignore
      }
      setSession(null);
      setUser(null);
      setLoading(false);
    };

    // Only these mean the account/token is genuinely invalid. Anything else
    // (offline, timeout, 5xx, fetch failure — common right after a PWA update
    // reload on mobile) must NEVER wipe the stored session.
    const isDefinitelyInvalid = (error: unknown): boolean => {
      const e = error as { status?: number; code?: string; message?: string } | null;
      if (!e) return false;
      const status = typeof e.status === "number" ? e.status : undefined;
      const code = (e.code || "").toLowerCase();
      const msg = (e.message || "").toLowerCase();
      if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout")) {
        return false;
      }
      if (code.includes("user_not_found") || msg.includes("user not found")) return true;
      if (status === 401 || status === 403) return true;
      return false;
    };

    const validateSession = async (s: Session | null) => {
      if (!s?.user) {
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }
      // Trust the locally stored session immediately so a reload (e.g. after a
      // PWA update) never flashes the login screen.
      setSession(s);
      setUser(s.user);
      setLoading(false);

      // Then verify server-side in the background. Only a definitive auth
      // rejection clears the session; transient/offline errors are ignored.
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          if (isDefinitelyInvalid(error)) {
            console.warn("[Auth] Session rejected by server, signing out locally", error.message);
            await forceLocalSignOut();
          }
          return;
        }
        if (data?.user) setUser(data.user);
      } catch {
        // offline / transient — keep the local session
      }
    };


    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      validateSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    name: string,
    phone?: string,
    consents?: { termsAcceptedAt?: string; privacyAcceptedAt?: string },
    club?: { clubName: string; subdomain: string; registrationType?: "club_owner" | "club_member" | "association_owner" | "association_member"; homeClubId?: string; homeClubName?: string; homeClubSubdomain?: string }
  ) => {
    const metadata: Record<string, string> = { name };
    if (phone) metadata.phone = phone;
    if (consents?.termsAcceptedAt) metadata.terms_accepted_at = consents.termsAcceptedAt;
    if (consents?.privacyAcceptedAt) metadata.privacy_accepted_at = consents.privacyAcceptedAt;
    if (club?.clubName) metadata.club_name = club.clubName;
    if (club?.subdomain) metadata.club_subdomain = club.subdomain;
    if (club?.registrationType) metadata.club_registration_type = club.registrationType;
    if (club?.homeClubId) metadata.home_club_id = club.homeClubId;
    if (club?.homeClubName) metadata.home_club_name = club.homeClubName;
    if (club?.homeClubSubdomain) metadata.home_club_subdomain = club.homeClubSubdomain;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: getTenantAwareAuthRedirect("/auth/callback"),
      },
    });

    // Email verification is now required — welcome email sent after verification

    return { error: error as Error | null, userId: data?.user?.id ?? null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      await supabase.auth.signOut({ scope: "local" });
    }
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getTenantAwareAuthRedirect("/reset-password"),
    });
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

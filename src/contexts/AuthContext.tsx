import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
    club?: { clubName: string; subdomain: string }
  ) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const publicBaseUrl =
    (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim()?.replace(/\/+$/, "") ||
    window.location.origin;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    name: string,
    phone?: string,
    consents?: { termsAcceptedAt?: string; privacyAcceptedAt?: string },
    club?: { clubName: string; subdomain: string }
  ) => {
    const metadata: Record<string, string> = { name };
    if (phone) metadata.phone = phone;
    if (consents?.termsAcceptedAt) metadata.terms_accepted_at = consents.termsAcceptedAt;
    if (consents?.privacyAcceptedAt) metadata.privacy_accepted_at = consents.privacyAcceptedAt;
    if (club?.clubName) metadata.club_name = club.clubName;
    if (club?.subdomain) metadata.club_subdomain = club.subdomain;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${publicBaseUrl}/auth/callback`,
      },
    });

    // Send branded welcome email via club/platform SMTP (auto-confirm is on, so no default email)
    if (!error && data?.user && club?.subdomain) {
      try {
        await supabase.functions.invoke("auth-email-hook?action=welcome", {
          body: {
            to: email,
            name,
            subdomain: club.subdomain,
            source: "club",
          },
        });
      } catch (e) {
        console.warn("[signUp] Failed to send branded welcome email:", e);
      }
    }

    return { error: error as Error | null };
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
      redirectTo: `${publicBaseUrl}/reset-password`,
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

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
    club?: { clubName: string; subdomain: string; registrationType?: "club_owner" | "club_member" }
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

  const publicBaseUrl =
    (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim()?.replace(/\/+$/, "") ||
    "https://squashhub.co.za";

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
    club?: { clubName: string; subdomain: string; registrationType?: "club_owner" | "club_member" }
  ) => {
    const metadata: Record<string, string> = { name };
    if (phone) metadata.phone = phone;
    if (consents?.termsAcceptedAt) metadata.terms_accepted_at = consents.termsAcceptedAt;
    if (consents?.privacyAcceptedAt) metadata.privacy_accepted_at = consents.privacyAcceptedAt;
    if (club?.clubName) metadata.club_name = club.clubName;
    if (club?.subdomain) metadata.club_subdomain = club.subdomain;
    if (club?.registrationType) metadata.club_registration_type = club.registrationType;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${publicBaseUrl}/auth/callback`,
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

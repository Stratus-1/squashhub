import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleSignInButton, GoogleAuthDivider } from "@/components/GoogleSignInButton";
import { getTenantAwareAuthRedirect } from "@/lib/site";
import { toast } from "sonner";
import { CheckEmailPanel, savePendingVerify, readPendingVerify, clearPendingVerify } from "@/components/auth/CheckEmailPanel";

function activationRedirect(): string {
  const redirect = new URL(getTenantAwareAuthRedirect("/auth/callback"));
  redirect.searchParams.set("redirectTo", "/activate");
  return redirect.toString();
}

/**
 * Personal activation link for an existing (imported) club member.
 * The code in `?t=` is single-use and tied to one club_members row; only its
 * hash is stored server-side. It is moved to localStorage and removed from the
 * address bar so it survives the Google / email-confirm round trip.
 */
export const ACTIVATION_STORAGE_KEY = "sh.activation_token";

type Info = {
  status: "valid" | "expired" | "revoked" | "claimed" | "invalid";
  club_name?: string;
  club_subdomain?: string;
  first_name?: string;
  email?: string;
  expires_at?: string;
};

function readToken(): string | null {
  const url = new URL(window.location.href);
  const t = url.searchParams.get("t");
  if (t) {
    try { localStorage.setItem(ACTIVATION_STORAGE_KEY, t); } catch { /* ignore */ }
    url.searchParams.delete("t");
    window.history.replaceState(null, "", url.pathname + (url.search || ""));
    return t;
  }
  try { return localStorage.getItem(ACTIVATION_STORAGE_KEY); } catch { return null; }
}

function clearToken() {
  try { localStorage.removeItem(ACTIVATION_STORAGE_KEY); } catch { /* ignore */ }
}

export default function ActivateAccount() {
  const navigate = useNavigate();
  const [token] = useState(readToken);
  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<"choose" | "password" | "signin" | "confirm">("choose");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const claim = useCallback(async () => {
    if (!token) return;
    const { data, error } = await (supabase as any).rpc("claim_member_activation", { _token: token });
    const status = error ? "error" : (data as any)?.status;
    if (status === "claimed") {
      clearToken();
      clearPendingVerify();
      toast.success("Your SquashHub account is active and linked to your existing membership.");
      navigate("/", { replace: true });
      return;
    }
    if (status === "email_mismatch") {
      setProblem("You're signed in with a different email address from the one your club has on file. Sign out and continue with the club's email address.");
    } else if (status === "already_claimed") {
      setProblem("This membership is already linked to a SquashHub account. Sign in with that account instead.");
    } else if (status === "expired" || status === "revoked" || status === "invalid") {
      setProblem("This activation link is no longer valid.");
    } else {
      setProblem(error?.message || "We couldn't activate your account. Please try again.");
    }
  }, [token, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setInfo({ status: "invalid" }); return; }
      const { data } = await (supabase as any).rpc("resolve_member_activation", { _token: token });
      if (cancelled) return;
      setInfo((data as Info) ?? { status: "invalid" });
      const { data: u } = await supabase.auth.getUser();
      if (cancelled) return;
      if (u?.user) {
        clearPendingVerify();
        setSignedInEmail(u.user.email ?? null);
        if ((data as Info)?.status === "valid") await claim();
      } else {
        // Keep the check-email state across reload / Back — never drop back to the form.
        const pending = readPendingVerify();
        const em = (data as Info)?.email;
        if (pending && em && pending.email.trim().toLowerCase() === em.trim().toLowerCase()) setMode("confirm");
      }
    })();
    return () => { cancelled = true; };
  }, [token, claim]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!info?.email) return;
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== password2) { toast.error("Passwords don't match"); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: info.email, password, options: { emailRedirectTo: activationRedirect() },
    });
    setBusy(false);
    if (error) {
      if (/already/i.test(error.message)) {
        toast.message("This email already has a SquashHub login — sign in instead.");
        setMode("signin");
        return;
      }
      toast.error(error.message);
      return;
    }
    if (data.session) { await claim(); return; }
    savePendingVerify(info.email, activationRedirect());
    setMode("confirm");
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!info?.email) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: info.email, password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await claim();
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
    setSignedInEmail(null);
    setProblem(null);
  };

  const forwardRoutes = (
    <div className="grid gap-2">
      <Button onClick={() => navigate("/auth")}>Sign in</Button>
      <Button variant="outline" onClick={() => navigate("/auth?intent=existing")}>Register with my member details</Button>
      <Button variant="ghost" onClick={() => navigate("/auth")}>Forgot password? (use Reset on the sign-in page)</Button>
    </div>
  );

  let body: React.ReactNode;
  if (!info) {
    body = <p className="text-sm text-muted-foreground">Checking your link…</p>;
  } else if (problem) {
    body = (
      <div className="space-y-3">
        <p className="text-sm">{problem}</p>
        {signedInEmail && <Button variant="outline" className="w-full" onClick={signOut}>Sign out of {signedInEmail}</Button>}
        {forwardRoutes}
      </div>
    );
  } else if (info.status === "claimed") {
    body = (
      <div className="space-y-3">
        <p className="text-sm">This membership is already linked to a SquashHub account. Sign in with Google or your password, or reset your password.</p>
        <GoogleSignInButton label="Continue with Google" showHint={false} />
        {forwardRoutes}
      </div>
    );
  } else if (info.status !== "valid") {
    body = (
      <div className="space-y-3">
        <p className="text-sm">
          {info.status === "expired" ? "This activation link has expired." : "This activation link is no longer valid."}{" "}
          You can still register using your member details, or ask {info.club_name || "your club"} to resend your personal link.
        </p>
        {forwardRoutes}
      </div>
    );
  } else if (mode === "confirm") {
    body = (
      <CheckEmailPanel
        email={info.email || ""}
        redirect={activationRedirect()}
        onSignIn={() => { clearPendingVerify(); setPassword(""); setMode("signin"); }}
        changeEmailHint={`Wrong email address? Ask ${info.club_name || "your club"} to update it on your membership and resend your personal link — your membership and history stay the same. You can also activate with this address now and change it later.`}
      />
    );
  } else {
    body = (
      <div className="space-y-4">
        <p className="text-sm">
          Hi {info.first_name || "there"}, your membership at <strong>{info.club_name}</strong> is already loaded.
          Activate access for <strong>{info.email}</strong>.
        </p>
        <GoogleSignInButton label="Continue with Google" redirectPath="/activate" showHint={false} />
        <p className="text-[11px] text-muted-foreground text-center">Use the Google account for {info.email}. No separate password needed.</p>
        <GoogleAuthDivider />
        {mode === "choose" && (
          <div className="grid gap-2">
            <Button variant="outline" onClick={() => setMode("password")}>Set a password instead</Button>
            <Button variant="ghost" onClick={() => setMode("signin")}>I already have a SquashHub password</Button>
          </div>
        )}
        {mode === "password" && (
          <form onSubmit={handleSetPassword} className="space-y-2">
            <Label htmlFor="act-pw">Choose a password</Label>
            <Input id="act-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Label htmlFor="act-pw2">Confirm password</Label>
            <Input id="act-pw2" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Activating…" : "Activate my account"}</Button>
          </form>
        )}
        {mode === "signin" && (
          <form onSubmit={handleSignIn} className="space-y-2">
            <Label htmlFor="act-si">Password</Label>
            <Input id="act-si" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in and activate"}</Button>
            <Button type="button" variant="link" className="w-full" onClick={() => navigate("/auth")}>Forgot password?</Button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Activate your SquashHub account</CardTitle>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  );
}

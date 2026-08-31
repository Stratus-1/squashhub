import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Eye, EyeOff, Building2, LogIn, UserPlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { HCaptcha, verifyCaptchaToken, type HCaptchaHandle } from "@/components/HCaptcha";
import shLogo from "@/assets/sh-logo.png";
import { GoogleSignInButton, GoogleAuthDivider, isGoogleAuthDisabled } from "@/components/GoogleSignInButton";

export default function Auth() {
  const { signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const captchaRef = useRef<HCaptchaHandle>(null);
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const hideGoogleAuth = isGoogleAuthDisabled();

  const [params] = useState(() => new URLSearchParams(window.location.search));
  const intent = params.get("intent");
  const redirectTo = params.get("redirectTo") || "/";
  const isClaim = intent === "claim";
  const [mode, setMode] = useState<"signin" | "signup">(isClaim ? "signup" : "signin");

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Sign-up form
  const [fullName, setFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");

  // Reset form
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    if (isClaim) setMode("signup");
  }, [isClaim]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = await captchaRef.current?.execute().catch(() => null);
      if (token) {
        await verifyCaptchaToken(token).catch(() => false);
      }

      const { error } = await signIn(loginEmail.trim(), loginPassword);
      if (error) {
        toast.error(error.message);
      } else if (redirectTo && redirectTo !== "/") {
        navigate(redirectTo, { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupPassword !== signupConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (signupPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const token = await captchaRef.current?.execute().catch(() => null);
      if (token) {
        await verifyCaptchaToken(token).catch(() => false);
      }

      const metadata: Record<string, string> = { name: fullName.trim() };
      if (isClaim && redirectTo && redirectTo !== "/") {
        metadata.claim_redirect_to = redirectTo;
      }

      const { error } = await signUp(signupEmail.trim(), signupPassword, fullName.trim(), undefined, {
        termsAcceptedAt: new Date().toISOString(),
        privacyAcceptedAt: new Date().toISOString(),
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Account created — please check your email to verify your address.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await resetPassword(resetEmail.trim());
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password reset link sent to your email");
      setShowReset(false);
    }
    setLoading(false);
  };

  if (showReset) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <SEO title="Reset Password" description="Reset your password for SquashHub." path="/auth" noIndex />
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold font-heading">Reset Password</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your email to receive a reset link</p>
          </div>
          <Card className="p-6">
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowReset(false)}>
                Back to login
              </Button>
            </form>
          </Card>
        </motion.div>
      </div>
    );
  }

  const title = mode === "signup" ? (isClaim ? "Create your account" : "Create an account") : "Sign In";
  const subtitle = mode === "signup"
    ? isClaim
      ? "We'll link your account to this invitation after you verify your email."
      : "Manage your club, leagues & players"
    : "Manage your club, leagues & players";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <SEO title={title} description="Sign in or create an account for SquashHub — the multi-club squash management platform." path="/auth" noIndex />
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>

        <div className="text-center mb-6">
          <img src={shLogo} alt="SquashHub logo" className="w-14 h-14 rounded-2xl object-contain mx-auto mb-3" />
          <h1 className="text-2xl font-bold font-heading">SquashHub</h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>

        <Card className="p-6">
          {mode === "signin" && !hideGoogleAuth ? (
            <div className="space-y-4">
              <GoogleSignInButton />
              <GoogleAuthDivider />
            </div>
          ) : mode === "signin" ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              Local development auth is set to email/password only. Use the form below to sign in to the relevant club.
            </div>
          ) : null}

          {mode === "signin" ? (
            <form onSubmit={handleLogin} className="space-y-4 mt-4">
              <div>
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <HCaptcha ref={captchaRef} />
              <Button type="submit" className="w-full" disabled={loading}>
                <LogIn className="w-4 h-4 mr-2" />
                {loading ? "Signing in..." : "Sign In"}
              </Button>
              <Button type="button" variant="link" className="w-full text-sm" onClick={() => setShowReset(true)}>
                Forgot password?
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4 mt-4">
              <div>
                <Label htmlFor="signup-name">Full name</Label>
                <Input id="signup-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="signup-password">Password</Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="signup-confirm">Confirm password</Label>
                <Input
                  id="signup-confirm"
                  type={showPassword ? "text" : "password"}
                  value={signupConfirm}
                  onChange={(e) => setSignupConfirm(e.target.value)}
                  required
                />
              </div>
              <HCaptcha ref={captchaRef} />
              <Button type="submit" className="w-full" disabled={loading}>
                <UserPlus className="w-4 h-4 mr-2" />
                {loading ? "Creating account..." : "Create account"}
              </Button>
            </form>
          )}
        </Card>

        <Card className="mt-4 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {mode === "signin" ? "New to SquashHub?" : "Already have an account?"}
            </p>
            <p className="text-xs text-muted-foreground">
              {mode === "signin" ? "Find your club or register a new one." : "Sign in instead."}
            </p>
          </div>
          <Button
            asChild={mode === "signin"}
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={mode === "signup" ? () => setMode("signin") : undefined}
          >
            {mode === "signin" ? (
              <Link to="/register-club">
                <Building2 className="w-4 h-4 mr-1.5" />
                Register
              </Link>
            ) : (
              <>
                <LogIn className="w-4 h-4 mr-1.5" />
                Sign In
              </>
            )}
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}

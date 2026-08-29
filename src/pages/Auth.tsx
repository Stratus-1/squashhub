import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Eye, EyeOff, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { HCaptcha, verifyCaptchaToken, type HCaptchaHandle } from "@/components/HCaptcha";
import shLogo from "@/assets/sh-logo.png";
import { GoogleSignInButton, GoogleAuthDivider, isGoogleAuthDisabled } from "@/components/GoogleSignInButton";

export default function Auth() {
  const { signIn, resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const captchaRef = useRef<HCaptchaHandle>(null);

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Reset form
  const [resetEmail, setResetEmail] = useState("");

  const hideGoogleAuth = isGoogleAuthDisabled();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Best-effort captcha on sign-in — never lock existing users out.
      const token = await captchaRef.current?.execute().catch(() => null);
      if (token) {
        await verifyCaptchaToken(token).catch(() => false);
      }

      const { error } = await signIn(loginEmail.trim(), loginPassword);
      if (error) toast.error(error.message);
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <SEO title="Sign In" description="Sign in to SquashHub — the multi-club squash management platform." path="/auth" noIndex />
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
          <p className="text-sm text-muted-foreground mt-1">Manage your club, leagues & players</p>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            {!hideGoogleAuth ? (
              <>
                <GoogleSignInButton />
                <GoogleAuthDivider />
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                Local development auth is set to email/password only. Use the form below to sign in to the relevant club.
              </div>
            )}
          </div>
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
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <Button type="button" variant="link" className="w-full text-sm" onClick={() => setShowReset(true)}>
              Forgot password?
            </Button>
          </form>
        </Card>

        <Card className="mt-4 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">New to SquashHub?</p>
            <p className="text-xs text-muted-foreground">Find your club or register a new one.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to="/register-club">
              <Building2 className="w-4 h-4 mr-1.5" />
              Register
            </Link>
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}

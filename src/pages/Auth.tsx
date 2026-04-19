import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { HCaptcha, verifyCaptchaToken, type HCaptchaHandle } from "@/components/HCaptcha";
import shLogo from "@/assets/sh-logo.png";

export default function Auth() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const captchaRef = useRef<HCaptchaHandle>(null);

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [clubName, setClubName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [tenantType, setTenantType] = useState<"club" | "association">("club");

  const STOP_WORDS = new Set(["the", "of", "and", "for", "a", "an", "in", "at", "club", "squash", "sports", "centre", "center"]);

  const toSubdomain = (name: string): string => {
    const words = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "";

    // If single meaningful word, take first 5 chars
    const meaningful = words.filter(w => !STOP_WORDS.has(w));
    if (meaningful.length <= 1) {
      return (meaningful[0] || words[0] || "").slice(0, 5);
    }

    // Take first letter of each meaningful word, max 5
    return meaningful.map(w => w[0]).join("").slice(0, 5);
  };

  const handleClubNameChange = (val: string) => {
    setClubName(val);
    setSubdomain(toSubdomain(val));
  };
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Reset form
  const [resetEmail, setResetEmail] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = await captchaRef.current?.execute().catch(() => null);
      if (token) {
        const valid = await verifyCaptchaToken(token);
        if (!valid) { toast.error("Captcha verification failed"); setLoading(false); return; }
      }
      const { error } = await signIn(loginEmail.trim(), loginPassword);
      if (error) toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = signupName.trim();
    const email = signupEmail.trim();
    const phone = signupPhone.trim();
    const club = clubName.trim();
    const sub = subdomain.trim();

    if (!name || name.length < 2) {
      toast.error("Please enter your full name (at least 2 characters)");
      return;
    }
    if (name.length > 100) {
      toast.error("Name must be less than 100 characters");
      return;
    }
    if (!club || club.length < 2) {
      toast.error("Please enter your club name");
      return;
    }
    if (!sub || sub.length < 2 || sub.length > 5 || !/^[a-z0-9]+$/.test(sub)) {
      toast.error("Subdomain must be 2–5 lowercase letters/numbers, no hyphens");
      return;
    }
    if (signupPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (signupPassword !== signupConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (phone && !/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
      toast.error("Please enter a valid phone number");
      return;
    }
    if (!acceptTerms) {
      toast.error("Please accept the Terms of Use and Privacy Policy");
      return;
    }

    setLoading(true);
    try {
      const token = await captchaRef.current?.execute().catch(() => null);
      if (!token) { toast.error("Please complete the captcha verification"); setLoading(false); return; }
      const valid = await verifyCaptchaToken(token);
      if (!valid) { toast.error("Captcha verification failed"); setLoading(false); return; }
    } catch {
      toast.error("Captcha verification failed"); setLoading(false); return;
    }
    setLoading(true);
    const nowIso = new Date().toISOString();
    const { error, userId } = await signUp(email, signupPassword, name, phone || undefined, {
      termsAcceptedAt: nowIso,
      privacyAcceptedAt: nowIso,
    }, { clubName: club, subdomain: sub, registrationType: tenantType === "association" ? "association_owner" : "club_owner" });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Create the club immediately via edge function (before email verification)
    if (userId) {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/create-club`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: anonKey },
            body: JSON.stringify({
              userId,
              clubName: club,
              subdomain: sub,
              userName: name,
              userEmail: email,
              tenantType,
            }),
          }
        );
        const result = await res.json();
        if (!res.ok) {
          toast.error(result.error || "Failed to create club");
          setLoading(false);
          return;
        }
      } catch (err: any) {
        console.error("Club creation failed:", err);
        toast.error("Failed to create club. Please try again.");
        setLoading(false);
        return;
      }
    }

    setSignupDone(true);
    setLoading(false);
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
      <SEO title="Sign In" description="Sign in or create an account for SquashHub — the multi-club squash management platform." path="/auth" noIndex />
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

        <Tabs
          defaultValue="login"
          onValueChange={(v) => {
            if (v === "signup") setTenantType("club");
            if (v === "association") setTenantType("association");
          }}
        >
          <TabsList className="w-full mb-4">
            <TabsTrigger value="login" className="flex-1 text-xs sm:text-sm">Sign In</TabsTrigger>
            <TabsTrigger value="signup" className="flex-1 text-xs sm:text-sm">Register Club</TabsTrigger>
            <TabsTrigger value="association" className="flex-1 text-xs sm:text-sm">Register Association</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card className="p-6">
              <form onSubmit={handleLogin} className="space-y-4">
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
          </TabsContent>

          {(["signup", "association"] as const).map((tabValue) => {
            const isAssoc = tabValue === "association";
            const entityLabel = isAssoc ? "Association" : "Club";
            const entityPlaceholder = isAssoc ? "e.g. Lowveld League Association" : "e.g. CSIR Squash Club";
            const subPlaceholder = isAssoc ? "lowve" : "csir";
            const ctaLabel = isAssoc ? "Create Association" : "Create Club";
            const ctaLoading = isAssoc ? "Creating association..." : "Creating club...";
            return (
              <TabsContent key={tabValue} value={tabValue}>
                {signupDone ? (
                  <Card className="p-6 text-center space-y-4">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h2 className="text-lg font-bold font-heading">Verify Your Email</h2>
                    <p className="text-sm text-muted-foreground">
                      We've sent a verification link to <span className="font-medium text-foreground">{signupEmail}</span>. Click the link to verify your email, create your {entityLabel.toLowerCase()}, and be redirected to your {entityLabel.toLowerCase()}'s login page.
                    </p>
                    {subdomain && (
                      <p className="text-xs text-muted-foreground">
                        Your {entityLabel.toLowerCase()} URL will be: <span className="font-medium text-foreground">{subdomain}.squashhub.co.za</span>
                      </p>
                    )}
                    <Button variant="outline" className="w-full" onClick={() => setSignupDone(false)}>
                      Back to Sign Up
                    </Button>
                  </Card>
                ) : (
                <Card className="p-6">
                  <form onSubmit={handleSignup} className="space-y-3">
                    <div>
                      <Label htmlFor={`signup-name-${tabValue}`}>Full Name <span className="text-destructive">*</span></Label>
                      <Input
                        id={`signup-name-${tabValue}`}
                        type="text"
                        placeholder="John Smith"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        required
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`signup-club-${tabValue}`}>{entityLabel} Name <span className="text-destructive">*</span></Label>
                      <Input
                        id={`signup-club-${tabValue}`}
                        type="text"
                        placeholder={entityPlaceholder}
                        value={clubName}
                        onChange={(e) => handleClubNameChange(e.target.value)}
                        required
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`signup-subdomain-${tabValue}`}>Abbreviation <span className="text-destructive">*</span> <span className="text-[10px] font-normal text-muted-foreground">(you can edit)</span></Label>
                      <div className="flex items-center gap-0">
                        <Input
                          id={`signup-subdomain-${tabValue}`}
                          type="text"
                          placeholder={subPlaceholder}
                          value={subdomain}
                          onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5))}
                          required
                          maxLength={5}
                          className="rounded-r-none border-r-0 w-24"
                        />
                        <span className="inline-flex items-center px-3 h-9 rounded-r-md border border-input bg-muted text-muted-foreground text-xs whitespace-nowrap">
                          .squashhub.co.za
                        </span>
                      </div>
                      {subdomain && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Your {entityLabel.toLowerCase()} URL: <span className="font-medium text-foreground">{subdomain}.squashhub.co.za</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor={`signup-email-${tabValue}`}>Email <span className="text-destructive">*</span></Label>
                      <Input
                        id={`signup-email-${tabValue}`}
                        type="email"
                        placeholder="john@example.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        required
                        maxLength={255}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`signup-phone-${tabValue}`}>Phone Number</Label>
                      <Input
                        id={`signup-phone-${tabValue}`}
                        type="tel"
                        placeholder="+27 82 123 4567"
                        value={signupPhone}
                        onChange={(e) => setSignupPhone(e.target.value)}
                        maxLength={20}
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Optional — used for match reminders</p>
                    </div>
                    <div>
                      <Label htmlFor={`signup-password-${tabValue}`}>Password <span className="text-destructive">*</span></Label>
                      <div className="relative">
                        <Input
                          id={`signup-password-${tabValue}`}
                          type={showPassword ? "text" : "password"}
                          placeholder="Min 6 characters"
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
                      <Label htmlFor={`signup-confirm-${tabValue}`}>Confirm Password <span className="text-destructive">*</span></Label>
                      <Input
                        id={`signup-confirm-${tabValue}`}
                        type="password"
                        placeholder="Re-enter password"
                        value={signupConfirm}
                        onChange={(e) => setSignupConfirm(e.target.value)}
                        required
                        minLength={6}
                      />
                    </div>
                    <HCaptcha ref={captchaRef} />
                    <div className="flex items-start gap-2 pt-1">
                      <Checkbox
                        checked={acceptTerms}
                        onCheckedChange={(v) => setAcceptTerms(v === true)}
                        aria-label="Accept Terms and Privacy Policy"
                      />
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        I agree to the{" "}
                        <Link to="/terms" className="underline decoration-muted-foreground/30 hover:decoration-muted-foreground">
                          Terms of Use
                        </Link>{" "}
                        and{" "}
                        <Link to="/privacy" className="underline decoration-muted-foreground/30 hover:decoration-muted-foreground">
                          Privacy Policy
                        </Link>
                        .
                      </p>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? ctaLoading : ctaLabel}
                    </Button>
                  </form>
                </Card>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </motion.div>
    </div>
  );
}

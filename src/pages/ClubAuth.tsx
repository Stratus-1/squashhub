import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Eye, EyeOff, Building2 } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";
import { PoweredBySquashHub } from "@/components/PoweredBySquashHub";
import { HCaptcha, verifyCaptchaToken } from "@/components/HCaptcha";

export default function ClubAuth() {
  const { signIn, signUp, resetPassword, user } = useAuth();
  const { club, subdomain } = useClubContext();
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Existing member signup
  const [existingEmail, setExistingEmail] = useState("");
  const [existingPassword, setExistingPassword] = useState("");
  const [existingConfirm, setExistingConfirm] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [existingAcceptTerms, setExistingAcceptTerms] = useState(false);

  // New member signup
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirm, setNewConfirm] = useState("");
  const [newAcceptTerms, setNewAcceptTerms] = useState(false);

  // Reset
  const [resetEmail, setResetEmail] = useState("");

  // Redirect if already logged in
  if (user) return <Navigate to="/" replace />;

  const clubName = club?.name || "Club";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (captchaToken) {
      const valid = await verifyCaptchaToken(captchaToken);
      if (!valid) { toast.error("Captcha verification failed"); return; }
    }
    setLoading(true);
    const { error } = await signIn(loginEmail.trim(), loginPassword);
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleExistingMemberSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = existingEmail.trim();
    const memberNum = memberNumber.trim();

    if (!memberNum || memberNum.length < 1) {
      toast.error("Please enter your member number");
      return;
    }
    if (existingPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (existingPassword !== existingConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (!existingAcceptTerms) {
      toast.error("Please accept the Terms of Use and Privacy Policy");
      return;
    }

    if (captchaToken) {
      const valid = await verifyCaptchaToken(captchaToken);
      if (!valid) { toast.error("Captcha verification failed"); return; }
    }
    setLoading(true);
    const nowIso = new Date().toISOString();
    // Pass member_number and club info in metadata so the handle_new_user trigger can link
    const { error } = await signUp(
      email,
      existingPassword,
      memberNum, // name will be populated from club_members record
      undefined,
      { termsAcceptedAt: nowIso, privacyAcceptedAt: nowIso },
      club ? { clubName: club.name, subdomain: subdomain || "" } : undefined
    );
    if (error) {
      toast.error(error.message);
    } else {
      setSignupDone(true);
    }
    setLoading(false);
  };

  const handleNewMemberSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const email = newEmail.trim();
    const phone = newPhone.trim();

    if (!name || name.length < 2) {
      toast.error("Please enter your full name (at least 2 characters)");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== newConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (phone && !/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
      toast.error("Please enter a valid phone number");
      return;
    }
    if (!newAcceptTerms) {
      toast.error("Please accept the Terms of Use and Privacy Policy");
      return;
    }

    if (captchaToken) {
      const valid = await verifyCaptchaToken(captchaToken);
      if (!valid) { toast.error("Captcha verification failed"); return; }
    }
    setLoading(true);
    const nowIso = new Date().toISOString();
    const { error } = await signUp(
      email,
      newPassword,
      name,
      phone || undefined,
      { termsAcceptedAt: nowIso, privacyAcceptedAt: nowIso },
      club ? { clubName: club.name, subdomain: subdomain || "" } : undefined
    );
    if (error) {
      toast.error(error.message);
    } else {
      setSignupDone(true);
    }
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

  const TermsCheckbox = ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
  }) => (
    <div className="flex items-start gap-2 pt-1">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
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
        </Link>.
      </p>
    </div>
  );

  if (showReset) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroBg})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/80 to-background" />
        <SEO title={`Reset Password | ${clubName}`} description="Reset your password." path="/auth" noIndex />
        <motion.div className="w-full max-w-sm relative z-10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
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
          <PoweredBySquashHub />
        </motion.div>
      </div>
    );
  }

  if (signupDone) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroBg})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/80 to-background" />
        <SEO title={`Registration Complete | ${clubName}`} description="Account created." path="/auth" noIndex />
        <motion.div className="w-full max-w-sm relative z-10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold font-heading">Registration Complete! 🎉</h2>
            <p className="text-sm text-muted-foreground">
              Your account has been created successfully. A welcome email has been sent to your inbox. You can now log in.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setSignupDone(false)}>
              Back to Login
            </Button>
          </Card>
          <PoweredBySquashHub />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroBg})` }} />
      <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/80 to-background" />
      <SEO
        title={`Sign In | ${clubName}`}
        description={`Sign in or register for ${clubName} on SquashHub.`}
        path="/auth"
        noIndex
      />
      <motion.div className="w-full max-w-sm relative z-10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Club Header */}
        <div className="text-center mb-6">
          {club?.logo_url ? (
            <img src={club.logo_url} alt={`${clubName} logo`} className="w-16 h-16 object-contain mx-auto rounded-md mb-3" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-7 h-7 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-2xl font-bold font-heading">{clubName}</h1>
          <p className="text-xs text-primary font-mono mt-0.5">{subdomain}.squashhub.co.za</p>
        </div>

        <Tabs defaultValue="login">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="login" className="flex-1">Log In</TabsTrigger>
            <TabsTrigger value="existing" className="flex-1 text-xs">Existing Member Register</TabsTrigger>
            <TabsTrigger value="new" className="flex-1 text-xs">New? Join the Club</TabsTrigger>
          </TabsList>

          {/* ─── LOG IN ─── */}
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
                <HCaptcha onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
                <Button type="button" variant="link" className="w-full text-sm" onClick={() => setShowReset(true)}>
                  Forgot password?
                </Button>
              </form>
            </Card>
          </TabsContent>

          {/* ─── EXISTING MEMBER ─── */}
          <TabsContent value="existing">
            <Card className="p-6">
              <p className="text-xs text-muted-foreground mb-4">
                Already a member of {clubName}? Enter your member number to link your account.
              </p>
              <form onSubmit={handleExistingMemberSignup} className="space-y-3">
                <div>
                  <Label htmlFor="existing-member-number">Member Number <span className="text-destructive">*</span></Label>
                  <Input
                    id="existing-member-number"
                    type="text"
                    placeholder="e.g. WSC001"
                    value={memberNumber}
                    onChange={(e) => setMemberNumber(e.target.value)}
                    required
                    maxLength={20}
                  />
                </div>
                <div>
                  <Label htmlFor="existing-email">Email <span className="text-destructive">*</span></Label>
                  <Input
                    id="existing-email"
                    type="email"
                    placeholder="your@email.com"
                    value={existingEmail}
                    onChange={(e) => setExistingEmail(e.target.value)}
                    required
                    maxLength={255}
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Must match the email on your club membership</p>
                </div>
                <div>
                  <Label htmlFor="existing-password">Create Password <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      id="existing-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 6 characters"
                      value={existingPassword}
                      onChange={(e) => setExistingPassword(e.target.value)}
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
                  <Label htmlFor="existing-confirm">Confirm Password <span className="text-destructive">*</span></Label>
                  <Input
                    id="existing-confirm"
                    type="password"
                    placeholder="Re-enter password"
                    value={existingConfirm}
                    onChange={(e) => setExistingConfirm(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <TermsCheckbox checked={existingAcceptTerms} onCheckedChange={setExistingAcceptTerms} />
                <HCaptcha onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Registering..." : "Register"}
                </Button>
              </form>
            </Card>
          </TabsContent>

          {/* ─── NEW MEMBER ─── */}
          <TabsContent value="new">
            <Card className="p-6">
              <p className="text-xs text-muted-foreground mb-4">
                New to {clubName}? Create an account and complete your profile.
              </p>
              <form onSubmit={handleNewMemberSignup} className="space-y-3">
                <div>
                  <Label htmlFor="new-name">Full Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="new-name"
                    type="text"
                    placeholder="John Smith"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    maxLength={100}
                  />
                </div>
                <div>
                  <Label htmlFor="new-email">Email <span className="text-destructive">*</span></Label>
                  <Input
                    id="new-email"
                    type="email"
                    placeholder="your@email.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                    maxLength={255}
                  />
                </div>
                <div>
                  <Label htmlFor="new-phone">Phone Number</Label>
                  <Input
                    id="new-phone"
                    type="tel"
                    placeholder="+27 82 123 4567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    maxLength={20}
                  />
                </div>
                <div>
                  <Label htmlFor="new-password">Create Password <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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
                  <Label htmlFor="new-confirm">Confirm Password <span className="text-destructive">*</span></Label>
                  <Input
                    id="new-confirm"
                    type="password"
                    placeholder="Re-enter password"
                    value={newConfirm}
                    onChange={(e) => setNewConfirm(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <TermsCheckbox checked={newAcceptTerms} onCheckedChange={setNewAcceptTerms} />
                <HCaptcha onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account..." : "Join Club"}
                </Button>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
        <PoweredBySquashHub />
      </motion.div>
    </div>
  );
}

import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Eye, EyeOff, Building2 } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";
import { PoweredBySquashHub } from "@/components/PoweredBySquashHub";
import { HCaptcha, HCaptchaHandle, verifyCaptchaToken } from "@/components/HCaptcha";
import { fromExt } from "@/lib/supabase-ext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function ClubAuth() {
  const { signIn, signUp, resetPassword, user } = useAuth();
  const { club, subdomain } = useClubContext();
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const captchaRef = useRef<HCaptchaHandle>(null);

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

  // Visitor form
  const [visitorFirstName, setVisitorFirstName] = useState("");
  const [visitorLastName, setVisitorLastName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorHomeClub, setVisitorHomeClub] = useState("");
  const [visitorMemberNumber, setVisitorMemberNumber] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [visitorCategory, setVisitorCategory] = useState("Men");
  const [visitorDone, setVisitorDone] = useState(false);

  // Reset
  const [resetEmail, setResetEmail] = useState("");

  // Home club selection (for association registrations)
  const [homeClubId, setHomeClubId] = useState<string>("");

  // Redirect if already logged in
  if (user) return <Navigate to="/" replace />;

  const clubName = club?.name || "Club";
  const isAssociation = (club as any)?.tenant_type === "association";

  // Fetch all clubs (excluding associations) for the home-club picker
  const { data: pickerClubs } = useQuery({
    queryKey: ["association-picker-clubs"],
    enabled: isAssociation,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, subdomain")
        .neq("tenant_type", "association")
        .not("subdomain", "is", null)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (captchaRef.current) {
        const token = await captchaRef.current.execute();
        const valid = await verifyCaptchaToken(token);
        if (!valid) { toast.error("Captcha verification failed"); setLoading(false); return; }
      }
      const { error } = await signIn(loginEmail.trim(), loginPassword);
      if (error) toast.error(error.message);
    } catch { toast.error("Captcha verification failed"); }
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

    try {
      if (captchaRef.current) {
        const token = await captchaRef.current.execute();
        const valid = await verifyCaptchaToken(token);
        if (!valid) { toast.error("Captcha verification failed"); return; }
      }
    } catch { toast.error("Captcha verification failed"); return; }
    if (isAssociation && !homeClubId) {
      toast.error("Please select your home club");
      return;
    }
    setLoading(true);
    const nowIso = new Date().toISOString();
    const homeClub = pickerClubs?.find((c) => c.id === homeClubId);
    const { error } = await signUp(
      email,
      existingPassword,
      memberNum,
      undefined,
      { termsAcceptedAt: nowIso, privacyAcceptedAt: nowIso },
      club ? {
        clubName: club.name,
        subdomain: subdomain || "",
        registrationType: isAssociation ? "association_member" : "club_member",
        ...(isAssociation && homeClub ? { homeClubId: homeClub.id, homeClubName: homeClub.name, homeClubSubdomain: homeClub.subdomain } : {}),
      } : undefined
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

    try {
      if (captchaRef.current) {
        const token = await captchaRef.current.execute();
        const valid = await verifyCaptchaToken(token);
        if (!valid) { toast.error("Captcha verification failed"); return; }
      }
    } catch { toast.error("Captcha verification failed"); return; }
    if (isAssociation && !homeClubId) {
      toast.error("Please select your home club");
      return;
    }
    setLoading(true);
    const nowIso = new Date().toISOString();
    const homeClub = pickerClubs?.find((c) => c.id === homeClubId);
    const { error } = await signUp(
      email,
      newPassword,
      name,
      phone || undefined,
      { termsAcceptedAt: nowIso, privacyAcceptedAt: nowIso },
      club ? {
        clubName: club.name,
        subdomain: subdomain || "",
        registrationType: isAssociation ? "association_member" : "club_member",
        ...(isAssociation && homeClub ? { homeClubId: homeClub.id, homeClubName: homeClub.name, homeClubSubdomain: homeClub.subdomain } : {}),
      } : undefined
    );
    if (error) {
      toast.error(error.message);
    } else {
      setSignupDone(true);
    }
    setLoading(false);
  };

  const handleVisitorRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const firstName = visitorFirstName.trim();
    const lastName = visitorLastName.trim();
    const phone = visitorPhone.trim();
    const homeClub = visitorHomeClub.trim();
    const memNum = visitorMemberNumber.trim();

    if (!firstName || firstName.length < 2) {
      toast.error("Please enter your first name");
      return;
    }
    if (!lastName || lastName.length < 2) {
      toast.error("Please enter your last name");
      return;
    }
    if (!homeClub || homeClub.length < 2) {
      toast.error("Please enter your home club name");
      return;
    }
    if (phone && !/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
      toast.error("Please enter a valid phone number");
      return;
    }

    if (!club?.id) {
      toast.error("Club not found");
      return;
    }

    setLoading(true);
    try {
      const visEmail = visitorEmail.trim();
      const { error } = await fromExt("club_visitors").insert({
        club_id: club.id,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        email: visEmail || null,
        home_club_name: homeClub,
        member_number: memNum || null,
        category: visitorCategory,
      });
      if (error) {
        toast.error(error.message);
      } else {
        setVisitorDone(true);
        toast.success("Visitor registered successfully!");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to register visitor");
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

  if (visitorDone) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroBg})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/80 to-background" />
        <SEO title={`Visitor Registered | ${clubName}`} description="Visitor registered." path="/auth" noIndex />
        <motion.div className="w-full max-w-sm relative z-10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold font-heading">Welcome, Visitor! 🏸</h2>
            <p className="text-sm text-muted-foreground">
              You've been registered as a visitor at <span className="font-medium text-foreground">{clubName}</span>. The club admin can now select you for tournaments and league matches.
            </p>
            <Button variant="outline" className="w-full" onClick={() => { setVisitorDone(false); setVisitorFirstName(""); setVisitorLastName(""); setVisitorPhone(""); setVisitorEmail(""); setVisitorHomeClub(""); setVisitorMemberNumber(""); setVisitorCategory("Men"); }}>
              Register Another Visitor
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

        {(() => {
          const isAssociation = (club as any)?.tenant_type === "association";
          return (
        <Tabs defaultValue="login">
          <TabsList className={`w-full mb-4 h-auto flex-wrap gap-1`}>
            <TabsTrigger value="login" className="flex-1">Log In</TabsTrigger>
            {!isAssociation && (
              <TabsTrigger value="existing" className="flex-1 text-xs leading-tight py-2 whitespace-normal text-center">Existing<br/>Member</TabsTrigger>
            )}
            <TabsTrigger value="new" className="flex-1 text-xs leading-tight py-2 whitespace-normal text-center">{isAssociation ? "Register" : (<><span>New</span><br/><span>Member</span></>)}</TabsTrigger>
            {!isAssociation && (
              <TabsTrigger value="visitor" className="flex-1 text-xs leading-tight py-2 whitespace-normal text-center">Visitor</TabsTrigger>
            )}
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

          {/* ─── EXISTING MEMBER ─── */}
          <TabsContent value="existing">
            <Card className="p-6">
              <p className="text-xs text-muted-foreground mb-4">
                {isAssociation
                  ? <>Already registered with {clubName}? Enter your <strong>League Number</strong> (e.g. NSF1234) and select your home club to link your account.</>
                  : <>Already a member of {clubName}? Enter your <strong>Member Number</strong> or your <strong>League Number</strong> (e.g. NSF1234) to link your account.</>}
              </p>
              <form onSubmit={handleExistingMemberSignup} className="space-y-3">
                <div>
                  <Label htmlFor="existing-member-number">Member Number or League Number <span className="text-destructive">*</span></Label>
                  <Input
                    id="existing-member-number"
                    type="text"
                    placeholder="e.g. WSC001 or NSF1234"
                    value={memberNumber}
                    onChange={(e) => setMemberNumber(e.target.value)}
                    required
                    maxLength={20}
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">League players use their NSF number; club members use their assigned number</p>
                </div>
                {isAssociation && (
                  <HomeClubField
                    value={homeClubId}
                    onChange={setHomeClubId}
                    clubs={pickerClubs || []}
                  />
                )}
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
                  <p className="text-[10px] text-muted-foreground mt-0.5">We'll save this to your membership for future communication</p>
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
                <HCaptcha ref={captchaRef} />
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
                {isAssociation
                  ? <>New to {clubName}? Create an account and select your home club below.</>
                  : <>New to {clubName}? Create an account and complete your profile.</>}
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
                {isAssociation && (
                  <HomeClubField
                    value={homeClubId}
                    onChange={setHomeClubId}
                    clubs={pickerClubs || []}
                  />
                )}
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
                <HCaptcha ref={captchaRef} />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account..." : "Register"}
                </Button>
              </form>
            </Card>
          </TabsContent>

          {/* ─── VISITOR ─── */}
          <TabsContent value="visitor">
            <Card className="p-6">
              <p className="text-xs text-muted-foreground mb-4">
                Visiting {clubName} for a tournament or league? Register your details below — no account needed.
              </p>
              <form onSubmit={handleVisitorRegister} className="space-y-3">
                <div>
                  <Label htmlFor="visitor-first-name">First Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="visitor-first-name"
                    type="text"
                    placeholder="John"
                    value={visitorFirstName}
                    onChange={(e) => setVisitorFirstName(e.target.value)}
                    required
                    maxLength={50}
                  />
                </div>
                <div>
                  <Label htmlFor="visitor-last-name">Last Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="visitor-last-name"
                    type="text"
                    placeholder="Smith"
                    value={visitorLastName}
                    onChange={(e) => setVisitorLastName(e.target.value)}
                    required
                    maxLength={50}
                  />
                </div>
                <div>
                  <Label htmlFor="visitor-email">Email</Label>
                  <Input
                    id="visitor-email"
                    type="email"
                    placeholder="john@example.com"
                    value={visitorEmail}
                    onChange={(e) => setVisitorEmail(e.target.value)}
                    maxLength={255}
                  />
                </div>
                <div>
                  <Label htmlFor="visitor-category">Category <span className="text-destructive">*</span></Label>
                  <select
                    id="visitor-category"
                    value={visitorCategory}
                    onChange={(e) => setVisitorCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="Men">Men</option>
                    <option value="Ladies">Ladies</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="visitor-phone">Phone Number</Label>
                  <Input
                    id="visitor-phone"
                    type="tel"
                    placeholder="+27 82 123 4567"
                    value={visitorPhone}
                    onChange={(e) => setVisitorPhone(e.target.value)}
                    maxLength={20}
                  />
                </div>
                <div>
                  <Label htmlFor="visitor-home-club">Home Club <span className="text-destructive">*</span></Label>
                  <Input
                    id="visitor-home-club"
                    type="text"
                    placeholder="e.g. Pretoria Squash Club"
                    value={visitorHomeClub}
                    onChange={(e) => setVisitorHomeClub(e.target.value)}
                    required
                    maxLength={100}
                  />
                </div>
                <div>
                  <Label htmlFor="visitor-member-number">Member Number at Home Club</Label>
                  <Input
                    id="visitor-member-number"
                    type="text"
                    placeholder="e.g. PSC042"
                    value={visitorMemberNumber}
                    onChange={(e) => setVisitorMemberNumber(e.target.value)}
                    maxLength={20}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Registering..." : "Register as Visitor"}
                </Button>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
          );
        })()}
        <PoweredBySquashHub />
      </motion.div>
    </div>
  );
}

interface HomeClubFieldProps {
  value: string;
  onChange: (v: string) => void;
  clubs: Array<{ id: string; name: string; subdomain: string | null }>;
}

function HomeClubField({ value, onChange, clubs }: HomeClubFieldProps) {
  return (
    <div>
      <Label htmlFor="home-club">Home Club <span className="text-destructive">*</span></Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="home-club">
          <SelectValue placeholder="Select your home club" />
        </SelectTrigger>
        <SelectContent>
          {clubs.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No clubs available</div>
          ) : (
            clubs.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        Select the club you primarily play for. The association admin will use this to link you correctly.
      </p>
    </div>
  );
}
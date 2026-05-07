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
import heroBg from "@/assets/court-bg.jpg";
import { PoweredBySquashHub } from "@/components/PoweredBySquashHub";
import { HCaptcha, HCaptchaHandle, verifyCaptchaToken } from "@/components/HCaptcha";
import { fromExt } from "@/lib/supabase-ext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LeaguePlayerSignupBanner } from "@/components/LeaguePlayerSignupBanner";

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
  const [existingPhone, setExistingPhone] = useState("");
  const [existingAcceptTerms, setExistingAcceptTerms] = useState(false);
  // Multi-match chooser state
  const [memberChoices, setMemberChoices] = useState<
    Array<{ id: string; masked_name: string; has_number: boolean; has_phone: boolean }>
  >([]);
  const [chosenMemberId, setChosenMemberId] = useState<string>("");

  // League-number signup (CSIR & similar imported-member clubs)
  const [leagueNumber, setLeagueNumber] = useState("");
  const [leagueClubMemberNumber, setLeagueClubMemberNumber] = useState("");
  const [leagueEmail, setLeagueEmail] = useState("");
  const [leaguePhone, setLeaguePhone] = useState("");
  const [leaguePassword, setLeaguePassword] = useState("");
  const [leagueConfirm, setLeagueConfirm] = useState("");
  const [leagueAcceptTerms, setLeagueAcceptTerms] = useState(false);
  const [leagueChoices, setLeagueChoices] = useState<
    Array<{ id: string; masked_name: string; association_name: string }>
  >([]);
  const [chosenLeagueMemberId, setChosenLeagueMemberId] = useState<string>("");

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

  // Controlled tab state — login is the default view; the other "tabs"
  // are reached via links underneath the sign-in form (per UX redesign).
  const [activeTab, setActiveTab] = useState<"login" | "existing" | "new" | "visitor">("login");

  // Redirect if already logged in
  if (user) return <Navigate to="/" replace />;

  const clubName = club?.name || "Club";

  // Friendly handler for "User already registered" errors during signup.
  // Switches the user to the Sign In tab with the email pre-filled and
  // shows an action toast offering a password reset.
  const handleSignupError = (error: { message?: string } | null | undefined, attemptedEmail: string) => {
    const msg = error?.message || "";
    const looksRegistered =
      /already\s+registered|already\s+exists|user\s+already|duplicate|already\s+been\s+registered/i.test(msg);
    if (looksRegistered) {
      const emailLower = attemptedEmail.trim().toLowerCase();
      setLoginEmail(emailLower);
      setActiveTab("login");
      toast.info("This email is already registered", {
        description: "Sign in with your existing password to finish your registration.",
        duration: 8000,
        action: {
          label: "Forgot password",
          onClick: async () => {
            const { error: resetErr } = await resetPassword(emailLower);
            if (resetErr) toast.error(resetErr.message);
            else toast.success("Password reset email sent");
          },
        },
      });
      return;
    }
    toast.error(msg || "Sign-up failed");
  };
  const isAssociation = (club as any)?.tenant_type === "association";
  // NSC-specific: hide the member/league number field on existing-member signup
  // so members only need email + cell phone (numbers are issued by the club).
  const hideMemberNumberField = (subdomain || "").toLowerCase() === "nsc";
  // CSIR-specific: members were imported with their NSA league number only.
  // They register using League Number + Email + Phone + Password — no email verification.
  const useLeagueNumberSignup = (subdomain || "").toLowerCase() === "csir";

  // Fetch only clubs affiliated with this association for the home-club picker
  const { data: pickerClubs } = useQuery({
    queryKey: ["association-picker-clubs", club?.id],
    enabled: isAssociation && !!club?.id,
    queryFn: async () => {
      const { data, error } = await fromExt("association_affiliated_clubs")
        .select("status, clubs:club_id(id, name, subdomain, tenant_type)")
        .eq("association_tenant_id", club!.id)
        .eq("status", "active");
      if (error) throw error;
      const list = (data || [])
        .map((r: any) => r.clubs)
        .filter((c: any) => c && c.tenant_type !== "association")
        .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
      return list as Array<{ id: string; name: string; subdomain: string | null }>;
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
    const phone = existingPhone.trim();

    if (!email) {
      toast.error("Please enter your email");
      return;
    }
    if (!memberNum && !phone) {
      toast.error(
        hideMemberNumberField
          ? "Please enter your cell phone number"
          : "Please enter your member/league number OR your cell phone number"
      );
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
    if (!club?.id) {
      toast.error("Club context not loaded yet — please refresh");
      return;
    }
    if (isAssociation && !homeClubId) {
      toast.error("Please select your home club");
      return;
    }

    setLoading(true);

    // 1) Look up unclaimed shell rows that match (email) AND (number OR phone)
    let matchedMemberId = chosenMemberId || "";
    let matchedNumber = memberNum;
    if (!matchedMemberId) {
      const { data: matches, error: lookupErr } = await (supabase as any).rpc(
        "lookup_existing_member_for_signup",
        {
          _club_id: club.id,
          _email: email,
          _number: memberNum || null,
          _phone: phone || null,
        }
      );
      if (lookupErr) {
        toast.error(lookupErr.message || "Member lookup failed");
        setLoading(false);
        return;
      }
      const rows = (matches || []) as Array<{
        id: string;
        masked_name: string;
        has_number: boolean;
        has_phone: boolean;
      }>;
      if (rows.length === 0) {
        toast.error(
          "We couldn't find a member matching that email and number/phone. Please contact your club admin."
        );
        setLoading(false);
        return;
      }
      if (rows.length > 1) {
        // Show chooser inline; user picks then re-submits
        setMemberChoices(rows);
        toast.message("Multiple members match — please pick which one is you", { duration: 4000 });
        setLoading(false);
        return;
      }
      matchedMemberId = rows[0].id;
    }

    // Captcha after we know we have a real match
    try {
      if (captchaRef.current) {
        const token = await captchaRef.current.execute();
        const valid = await verifyCaptchaToken(token);
        if (!valid) { toast.error("Captcha verification failed"); setLoading(false); return; }
      }
    } catch { toast.error("Captcha verification failed"); setLoading(false); return; }

    const nowIso = new Date().toISOString();
    const homeClub = pickerClubs?.find((c) => c.id === homeClubId);
    // Use whatever identifier the user supplied as the "name slug" passed to signUp
    // (the member-claim flow at AuthCallback links by email + this hint).
    const identifierHint = matchedNumber || phone || "existing-member";
    const { error } = await signUp(
      email,
      existingPassword,
      identifierHint,
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
      handleSignupError(error, email);
    } else {
      setSignupDone(true);
    }
    setLoading(false);
  };

  // CSIR-style: League Number + Email + Phone + Password.
  // The league number is the lookup key against an imported club_members row.
  // Email is required for the auth account but NOT verified — user is signed in immediately.
  const handleLeagueNumberSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const number = leagueNumber.trim().toUpperCase();
    const email = leagueEmail.trim().toLowerCase();
    const phone = leaguePhone.trim();
    const clubMemberNo = leagueClubMemberNumber.trim();

    if (!number) { toast.error("Please enter your league number (e.g. NSF1234)"); return; }
    if (!clubMemberNo) { toast.error("Please enter your club membership number"); return; }
    if (!email) { toast.error("Please enter your email address"); return; }
    if (!phone) { toast.error("Please enter your cell phone number"); return; }
    if (phone.includes("@") || /[a-zA-Z]/.test(phone)) {
      toast.error("Cell phone number should contain only digits — please re-check the Phone field");
      return;
    }
    if (!/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
      toast.error("Please enter a valid cell phone number (digits only)");
      return;
    }
    if (leaguePassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (leaguePassword !== leagueConfirm) { toast.error("Passwords do not match"); return; }
    if (!leagueAcceptTerms) { toast.error("Please accept the Terms of Use and Privacy Policy"); return; }
    if (!club?.id) { toast.error("Club not loaded — please refresh"); return; }

    setLoading(true);

    // 1) Look up the imported member by league number
    let matchedMemberId = chosenLeagueMemberId;
    if (!matchedMemberId) {
      const { data: matches, error: lookupErr } = await (supabase as any).rpc(
        "lookup_member_by_league_number",
        { _club_id: club.id, _league_number: number }
      );
      if (lookupErr) {
        toast.error(lookupErr.message || "Lookup failed");
        setLoading(false);
        return;
      }
      const rows = (matches || []) as Array<{ id: string | null; masked_name: string; association_name: string }>;
      if (rows.length === 0) {
        toast.error("No member found with that league number. Please contact your club admin.");
        setLoading(false);
        return;
      }
      if (rows.length > 1) {
        setLeagueChoices(rows as any);
        toast.message("Multiple members match — please pick which one is you", { duration: 4000 });
        setLoading(false);
        return;
      }
      // id may be null when matched from the imported league roster (no club_member yet)
      matchedMemberId = rows[0].id;
    }

    // 2) Captcha
    try {
      if (captchaRef.current) {
        const token = await captchaRef.current.execute();
        const valid = await verifyCaptchaToken(token);
        if (!valid) { toast.error("Captcha verification failed"); setLoading(false); return; }
      }
    } catch { toast.error("Captcha verification failed"); setLoading(false); return; }

    // 3) Sign up (auto-confirm is on, so session is created immediately)
    const nowIso = new Date().toISOString();
    const { error: signUpErr } = await signUp(
      email,
      leaguePassword,
      number, // identifier hint
      phone,
      { termsAcceptedAt: nowIso, privacyAcceptedAt: nowIso },
      club ? {
        clubName: club.name,
        subdomain: subdomain || "",
        registrationType: "club_member",
      } : undefined
    );
    if (signUpErr) {
      handleSignupError(signUpErr, email);
      setLoading(false);
      return;
    }

    // 4) Sign in (auto-confirm means the account is ready; signUp may already create a session,
    // but we sign in explicitly to be sure auth.uid() is available for the claim RPC).
    const { error: signInErr } = await signIn(email, leaguePassword);
    if (signInErr) {
      toast.error(signInErr.message);
      setLoading(false);
      return;
    }

    // 5) Claim the imported member row by league number (auto-creates if only in platform roster)
    const { error: claimErr } = await (supabase as any).rpc(
      "claim_member_by_league_number",
      {
        _club_member_id: matchedMemberId ?? null,
        _league_number: number,
        _email: email,
        _phone: phone,
        _club_id: club.id,
        _club_member_number: leagueClubMemberNumber.trim() || null,
      }
    );
    if (claimErr) {
      const claimMessage = claimErr.message || "";
      const isAlreadyLinkedRace = claimMessage.includes("No unlinked member matches that league number");

      if (isAlreadyLinkedRace) {
        const { data: authData } = await supabase.auth.getUser();
        const authUserId = authData.user?.id;

        if (authUserId) {
          let linkedMember: { id: string } | null = null;

          if (matchedMemberId) {
            const { data } = await fromExt("club_members")
              .select("id")
              .eq("id", matchedMemberId)
              .eq("club_id", club.id)
              .eq("user_id", authUserId)
              .maybeSingle();
            linkedMember = (data as { id: string } | null) ?? null;
          }

          if (!linkedMember) {
            const { data } = await fromExt("club_members")
              .select("id")
              .eq("club_id", club.id)
              .eq("user_id", authUserId)
              .maybeSingle();
            linkedMember = (data as { id: string } | null) ?? null;
          }

          if (linkedMember) {
            const { data: affiliation } = await fromExt("member_association_affiliations")
              .select("association_id")
              .eq("club_member_id", linkedMember.id)
              .eq("active", true)
              .ilike("league_association_number", number)
              .maybeSingle();

            const memberPatch: Record<string, string | boolean | null> = {
              email,
              phone,
              plays_league: true,
            };

            if (leagueClubMemberNumber.trim()) {
              memberPatch.club_member_number = leagueClubMemberNumber.trim();
            }

            if (affiliation?.association_id) {
              memberPatch.enable_league_association_id = affiliation.association_id;
            }

            const { error: repairErr } = await fromExt("club_members")
              .update(memberPatch)
              .eq("id", linkedMember.id);

            if (!repairErr) {
              toast.success("Welcome! Complete your profile to get started.");
              setLoading(false);
              return;
            }
          }
        }
      }

      console.warn("[CSIR signup] claim failed:", claimErr);
      toast.error(claimMessage || "Could not link your member record");
      setLoading(false);
      return;
    }

    toast.success("Welcome! Complete your profile to get started.");
    setLoading(false);
    // AuthProvider's onAuthStateChange will redirect via <Navigate to="/" /> at top of component.
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
      handleSignupError(error, email);
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
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(11, 31, 80, 0.3)" }} />
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
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(11, 31, 80, 0.3)" }} />
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
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(11, 31, 80, 0.3)" }} />
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
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(11, 31, 80, 0.3)" }} />
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

        {/* NSA league player free-signup CTA */}
        <div className="mb-4">
          <LeaguePlayerSignupBanner clubSubdomain={subdomain || null} clubName={clubName} />
        </div>

        {(() => {
          const isAssociation = (club as any)?.tenant_type === "association";

          // Direct registration on an association tenant is no longer supported.
          // Members join via their home club (one identity, multi-tenant).
          if (isAssociation) {
            return (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} defaultValue="login">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="login" className="flex-1">Sign In</TabsTrigger>
                  <TabsTrigger value="info" className="flex-1">How to join</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <Card className="p-6">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <Label htmlFor="login-email-assoc">Email</Label>
                        <Input id="login-email-assoc" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                      </div>
                      <div>
                        <Label htmlFor="login-password-assoc">Password</Label>
                        <div className="relative">
                          <Input
                            id="login-password-assoc"
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

                <TabsContent value="info">
                  <Card className="p-6 space-y-3">
                    <h3 className="text-sm font-semibold">Joining {clubName}</h3>
                    <p className="text-sm text-muted-foreground">
                      To play in {clubName} fixtures you must register through your <strong>home club</strong> first. Once registered there, you can opt in to {clubName} from your dashboard.
                    </p>
                    <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-5">
                      <li>Sign in or register at your home club's SquashHub site.</li>
                      <li>On your dashboard, click <strong>"Join {clubName}"</strong>.</li>
                      <li>The {clubName} admin will allocate your league number and annual fee.</li>
                    </ol>
                    <p className="text-xs text-muted-foreground pt-2 border-t">
                      Don't see a "Join {clubName}" button? Ask your club admin to affiliate the club with {clubName} first.
                    </p>
                  </Card>
                </TabsContent>
              </Tabs>
            );
          }

          return (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} defaultValue="login">
          {/* Hidden TabsList — navigation now happens via links under each form
              (see UX redesign: Sign In primary, then "Existing member" / "New member" /
              "Visitor" links underneath, mirroring the members app pattern). */}
          <TabsList className="sr-only">
            <TabsTrigger value="login">Log In</TabsTrigger>
            <TabsTrigger value="existing">Existing Member</TabsTrigger>
            <TabsTrigger value="new">New Member</TabsTrigger>
            <TabsTrigger value="visitor">Visitor</TabsTrigger>
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

                {/* Registration links — kept inside the Sign In card so they're
                    legible against the card background, not the court image. */}
                <div className="pt-3 mt-1 border-t border-border/60 space-y-1.5 text-center">
                  <p className="text-xs">
                    <span className="text-muted-foreground">Already a member without a login? </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("existing")}
                      className="text-primary font-medium hover:underline"
                    >
                      Register existing membership
                    </button>
                  </p>
                  <p className="text-xs">
                    <span className="text-muted-foreground">Not a member yet? </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("new")}
                      className="text-primary font-medium hover:underline"
                    >
                      Sign up as a new member
                    </button>
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("visitor")}
                      className="text-[11px] text-muted-foreground hover:text-primary hover:underline"
                    >
                      Visiting? Sign up as a visitor →
                    </button>
                  </div>
                </div>
              </form>
            </Card>
          </TabsContent>

          {/* ─── EXISTING MEMBER ─── */}
          <TabsContent value="existing">
            <Card className="p-6">
              {useLeagueNumberSignup ? (
                <>
                  <p className="text-xs text-muted-foreground mb-4">
                    Already an NSA-registered member of {clubName}? Enter your <strong>League Number</strong> (e.g. NSF1234) and your <strong>Club Membership Number</strong>. Your email and cell phone will be saved to your profile, and your NSA league participation will be enabled automatically.
                  </p>
                  <form onSubmit={handleLeagueNumberSignup} className="space-y-3">
                    <div>
                      <Label htmlFor="league-number">League Number (NSA) <span className="text-destructive">*</span></Label>
                      <Input
                        id="league-number"
                        type="text"
                        placeholder="e.g. NSF1234"
                        value={leagueNumber}
                        onChange={(e) => { setLeagueNumber(e.target.value); setLeagueChoices([]); setChosenLeagueMemberId(""); }}
                        required
                        maxLength={20}
                        autoCapitalize="characters"
                      />
                    </div>

                    <div>
                      <Label htmlFor="league-club-member-no">Club Membership Number <span className="text-destructive">*</span></Label>
                      <Input
                        id="league-club-member-no"
                        type="text"
                        placeholder="Your club membership number"
                        value={leagueClubMemberNumber}
                        onChange={(e) => setLeagueClubMemberNumber(e.target.value)}
                        required
                        maxLength={32}
                      />
                    </div>

                    {leagueChoices.length > 1 && (
                      <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                        <p className="text-xs font-medium">We found multiple matches — pick which one is you:</p>
                        <div className="space-y-1">
                          {leagueChoices.map((m, i) => (
                            <label
                              key={m.id ?? `idx-${i}`}
                              className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 hover:bg-background"
                            >
                              <input
                                type="radio"
                                name="league-choice"
                                value={m.id ?? ""}
                                checked={chosenLeagueMemberId === (m.id ?? "")}
                                onChange={() => setChosenLeagueMemberId(m.id ?? "")}
                              />
                              <span>{m.masked_name}</span>
                              <span className="text-[10px] text-muted-foreground">· {m.association_name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="league-email">Email <span className="text-destructive">*</span></Label>
                      <Input
                        id="league-email"
                        type="email"
                        placeholder="your@email.com"
                        value={leagueEmail}
                        onChange={(e) => setLeagueEmail(e.target.value)}
                        required
                        maxLength={255}
                      />
                    </div>
                    <div>
                      <Label htmlFor="league-phone">Cell Phone Number <span className="text-destructive">*</span></Label>
                      <Input
                        id="league-phone"
                        type="tel"
                        placeholder="e.g. 082 123 4567"
                        value={leaguePhone}
                        onChange={(e) => setLeaguePhone(e.target.value)}
                        required
                        maxLength={20}
                      />
                    </div>
                    <div>
                      <Label htmlFor="league-password">Create Password <span className="text-destructive">*</span></Label>
                      <div className="relative">
                        <Input
                          id="league-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Min 6 characters"
                          value={leaguePassword}
                          onChange={(e) => setLeaguePassword(e.target.value)}
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
                      <Label htmlFor="league-confirm">Confirm Password <span className="text-destructive">*</span></Label>
                      <Input
                        id="league-confirm"
                        type="password"
                        placeholder="Re-enter password"
                        value={leagueConfirm}
                        onChange={(e) => setLeagueConfirm(e.target.value)}
                        required
                        minLength={6}
                      />
                    </div>
                    <TermsCheckbox checked={leagueAcceptTerms} onCheckedChange={setLeagueAcceptTerms} />
                    <HCaptcha ref={captchaRef} />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={loading || (leagueChoices.length > 1 && !chosenLeagueMemberId)}
                    >
                      {loading
                        ? "Registering..."
                        : leagueChoices.length > 1 && !chosenLeagueMemberId
                          ? "Pick which member is you"
                          : "Register"}
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-4">
                    {isAssociation
                      ? <>Already registered with {clubName}? Enter your <strong>email</strong> plus your <strong>League Number</strong> (e.g. NSF1234) <em>or</em> the <strong>cell phone number</strong> on file, then select your home club.</>
                      : hideMemberNumberField
                        ? <>Already a member of {clubName}? Enter your <strong>email</strong> and the <strong>cell phone number</strong> the club has on file. Your member number will be issued by the club.</>
                        : <>Already a member of {clubName}? Enter your <strong>email</strong> plus your <strong>Member/League Number</strong> <em>or</em> the <strong>cell phone number</strong> the club has on file.</>}
                  </p>
                  <form onSubmit={handleExistingMemberSignup} className="space-y-3">
                    <div>
                      <Label htmlFor="existing-email">Email <span className="text-destructive">*</span></Label>
                      <Input
                        id="existing-email"
                        type="email"
                        placeholder="your@email.com"
                        value={existingEmail}
                        onChange={(e) => { setExistingEmail(e.target.value); setMemberChoices([]); setChosenMemberId(""); }}
                        required
                        maxLength={255}
                      />
                    </div>
                    {hideMemberNumberField ? (
                      <div>
                        <Label htmlFor="existing-phone">Cell Phone Number <span className="text-destructive">*</span></Label>
                        <Input
                          id="existing-phone"
                          type="tel"
                          placeholder="e.g. 082 123 4567"
                          value={existingPhone}
                          onChange={(e) => { setExistingPhone(e.target.value); setMemberChoices([]); setChosenMemberId(""); }}
                          maxLength={20}
                          required
                        />
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Use the same cell phone number the club has on file for you.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-input p-3 space-y-3 bg-muted/30">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Provide at least one of the following so we can find you:
                        </p>
                        <div>
                          <Label htmlFor="existing-member-number">Member Number or League Number</Label>
                          <Input
                            id="existing-member-number"
                            type="text"
                            placeholder="e.g. WSC001 or NSF1234"
                            value={memberNumber}
                            onChange={(e) => { setMemberNumber(e.target.value); setMemberChoices([]); setChosenMemberId(""); }}
                            maxLength={20}
                          />
                        </div>
                        <div>
                          <Label htmlFor="existing-phone">Cell Phone Number</Label>
                          <Input
                            id="existing-phone"
                            type="tel"
                            placeholder="+27 82 123 4567"
                            value={existingPhone}
                            onChange={(e) => { setExistingPhone(e.target.value); setMemberChoices([]); setChosenMemberId(""); }}
                            maxLength={20}
                          />
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Use this if your club hasn't given you a number yet.
                          </p>
                        </div>
                      </div>
                    )}

                    {memberChoices.length > 1 && (
                      <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                        <p className="text-xs font-medium">We found multiple matches — pick which one is you:</p>
                        <div className="space-y-1">
                          {memberChoices.map((m) => (
                            <label
                              key={m.id}
                              className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 hover:bg-background"
                            >
                              <input
                                type="radio"
                                name="member-choice"
                                value={m.id}
                                checked={chosenMemberId === m.id}
                                onChange={() => setChosenMemberId(m.id)}
                              />
                              <span>{m.masked_name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {m.has_number ? "· number ✓" : ""} {m.has_phone ? "· phone ✓" : ""}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {isAssociation && (
                      <HomeClubField
                        value={homeClubId}
                        onChange={setHomeClubId}
                        clubs={pickerClubs || []}
                      />
                    )}
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
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={loading || (memberChoices.length > 1 && !chosenMemberId)}
                    >
                      {loading
                        ? "Registering..."
                        : memberChoices.length > 1 && !chosenMemberId
                          ? "Pick which member is you"
                          : "Register"}
                    </Button>
                  </form>
                </>
              )}
            </Card>
            <div className="mt-3 text-center">
              <button type="button" onClick={() => setActiveTab("login")} className="text-xs text-muted-foreground hover:text-primary hover:underline">
                ← Back to Sign in
              </button>
            </div>
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
            <div className="mt-3 text-center">
              <button type="button" onClick={() => setActiveTab("login")} className="text-xs text-muted-foreground hover:text-primary hover:underline">
                ← Back to Sign in
              </button>
            </div>
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
            <div className="mt-3 text-center">
              <button type="button" onClick={() => setActiveTab("login")} className="text-xs text-muted-foreground hover:text-primary hover:underline">
                ← Back to Sign in
              </button>
            </div>
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
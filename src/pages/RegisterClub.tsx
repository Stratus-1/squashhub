import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleSignInButton, GoogleAuthDivider, isGoogleAuthDisabled } from "@/components/GoogleSignInButton";
import { Link, useNavigate } from "react-router-dom";
import { HCaptcha, verifyCaptchaToken, type HCaptchaHandle } from "@/components/HCaptcha";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClub, useCreateClub } from "@/hooks/use-club";
import { supabase } from "@/integrations/supabase/client";
import { getPublicClubBySubdomain } from "@/lib/public-clubs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, Search, CheckCircle2, Users, Clock } from "lucide-react";

interface ClubSearchResult {
  id: string;
  name: string;
  subdomain: string | null;
  tenant_type: string;
  region: string | null;
  parent_association: string | null;
  is_claimable: boolean;
  claim_pending: boolean;
}

const STOP_WORDS = new Set(["squash", "club", "sports", "centre", "center", "the", "and", "of"]);

/** Short initials-based slug: "Alberton Squash Club" -> "asc" */
function initialsSlug(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.map((w) => w[0]).join("");
  if (initials.length >= 2) return initials.slice(0, 5);
  const meaningful = words.filter((w) => !STOP_WORDS.has(w));
  return (meaningful[0] || words[0] || "").slice(0, 5);
}

export default function RegisterClub() {
  const { user, signUp } = useAuth();
  const navigate = useNavigate();
  const captchaRef = useRef<HCaptchaHandle>(null);
  const { data: existing, isLoading } = useMyClub();
  const createClub = useCreateClub();
  const hideGoogleAuth = isGoogleAuthDisabled();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClubSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [claimTarget, setClaimTarget] = useState<ClubSearchResult | null>(null);
  const [claimForm, setClaimForm] = useState({ role: "chairman", phone: "", note: "" });
  const [claimSubmitted, setClaimSubmitted] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", subdomain: "", address: "", email: "", phone: "" });
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  // Account fields — only needed when the visitor has no SquashHub login yet.
  const [account, setAccount] = useState({ fullName: "", email: "", password: "", confirm: "" });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const normaliseSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);

  // Debounced search across every club in the system.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await (supabase.rpc as any)("search_registerable_clubs", { _q: q });
        if (error) throw error;
        setResults((data || []) as ClubSearchResult[]);
      } catch (err) {
        console.warn("Club search failed:", err);
        setResults([]);
      } finally {
        setSearching(false);
        setSearched(true);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  // Live availability check for the abbreviation on the create form.
  useEffect(() => {
    const slug = form.subdomain.trim();
    if (!slug) { setSlugStatus("idle"); return; }
    if (!/^[a-z0-9]{2,5}$/.test(slug)) { setSlugStatus("invalid"); return; }
    setSlugStatus("checking");
    const handle = setTimeout(async () => {
      try {
        const data = await getPublicClubBySubdomain(slug);
        setSlugStatus(data ? "taken" : "available");
      } catch {
        setSlugStatus("idle");
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [form.subdomain]);

  const nearDuplicates = useMemo(
    () => results.filter((r) => r.name.toLowerCase().includes(form.name.trim().toLowerCase()) && form.name.trim().length > 2),
    [results, form.name],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (existing?.club) {
    navigate("/club-admin", { replace: true });
    return null;
  }

  const goToSignIn = () =>
    navigate(`/auth?redirectTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);

  // Deep link: /register-club?claim=<slug> → search the club and auto-open the claim flow.
  const [claimSlug] = useState(() => new URLSearchParams(window.location.search).get("claim"));
  const claimHandled = useRef(false);

  useEffect(() => {
    if (claimSlug && !query) setQuery(claimSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimSlug]);

  useEffect(() => {
    if (!claimSlug || claimHandled.current || user === undefined) return;
    const match = results.find((r) => r.subdomain === claimSlug);
    if (!match) return;
    claimHandled.current = true;
    if (user) setClaimTarget(match);
    else goToSignIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, user, claimSlug]);

  const submitClaim = async () => {
    if (!claimTarget) return;
    if (!user) { goToSignIn(); return; }
    try {
      const { error } = await (supabase.rpc as any)("request_club_claim", {
        _club_id: claimTarget.id,
        _claimed_role: claimForm.role,
        _phone: claimForm.phone,
        _note: claimForm.note,
      });
      if (error) throw error;
      setClaimSubmitted(claimTarget.name);
      setClaimTarget(null);
      toast.success("Claim submitted — we'll review it shortly.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit claim");
    }
  };

  const joinAsMember = (club: ClubSearchResult, claim = false) => {
    if (!club.subdomain) { toast.error("This club has no workspace yet — please contact support."); return; }
    const path = claim ? `/register-club?claim=${club.subdomain}` : "/auth";
    if (window.location.hostname === "localhost") {
      navigate(`/c/${club.subdomain}${path}`);
    } else {
      const parts = window.location.hostname.split(".");
      const baseHost = parts.slice(-3).join(".") === "squashhub.co.za" ? "squashhub.co.za" : parts.slice(-2).join(".");
      window.location.href = `${window.location.protocol}//${club.subdomain}.${baseHost}${path}`;
    }
  };

  const doCreate = async () => {
    try {
      const newClub = await createClub.mutateAsync(form);
      toast.success("Club registered! You are now the club captain.");
      if (newClub.subdomain) {
        if (window.location.hostname === "localhost") {
          navigate(`/c/${newClub.subdomain}/club-admin`);
        } else {
          const baseHost = window.location.hostname.split(".").slice(-2).join(".");
          window.location.href = `${window.location.protocol}//${newClub.subdomain}.${baseHost}/club-admin`;
        }
      } else {
        navigate("/club-admin");
      }
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (/duplicate key|clubs_subdomain_key|unique/i.test(msg)) {
        setSlugStatus("taken");
        toast.error(`The abbreviation "${form.subdomain}" is already taken — please choose another.`);
      } else {
        toast.error(msg || "Failed to register club");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Club name is required"); return; }
    const slug = normaliseSlug(form.subdomain);
    if (slug.length < 2) { toast.error("Abbreviation must be 2-5 letters or numbers"); return; }
    if (slug !== form.subdomain) setForm((p) => ({ ...p, subdomain: slug }));

    const clash = await getPublicClubBySubdomain(slug);
    if (clash) {
      setSlugStatus("taken");
      toast.error(`The abbreviation "${slug}" is already in use — please choose another.`);
      return;
    }

    // Final server-side near-duplicate check on the name.
    const { data } = await (supabase.rpc as any)("search_registerable_clubs", { _q: form.name.trim() });
    const close = ((data || []) as ClubSearchResult[]).filter(
      (r) => r.name.toLowerCase().replace(/[^a-z]/g, "") === form.name.toLowerCase().replace(/[^a-z]/g, ""),
    );
    if (close.length > 0) {
      toast.error(`"${close[0].name}" already exists on SquashHub — please claim it instead of creating a duplicate.`);
      setQuery(form.name.trim());
      setShowCreate(false);
      return;
    }

    if (user) {
      doCreate();
      return;
    }

    // No login yet — create the account first; the club is provisioned after
    // email verification (AuthCallback reads the club metadata).
    const accName = account.fullName.trim();
    const accEmail = account.email.trim();
    if (accName.length < 2) { toast.error("Please enter your full name"); return; }
    if (!accEmail) { toast.error("Please enter your email address"); return; }
    if (account.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (account.password !== account.confirm) { toast.error("Passwords do not match"); return; }
    if (!acceptTerms) { toast.error("Please accept the Terms of Use and Privacy Policy"); return; }

    setAuthBusy(true);
    try {
      const token = await captchaRef.current?.execute().catch(() => null);
      if (!token) { toast.error("Please complete the captcha verification"); return; }
      const valid = await verifyCaptchaToken(token);
      if (!valid) { toast.error("Captcha verification failed"); return; }

      const nowIso = new Date().toISOString();
      const { error } = await signUp(accEmail, account.password, accName, undefined, {
        termsAcceptedAt: nowIso,
        privacyAcceptedAt: nowIso,
      }, { clubName: form.name.trim(), subdomain: slug, registrationType: "club_owner" });
      if (error) { toast.error(error.message); return; }
      setSignupDone(true);
    } finally {
      setAuthBusy(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  if (signupDone) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 flex items-center justify-center">
        <Card className="p-6 space-y-4 text-center max-w-md w-full">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold font-heading">Verify Your Email</h1>
          <p className="text-sm text-muted-foreground">
            We've sent a verification link to <span className="font-medium text-foreground">{account.email}</span>.
            Click the link to verify your email, create your club, and be redirected to your club's login page.
          </p>
          {form.subdomain && (
            <p className="text-xs text-muted-foreground">
              Your club URL will be: <span className="font-medium text-foreground">{form.subdomain}.squashhub.co.za</span>
            </p>
          )}
          <Button variant="outline" className="w-full" onClick={() => setSignupDone(false)}>
            Back
          </Button>
        </Card>
      </div>
    );
  }

  if (claimSubmitted) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-lg mx-auto">
          <Card className="p-6 space-y-3 text-center">
            <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
            <h1 className="text-xl font-bold font-heading">Claim submitted</h1>
            <p className="text-sm text-muted-foreground">
              Your request to manage <strong>{claimSubmitted}</strong> is with our team. Once it's approved you'll get a
              notification and email with a link to your club workspace.
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>Back to home</Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold font-heading">Register Your Club</h1>
            <p className="text-sm text-muted-foreground">
              Most South African squash clubs are already loaded on SquashHub. Search for yours first — claim it instead
              of creating a duplicate.
            </p>
            <p className="text-sm font-medium text-primary">
              Includes a 3-month free trial — no credit card required.
            </p>
          </div>
        </div>

        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="club-search">Find your club</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="club-search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowCreate(false); }}
                placeholder="Club name or town, e.g. Alberton"
                className="pl-9"
                autoFocus
              />
            </div>
            {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
          </div>

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((c) => (
                <div key={c.id} className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[13px]">{c.name}</span>
                      {c.subdomain && (
                        <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{c.subdomain}</code>
                      )}
                      {c.claim_pending ? (
                        <Badge variant="outline" className="text-[10px]"><Clock className="w-3 h-3 mr-1" />Claim under review</Badge>
                      ) : c.is_claimable ? (
                        <Badge variant="secondary" className="text-[10px]">Available to claim</Badge>
                      ) : (
                        <Badge className="text-[10px]">Already active</Badge>
                      )}
                    </div>
                    {(c.parent_association || c.region) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[c.parent_association, c.region].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {c.claim_pending ? (
                    <Button size="sm" variant="ghost" disabled>Pending</Button>
                  ) : c.is_claimable ? (
                    <Button size="sm" onClick={() => joinAsMember(c, true)}>This is my club</Button>
                  ) : (
                    <Button size="sm" onClick={() => joinAsMember(c)}>
                      <Users className="w-3.5 h-3.5 mr-1" />Go to club
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {searched && !searching && (
            <div className="pt-2 border-t">
              {results.length === 0 && (
                <p className="text-xs text-muted-foreground mb-2">No clubs matched “{query}”.</p>
              )}
              {!showCreate ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreate(true);
                    setForm((p) => ({ ...p, name: p.name || query.trim(), subdomain: p.subdomain || initialsSlug(query) }));
                  }}
                >
                  My club isn't listed — create it
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Complete the form below to create a new club.</p>
              )}
            </div>
          )}
        </Card>

        {showCreate && (
          <Card className="p-6">
            {!user && (
              <div className="space-y-4 mb-4">
                {!hideGoogleAuth ? (
                  <>
                    <GoogleSignInButton label="Continue with Google to register" preserveClub={false} />
                    <GoogleAuthDivider />
                  </>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Already have a SquashHub account?{" "}
                  <button type="button" className="underline text-primary" onClick={goToSignIn}>
                    Sign in first
                  </button>{" "}
                  — otherwise fill in your details below and we'll create your account and club together.
                </p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              {!user && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="acc-name">Your Full Name *</Label>
                    <Input
                      id="acc-name"
                      value={account.fullName}
                      onChange={(e) => setAccount((p) => ({ ...p, fullName: e.target.value }))}
                      placeholder="John Smith"
                      maxLength={100}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acc-email">Your Email *</Label>
                    <Input
                      id="acc-email"
                      type="email"
                      value={account.email}
                      onChange={(e) => setAccount((p) => ({ ...p, email: e.target.value }))}
                      placeholder="john@example.com"
                      maxLength={255}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="acc-password">Password *</Label>
                      <Input
                        id="acc-password"
                        type="password"
                        value={account.password}
                        onChange={(e) => setAccount((p) => ({ ...p, password: e.target.value }))}
                        placeholder="Min 6 characters"
                        minLength={6}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="acc-confirm">Confirm Password *</Label>
                      <Input
                        id="acc-confirm"
                        type="password"
                        value={account.confirm}
                        onChange={(e) => setAccount((p) => ({ ...p, confirm: e.target.value }))}
                        placeholder="Re-enter password"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Club Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((p) => ({ ...p, name, subdomain: initialsSlug(name) }));
                  }}
                  placeholder="e.g. Alberton Squash Club"
                  required
                />
                {nearDuplicates.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Similar clubs exist ({nearDuplicates.map((d) => d.name).slice(0, 2).join(", ")}) — please double-check before creating.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="subdomain">Abbreviation <span className="text-xs text-muted-foreground">(you can edit)</span></Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="subdomain"
                    value={form.subdomain}
                    onChange={(e) => setForm((p) => ({ ...p, subdomain: normaliseSlug(e.target.value) }))}
                    placeholder="e.g. asc"
                    maxLength={5}
                    className={`max-w-[120px] ${slugStatus === "taken" || slugStatus === "invalid" ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  />
                  <span className="text-sm text-muted-foreground">.squashhub.co.za</span>
                </div>
                {slugStatus === "checking" && <p className="text-xs text-muted-foreground">Checking availability…</p>}
                {slugStatus === "available" && <p className="text-xs text-emerald-600 dark:text-emerald-400">"{form.subdomain}" is available</p>}
                {slugStatus === "taken" && <p className="text-xs text-destructive">"{form.subdomain}" is already taken — please choose another.</p>}
                {slugStatus === "invalid" && <p className="text-xs text-destructive">Use 2–5 letters or numbers, no spaces or symbols.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={form.address} onChange={set("address")} placeholder="Club address" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Club Email</Label>
                <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="club@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Club Phone</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="+27..." />
              </div>
              {!user && (
                <>
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
                </>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={createClub.isPending || authBusy || slugStatus === "taken" || slugStatus === "invalid" || slugStatus === "checking"}
              >
                {createClub.isPending || authBusy ? "Registering..." : user ? "Register Club" : "Create Account & Register Club"}
              </Button>
            </form>
          </Card>
        )}
      </div>

      <Dialog open={!!claimTarget} onOpenChange={(o) => !o && setClaimTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim {claimTarget?.name}</DialogTitle>
            <DialogDescription>
              Tell us who you are at the club. Our team reviews every claim before granting admin access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Your role at the club</Label>
              <Select value={claimForm.role} onValueChange={(v) => setClaimForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="chairman">Chairman</SelectItem>
                  <SelectItem value="secretary">Secretary</SelectItem>
                  <SelectItem value="captain">Club captain</SelectItem>
                  <SelectItem value="treasurer">Treasurer</SelectItem>
                  <SelectItem value="other">Other committee member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contact number</Label>
              <Input
                value={claimForm.phone}
                onChange={(e) => setClaimForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+27..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>How are you involved with the club?</Label>
              <Textarea
                value={claimForm.note}
                onChange={(e) => setClaimForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="e.g. I've been club secretary since 2023, our league contact is..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimTarget(null)}>Cancel</Button>
            <Button onClick={submitClaim}>Submit claim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

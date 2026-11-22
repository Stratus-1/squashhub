/**
 * /j/:token — junior registration link shared by a junior association.
 *
 * Choose a club (only that association's clubs) → find the player's name →
 * claim the profile, or register a new / unlisted junior with a parent's
 * consent. "My club isn't listed" asks the association to add it.
 * Database RPCs `junior_join_*` are the authority. See src/lib/juniors/join-flow.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Clock, Loader2, LogIn, Search, UserCheck, UserPlus, Users, CheckCircle2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HCaptcha, type HCaptchaHandle, verifyCaptchaToken } from "@/components/HCaptcha";
import { useDuplicateGuard } from "@/components/auth/DuplicateAccountGuard";
import { SEO } from "@/components/SEO";
import { rememberJoinReturn } from "@/lib/tournaments/join-flow";
import {
  clearJuniorPending, guardianProblem, juniorDetailsProblem, juniorJoinPath, needsGuardian, readJuniorPending, saveJuniorPending,
  type JuniorJoinKind, type JuniorPending,
} from "@/lib/juniors/join-flow";

type Club = { club_id: string; club_name: string };
type Me = { member_id: string; name: string; club_name: string; pending: boolean };
type Ctx = { found: boolean; name?: string; kind?: string; clubs?: Club[]; me?: Me[] };
type Found = { member_id: string; display_name: string; has_login: boolean; nsa_on_file: boolean; pending: boolean };
type Step = "club" | "search" | "details" | "account" | "check_email" | "working" | "done" | "awaiting" | "missing" | "missing_sent";

const db = supabase as any;

export default function JuniorJoin() {
  const { token = "" } = useParams<{ token: string }>();
  const { user, loading: authLoading, signIn, signUp } = useAuth();
  const captchaRef = useRef<HCaptchaHandle>(null);
  const dup = useDuplicateGuard();
  const resumed = useRef(false);

  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [clubId, setClubId] = useState("");
  const [clubFilter, setClubFilter] = useState("");
  const [step, setStep] = useState<Step>("club");
  const [kind, setKind] = useState<JuniorJoinKind | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<Found | null>(null);
  const [nsa, setNsa] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [jEmail, setJEmail] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [haveLogin, setHaveLogin] = useState(false);
  const [missing, setMissing] = useState({ club: "", town: "", name: "", phone: "", email: "" });
  const [doneName, setDoneName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { data } = await db.rpc("junior_join_context", { p_token: token });
    setCtx((data ?? { found: false }) as Ctx);
  };
  useEffect(() => { if (!authLoading) load(); /* reload once signed in to list own players */ }, [token, authLoading, user?.id]);

  const club = useMemo(() => ctx?.clubs?.find((c) => c.club_id === clubId) ?? null, [ctx, clubId]);
  const clubs = useMemo(() => {
    const q = clubFilter.trim().toLowerCase();
    return (ctx?.clubs ?? []).filter((c) => !q || c.club_name.toLowerCase().includes(q));
  }, [ctx, clubFilter]);
  const guardian = needsGuardian(dob);

  const pendingFromForm = (): JuniorPending => ({
    token, clubId, kind: kind!, memberId: picked?.member_id ?? null, nsaNumber: nsa.trim() || null,
    name: name.trim(), gender, dob, phone: phone.trim(), email: jEmail.trim().toLowerCase(),
    parentName: parentName.trim(), parentPhone: parentPhone.trim(), parentEmail: parentEmail.trim().toLowerCase(), consent,
    savedAt: Date.now(),
  });

  const finish = async (p: JuniorPending) => {
    setStep("working"); setErr(null);
    try {
      let res: any;
      if (p.kind === "claim") {
        const { data, error } = await db.rpc("junior_join_claim", {
          p_token: p.token, p_member_id: p.memberId, p_nsa_number: p.nsaNumber || null, p_dob: p.dob,
          p_parent_name: p.parentName || null, p_parent_phone: p.parentPhone || null, p_parent_email: p.parentEmail || null,
          p_consent: !!p.consent,
        });
        if (error) throw error; res = data;
      } else {
        const { data, error } = await db.rpc("junior_join_register", {
          p_token: p.token, p_club_id: p.clubId, p_kind: p.kind, p_name: p.name, p_gender: p.gender, p_dob: p.dob,
          p_phone: p.phone || null, p_email: p.email || null, p_parent_name: p.parentName || null,
          p_parent_phone: p.parentPhone || null, p_parent_email: p.parentEmail || null, p_consent: !!p.consent,
          p_nsa_number: p.nsaNumber || null,
        });
        if (error) throw error; res = data;
      }
      clearJuniorPending(p.token);
      setDoneName(p.kind === "claim" ? (picked?.display_name || "") : (p.name || ""));
      setStep(res?.status === "pending_claim" ? "awaiting" : "done");
      load();
    } catch (e: any) {
      setErr(e?.message || "Something went wrong. Please try again.");
      setStep(p.kind === "claim" ? "search" : "details");
    }
  };

  // Back from email confirmation (or a fresh sign-in): finish the saved step.
  useEffect(() => {
    if (resumed.current || authLoading || !user || !ctx?.found) return;
    const p = readJuniorPending(token);
    if (!p) return;
    resumed.current = true;
    setClubId(p.clubId); setKind(p.kind);
    finish(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, ctx?.found, token]);

  const proceed = async () => {
    setErr(null);
    const problem = kind === "claim"
      ? guardianProblem({ dob, parentName, parentPhone, consent })
      : juniorDetailsProblem({ name, gender, dob, parentName, parentPhone, consent });
    if (problem) { setErr(problem); return; }
    if (user) { await finish(pendingFromForm()); return; }
    setStep("account");
  };

  const runSearch = async () => {
    setErr(null); setBusy(true); setPicked(null);
    const { data, error } = await db.rpc("junior_join_find_member", { p_token: token, p_club_id: clubId, p_query: query.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setFound((data ?? []) as Found[]);
  };

  const createOrSignIn = async () => {
    setErr(null);
    const p = kind ? pendingFromForm() : null;
    const em = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) { setErr("Please enter a valid email address."); return; }
    if (password.length < 8) { setErr("The password needs at least 8 characters."); return; }
    setBusy(true);
    try {
      if (haveLogin) {
        const { error } = await signIn(em, password);
        if (error) { setErr("That email and password don't match. Try again or reset your password on the sign-in page."); return; }
        if (p) { saveJuniorPending(p); resumed.current = true; await finish(p); } else setStep("club");
        return;
      }
      const ownerName = parentName.trim() || name.trim();
      if (!(await dup.guard({ name: ownerName, phone: parentPhone.trim() || phone.trim() }))) return;
      try {
        if (captchaRef.current) {
          const t = await captchaRef.current.execute();
          if (!(await verifyCaptchaToken(t))) { setErr("Captcha verification failed"); return; }
        }
      } catch { setErr("Captcha verification failed"); return; }
      if (p) saveJuniorPending(p);
      rememberJoinReturn(juniorJoinPath(token));
      const nowIso = new Date().toISOString();
      const { error } = await signUp(em, password, ownerName, (parentPhone.trim() || phone.trim()) || undefined, { termsAcceptedAt: nowIso, privacyAcceptedAt: nowIso });
      if (error) {
        setErr(/registered|exists/i.test(error.message) ? "This email already has a login. Choose \"I already have a login\"." : error.message);
        return;
      }
      setStep("check_email");
    } finally {
      setBusy(false);
    }
  };

  const sendMissing = async () => {
    setErr(null); setBusy(true);
    const { error } = await db.rpc("junior_join_missing_club", {
      p_token: token, p_club_name: missing.club, p_town: missing.town, p_contact_name: missing.name,
      p_contact_phone: missing.phone, p_contact_email: missing.email || null,
    });
    setBusy(false);
    if (error) setErr(error.message); else setStep("missing_sent");
  };

  const startOver = () => {
    setStep("club"); setClubId(""); setKind(null); setFound(null); setPicked(null); setQuery(""); setNsa("");
    setName(""); setGender(""); setDob(""); setPhone(""); setJEmail(""); setConsent(false); setErr(null);
  };

  if (!ctx) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const guardianFields = (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-xs font-medium">Parent or guardian{guardian ? "" : " (optional from 18)"}</p>
      <div className="space-y-1.5"><Label className="text-xs">Name and surname</Label><Input value={parentName} onChange={(e) => setParentName(e.target.value)} /></div>
      <div className="space-y-1.5"><Label className="text-xs">Cell number</Label><Input inputMode="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} /></div>
      <div className="space-y-1.5"><Label className="text-xs">Email (optional)</Label><Input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} /></div>
      {guardian && (
        <label className="flex items-start gap-2 text-xs">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
          <span>I am this player's parent or guardian. I agree that {ctx.name} and the club may keep these details to register and organise junior squash.</span>
        </label>
      )}
    </div>
  );

  const dobField = (
    <div className="space-y-1.5">
      <Label className="text-xs">Player's date of birth</Label>
      <Input type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} />
      <p className="text-[11px] text-muted-foreground">Kept private. Others only see the age group.</p>
    </div>
  );

  const body = (() => {
    if (!ctx.found) return <p className="text-muted-foreground">This registration link is no longer active. Please ask your junior association for a new one.</p>;
    if (step === "working") return <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving…</p>;
    if (step === "check_email") return (
      <div className="space-y-2">
        <p>We sent a confirmation link to <span className="font-medium">{email}</span>.</p>
        <p className="text-xs text-muted-foreground">Open it on this device. It brings you back here and finishes the registration.</p>
      </div>
    );
    if (step === "done" || step === "awaiting") return (
      <div className="space-y-3">
        <p className="flex items-start gap-2">
          {step === "done" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" /> : <Clock className="mt-0.5 h-4 w-4 text-primary" />}
          {step === "done"
            ? (kind === "claim" ? `${doneName || "The player"} is now linked to your login.` : `${doneName || "The player"} is registered. The club or association will confirm them.`)
            : "Thanks. The club or association will confirm that this profile belongs to you."}
        </p>
        <Button variant="outline" className="w-full" onClick={startOver}><Users className="mr-2 h-4 w-4" />Register another player</Button>
      </div>
    );
    if (step === "missing_sent") return (
      <div className="space-y-3">
        <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />Thanks. {ctx.name} will add the club and let you know.</p>
        <Button variant="outline" className="w-full" onClick={startOver}>Back</Button>
      </div>
    );
    if (step === "missing") return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Tell {ctx.name} which club or school is missing. They'll add it to the list and contact you.</p>
        <div className="space-y-1.5"><Label className="text-xs">Club or school name</Label><Input value={missing.club} onChange={(e) => setMissing({ ...missing, club: e.target.value })} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Town</Label><Input value={missing.town} onChange={(e) => setMissing({ ...missing, town: e.target.value })} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Your name</Label><Input value={missing.name} onChange={(e) => setMissing({ ...missing, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Your cell number</Label><Input inputMode="tel" value={missing.phone} onChange={(e) => setMissing({ ...missing, phone: e.target.value })} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Your email (optional)</Label><Input type="email" value={missing.email} onChange={(e) => setMissing({ ...missing, email: e.target.value })} /></div>
        <Button className="w-full" disabled={busy} onClick={sendMissing}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send to {ctx.name}</Button>
        <button type="button" className="text-xs text-primary underline" onClick={() => setStep("club")}>Back</button>
      </div>
    );

    const mine = ctx.me ?? [];
    return (
      <div className="space-y-4">
        {user && mine.length > 0 && step === "club" && (
          <div className="space-y-1 rounded-md border border-primary/40 bg-primary/5 p-3 text-xs">
            <p className="font-medium">Already registered with your login</p>
            {mine.map((m) => <p key={m.member_id}>{m.name} · {m.club_name}{m.pending ? " · waiting for confirmation" : ""}</p>)}
          </div>
        )}

        {(step === "club" || !club) && step !== "account" && (
          <div className="space-y-2">
            <Label className="text-xs">Which club or school does the player play for?</Label>
            <Input placeholder="Type to filter clubs" value={clubFilter} onChange={(e) => setClubFilter(e.target.value)} />
            <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {clubs.map((c) => (
                <li key={c.club_id}>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                    onClick={() => { setClubId(c.club_id); setStep("search"); setKind("claim"); setFound(null); setPicked(null); setErr(null); }}>
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{c.club_name}
                  </button>
                </li>
              ))}
              {clubs.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">No club matches that name.</li>}
            </ul>
            <button type="button" className="text-xs text-primary underline" onClick={() => { setErr(null); setStep("missing"); }}>My club isn't listed</button>
          </div>
        )}

        {club && step === "search" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium">{club.club_name}</span>
              <button type="button" className="text-primary underline" onClick={() => { setStep("club"); setClubId(""); }}>Change club</button>
            </div>
            <p className="text-xs text-muted-foreground">Search for the player on {club.club_name}'s list.</p>
            <div className="flex gap-2">
              <Input autoFocus placeholder="Player's name, surname or NSA number" value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && query.trim().length >= 3) runSearch(); }} />
              <Button onClick={runSearch} disabled={busy || query.trim().length < 3} aria-label="Search">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
            </div>
            {found && found.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {found.map((f) => (
                  <li key={f.member_id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>{f.display_name}{f.has_login && <span className="block text-xs text-muted-foreground">Already has a SquashHub login</span>}</span>
                    {f.has_login && !user ? (
                      <Button size="sm" variant="outline" onClick={() => { setKind(null); setPicked(null); setHaveLogin(true); setStep("account"); }}>
                        <LogIn className="mr-1 h-3.5 w-3.5" />Sign in
                      </Button>
                    ) : (
                      <Button size="sm" variant={picked?.member_id === f.member_id ? "default" : "outline"}
                        onClick={() => { setPicked(f); setKind("claim"); if (/\d/.test(query)) setNsa(query.trim()); }}>This is the player</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {picked && (
              <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3">
                {picked.nsa_on_file && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">NSA number (links the profile straight away)</Label>
                    <Input value={nsa} onChange={(e) => setNsa(e.target.value)} placeholder="Optional. Without it the club or association confirms" />
                  </div>
                )}
                {!picked.nsa_on_file && !picked.has_login && <p className="text-xs text-muted-foreground">The club or association will confirm this profile belongs to you.</p>}
                {dobField}
                {guardianFields}
                <Button className="w-full" onClick={proceed}>Continue</Button>
              </div>
            )}
            {found && (
              <div className="space-y-2 rounded-md border border-dashed border-border p-3 text-xs">
                <p>{found.length ? "Not on the list?" : `We couldn't find the player on ${club.club_name}'s list.`}</p>
                <Button size="sm" variant="outline" className="h-auto w-full justify-start py-2 text-left" onClick={() => { setKind("existing_unlisted"); setPicked(null); setStep("details"); }}>
                  <UserCheck className="mr-2 h-4 w-4 shrink-0" /><span><span className="block font-medium">Plays at {club.club_name}, just not listed</span><span className="block text-muted-foreground">Add the player as an existing member</span></span>
                </Button>
                <Button size="sm" variant="outline" className="h-auto w-full justify-start py-2 text-left" onClick={() => { setKind("new"); setPicked(null); setStep("details"); }}>
                  <UserPlus className="mr-2 h-4 w-4 shrink-0" /><span><span className="block font-medium">New to {club.club_name}</span><span className="block text-muted-foreground">Register as a new junior</span></span>
                </Button>
              </div>
            )}
            {!user && (
              <button type="button" className="flex items-center gap-1 text-xs text-primary underline" onClick={() => { setKind(null); setPicked(null); setHaveLogin(true); setStep("account"); }}>
                <LogIn className="h-3.5 w-3.5" />I already use SquashHub, sign in
              </button>
            )}
          </div>
        )}

        {club && step === "details" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {kind === "existing_unlisted" ? `Plays at ${club.club_name} but isn't on the list yet.` : `New junior at ${club.club_name}.`} The club or association will confirm the player.
            </p>
            <div className="space-y-1.5"><Label className="text-xs">Player's first name and surname</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Boy or girl</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent><SelectItem value="male">Boy</SelectItem><SelectItem value="female">Girl</SelectItem></SelectContent>
              </Select>
            </div>
            {dobField}
            <div className="space-y-1.5"><Label className="text-xs">Player's own cell (optional)</Label><Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Player's own email (optional)</Label><Input type="email" value={jEmail} onChange={(e) => setJEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">NSA number (optional)</Label><Input value={nsa} onChange={(e) => setNsa(e.target.value)} /></div>
            {guardianFields}
            <Button className="w-full" onClick={proceed}>Continue</Button>
            <button type="button" className="text-xs text-primary underline" onClick={() => setStep("search")}>Back</button>
          </div>
        )}

        {step === "account" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {kind ? "A parent's login can hold several children. Use your own email and password." : "Sign in to see the players linked to your login."}
            </p>
            <div className="flex gap-2 text-xs">
              {kind && <button type="button" className={haveLogin ? "text-muted-foreground underline" : "font-semibold"} onClick={() => setHaveLogin(false)}>Create a login</button>}
              <button type="button" className={haveLogin ? "font-semibold" : "text-muted-foreground underline"} onClick={() => setHaveLogin(true)}>I already have a login</button>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {!haveLogin && <HCaptcha ref={captchaRef} />}
            <Button className="w-full" disabled={busy} onClick={createOrSignIn}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{haveLogin ? "Sign in and continue" : "Create login and continue"}
            </Button>
            {!haveLogin && <p className="text-xs text-muted-foreground">By continuing you accept the SquashHub terms and privacy policy.</p>}
            <button type="button" className="text-xs text-primary underline" onClick={() => setStep(kind === "claim" || (!kind && club) ? "search" : kind ? "details" : "club")}>Back</button>
          </div>
        )}

        {err && <p className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs">{err}</p>}
      </div>
    );
  })();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <SEO title="Junior registration" description="Register as a junior squash player with your club." path={`/j/${token}`} noIndex />
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" />{ctx.name ?? "Junior registration"}</CardTitle>
          {ctx.found && <p className="text-xs text-muted-foreground">Junior player registration · {ctx.clubs?.length ?? 0} clubs</p>}
        </CardHeader>
        <CardContent className="text-sm">{body}</CardContent>
      </Card>
      {dup.dialog}
    </div>
  );
}

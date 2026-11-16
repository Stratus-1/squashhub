/**
 * /t/:champId/join — open entry link for Regional / National tournaments.
 *
 * Players register at THEIR OWN club first (existing user, member found on the
 * list, existing member not on the list, or new member), then land on their
 * personal entry page. See src/lib/tournaments/join-flow.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Search, Trophy, UserCheck, UserPlus, LogIn, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HCaptcha, type HCaptchaHandle, verifyCaptchaToken } from "@/components/HCaptcha";
import { useDuplicateGuard } from "@/components/auth/DuplicateAccountGuard";
import { getTenantAwareAuthRedirect } from "@/lib/site";
import {
  clearPending, detailsProblem, joinPath, readPending, savePending, type JoinKind, type JoinPending,
} from "@/lib/tournaments/join-flow";

type Club = { club_id: string; club_name: string; subdomain: string | null; on_squashhub: boolean; is_host: boolean };
type Me = { member_id: string; club_id: string; club_name: string; name: string; pending: boolean; token: string | null };
type Ctx = {
  found: boolean; open?: boolean; scope?: string; name?: string; host_club_name?: string;
  start_date?: string | null; entries_close?: string | null; fee_cents?: number;
  categories?: string[]; clubs?: Club[]; me?: Me[];
};
type Found = { member_id: string; display_name: string; nsa_on_file: boolean; matched_by: "nsa" | "name"; has_login?: boolean;
  can_activate?: boolean; needs_email?: boolean; email_hint?: string | null };
type Step = "choose" | "search" | "details" | "account" | "check_email" | "awaiting" | "working";

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : null);

export default function TournamentJoin() {
  const { champId = "", subdomain } = useParams<{ champId: string; subdomain?: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, signIn, signUp } = useAuth();
  const captchaRef = useRef<HCaptchaHandle>(null);
  const dup = useDuplicateGuard();

  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [clubId, setClubId] = useState("");
  const [step, setStep] = useState<Step>("choose");
  const [kind, setKind] = useState<JoinKind | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<Found | null>(null);
  const [actEmail, setActEmail] = useState("");
  const [actSent, setActSent] = useState<string | null>(null);
  const [nsa, setNsa] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [haveLogin, setHaveLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const resumed = useRef(false);

  const load = async () => {
    const { data } = await (supabase as any).rpc("tournament_join_context", { p_champ_id: champId });
    setCtx((data ?? { found: false }) as Ctx);
  };
  useEffect(() => { if (!authLoading) load(); /* re-load once signed in to see own profiles */ }, [champId, authLoading, user?.id]);

  const club = useMemo(() => ctx?.clubs?.find((c) => c.club_id === clubId) ?? null, [ctx, clubId]);
  const goEntry = (token: string) => navigate(subdomain ? `/c/${subdomain}/i/${token}` : `/i/${token}`);

  const finish = async (p: JoinPending) => {
    setStep("working"); setErr(null);
    try {
      let res: any;
      if (p.kind === "claim") {
        const { data, error } = await (supabase as any).rpc("tournament_join_claim", {
          p_champ_id: p.champId, p_member_id: p.memberId, p_nsa_number: p.nsaNumber || null, p_phone: p.phone || null,
        });
        if (error) throw error; res = data;
      } else {
        const { data, error } = await (supabase as any).rpc("tournament_join_register", {
          p_champ_id: p.champId, p_club_id: p.clubId, p_kind: p.kind, p_name: p.name, p_gender: p.gender,
          p_phone: p.phone || null, p_email: p.email || user?.email || null,
        });
        if (error) throw error; res = data;
      }
      clearPending(p.champId);
      if (res?.status === "pending_claim") { setStep("awaiting"); return; }
      if (res?.token) goEntry(res.token); else { await load(); setStep("choose"); }
    } catch (e: any) {
      setErr(e?.message || "Something went wrong. Please try again.");
      setStep(p.kind === "claim" ? "search" : "details");
    }
  };

  // Back from email confirmation (or a fresh sign-in): finish the saved step automatically.
  useEffect(() => {
    if (resumed.current || authLoading || !user || !ctx?.found) return;
    const p = readPending(champId);
    if (!p) return;
    resumed.current = true;
    setClubId(p.clubId); setKind(p.kind);
    finish(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, ctx?.found, champId]);

  const pendingFromForm = (): JoinPending => ({
    champId, clubId, kind: kind!, memberId: picked?.member_id ?? null, memberName: picked?.display_name ?? null,
    nsaNumber: nsa.trim() || null, name: name.trim(), gender, phone: phone.trim(), email: email.trim().toLowerCase(),
    savedAt: Date.now(),
  });

  const proceed = async () => {
    setErr(null);
    if (kind !== "claim") {
      const problem = detailsProblem({ name, gender, email }, !user);
      if (problem) { setErr(problem); return; }
    }
    if (user) { await finish(pendingFromForm()); return; }
    setStep("account");
  };

  const runSearch = async () => {
    setErr(null); setBusy(true); setPicked(null); setActSent(null); setActEmail("");
    const { data, error } = await (supabase as any).rpc("tournament_join_find_member", { p_champ_id: champId, p_club_id: clubId, p_query: query.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setFound((data ?? []) as Found[]);
  };

  const ACT_MSG: Record<string, string> = {
    too_soon: "We've just sent you a link. Please check your inbox (and spam) — you can ask again in 10 minutes.",
    email_required: "Please enter a valid email address.",
    email_has_login: "That email already has a SquashHub login. Use \"I already use SquashHub — sign in\" below, then pick your name.",
    email_in_use: "Another member of this club already uses that email. Please use your own email address.",
    has_login: "This profile already has a login. Use \"I already use SquashHub — sign in\" below.",
    not_available: "We can't send a link for this profile. Continue below and the organiser will confirm you.",
    not_open: "Entries through this link are not open.",
  };
  const sendActivation = async () => {
    if (!picked) return;
    setErr(null);
    if (picked.needs_email && !/^\S+@\S+\.\S+$/.test(actEmail.trim())) { setErr("Please enter a valid email address."); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("tournament-join-activation", {
      body: { champ_id: champId, member_id: picked.member_id, email: picked.needs_email ? actEmail.trim().toLowerCase() : undefined },
    });
    setBusy(false);
    const st = error ? "error" : (data as any)?.status;
    if (st === "sent") { setActSent((data as any)?.email_hint || actEmail.trim().toLowerCase()); return; }
    if (st === "not_available") { setPicked({ ...picked, can_activate: false }); }
    setErr(ACT_MSG[st] || "We couldn't send the email. Please try again.");
  };

  const createOrSignIn = async () => {
    setErr(null);
    const p = pendingFromForm();
    const em = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) { setErr("Please enter a valid email address."); return; }
    if (password.length < 8) { setErr("Your password needs at least 8 characters."); return; }
    setBusy(true);
    try {
      if (haveLogin) {
        const { error } = await signIn(em, password);
        if (error) { setErr("That email and password don't match. Try again or reset your password on the sign-in page."); return; }
        savePending(p, joinPath(champId, subdomain));
        resumed.current = true;
        await finish(p);
        return;
      }
      const fullName = p.kind === "claim" ? (p.memberName || name) : p.name || "";
      if (!(await dup.guard({ name: fullName, phone: phone.trim(), claimedOnly: p.kind === "claim" }))) return;
      try {
        if (captchaRef.current) {
          const token = await captchaRef.current.execute();
          if (!(await verifyCaptchaToken(token))) { setErr("Captcha verification failed"); return; }
        }
      } catch { setErr("Captcha verification failed"); return; }
      savePending(p, joinPath(champId, subdomain));
      const nowIso = new Date().toISOString();
      const { error } = await signUp(em, password, fullName, phone.trim() || undefined, { termsAcceptedAt: nowIso, privacyAcceptedAt: nowIso });
      if (error) {
        setErr(/registered|exists/i.test(error.message) ? "This email already has a login. Choose \"I already have a login\"." : error.message);
        return;
      }
      setStep("check_email");
    } finally {
      setBusy(false);
    }
  };

  if (!ctx) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const header = (
    <CardHeader className="space-y-1">
      <CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4 text-primary" />{ctx.name ?? "Tournament"}</CardTitle>
      {ctx.found && (
        <p className="text-xs text-muted-foreground">
          Hosted by {ctx.host_club_name}
          {fmtDate(ctx.start_date) ? ` · starts ${fmtDate(ctx.start_date)}` : ""}
          {fmtDate(ctx.entries_close) ? ` · entries close ${fmtDate(ctx.entries_close)}` : ""}
          {ctx.fee_cents ? ` · entry R${(ctx.fee_cents / 100).toFixed(0)}` : ""}
        </p>
      )}
      {!!ctx.categories?.length && <p className="text-xs text-muted-foreground">Categories: {ctx.categories.join(", ")}</p>}
    </CardHeader>
  );

  const body = (() => {
    if (!ctx.found) return <p className="text-muted-foreground">This tournament link is no longer available.</p>;
    if (!ctx.open) return <p className="text-muted-foreground">Entries through this link are closed. Please contact the organiser.</p>;
    if (step === "working") return <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Setting up your entry…</p>;
    if (step === "check_email") return (
      <div className="space-y-2">
        <p>We sent a confirmation link to <span className="font-medium">{email}</span>.</p>
        <p className="text-xs text-muted-foreground">Open it on this device. It brings you straight back here and opens your tournament entry.</p>
      </div>
    );
    if (step === "awaiting") return (
      <div className="space-y-2">
        <p className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 text-primary" />Thanks — the organiser will confirm that this profile is yours.</p>
        <p className="text-xs text-muted-foreground">Once confirmed, open this same link again to choose your category, partner and payment.</p>
      </div>
    );

    const mine = ctx.me ?? [];
    return (
      <div className="space-y-4">
        {user && mine.length > 0 && (step === "choose" || step === "search") && (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs font-medium">You're signed in</p>
            {mine.map((m) => (
              <Button key={m.member_id} className="w-full justify-start" variant="outline" disabled={busy}
                onClick={async () => {
                  if (m.token) { goEntry(m.token); return; }
                  setBusy(true);
                  const { data, error } = await (supabase as any).rpc("tournament_join_enter", { p_champ_id: champId, p_member_id: m.member_id });
                  setBusy(false);
                  if (error) setErr(error.message); else if (data?.token) goEntry(data.token);
                }}>
                <UserCheck className="mr-2 h-4 w-4" />Enter as {m.name} ({m.club_name}){m.pending ? " · awaiting club" : ""}
              </Button>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Which club do you play for?</Label>
          <Select value={clubId} onValueChange={(v) => { setClubId(v); setStep("search"); setKind("claim"); setFound(null); setPicked(null); setErr(null); }}>
            <SelectTrigger><SelectValue placeholder="Choose your club" /></SelectTrigger>
            <SelectContent>{(ctx.clubs ?? []).map((c) => <SelectItem key={c.club_id} value={c.club_id}>{c.club_name}{c.is_host ? " (host)" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {club && step === "choose" && (
          <Button className="w-full" onClick={() => { setKind("claim"); setStep("search"); }}>
            <Search className="mr-2 h-4 w-4" />Find me at {club.club_name}
          </Button>
        )}

        {club && step === "search" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Search for yourself on {club.club_name}'s list. We'll take you to sign in, claim your profile or register, whichever fits.</p>
            <div className="flex gap-2">
              <Input autoFocus placeholder="Your surname or NSA number" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && query.trim().length >= 3) runSearch(); }} />
              <Button onClick={runSearch} disabled={busy || query.trim().length < 3}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
            </div>
            {found && found.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {found.map((f) => (
                  <li key={f.member_id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {f.display_name}
                      {f.has_login && <span className="block text-xs text-muted-foreground">Already on SquashHub</span>}
                    </span>
                    {f.has_login ? (
                      user ? (
                        <span className="text-right text-xs text-muted-foreground">{mine.some((m) => m.member_id === f.member_id) ? "That's you — use Enter above" : "Linked to another login"}</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => { setKind(null); setPicked(null); setHaveLogin(true); setStep("account"); }}>
                          <LogIn className="mr-1 h-3.5 w-3.5" />Sign in
                        </Button>
                      )
                    ) : (
                      <Button size="sm" variant={picked?.member_id === f.member_id ? "default" : "outline"} onClick={() => { setPicked(f); setName(f.display_name); if (f.matched_by === "nsa") setNsa(query.trim()); }}>This is me</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {picked && !user && picked.can_activate && (
              <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
                {actSent ? (
                  <>
                    <p className="font-medium">Check your email</p>
                    <p className="text-xs text-muted-foreground">We sent your personal activation link to {actSent}. Tap it, choose a password and you'll come straight back here to enter.</p>
                  </>
                ) : picked.needs_email ? (
                  <>
                    <p className="text-xs">You're on {club.club_name}'s list, but the club doesn't have your email yet. Enter it and we'll save it and send your activation link.</p>
                    <Input type="email" placeholder="Your email address" value={actEmail} onChange={(e) => setActEmail(e.target.value)} />
                    <Button className="w-full" disabled={busy} onClick={sendActivation}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save email and send link</Button>
                  </>
                ) : (
                  <>
                    <p className="text-xs">You're on {club.club_name}'s list. We'll email your activation link to {picked.email_hint || "the email the club has for you"}.</p>
                    <Button className="w-full" disabled={busy} onClick={sendActivation}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send my activation link</Button>
                    <p className="text-xs text-muted-foreground">Not your email any more? Ask {club.club_name} to update it.</p>
                  </>
                )}
              </div>
            )}
            {picked && (user || !picked.can_activate) && (
              <div className="space-y-2 rounded-md border border-border p-3">
                {picked.nsa_on_file && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Your NSA number (links your profile straight away)</Label>
                    <Input value={nsa} onChange={(e) => setNsa(e.target.value)} placeholder="Optional — without it the organiser confirms you" />
                  </div>
                )}
                {!picked.nsa_on_file && <p className="text-xs text-muted-foreground">The organiser will confirm this profile is yours.</p>}
                <Button className="w-full" onClick={proceed}>Continue</Button>
              </div>
            )}
            {found && (
              <div className="space-y-2 rounded-md border border-dashed border-border p-3 text-xs">
                <p>{found.length ? "Not you?" : `We couldn't find you on ${club.club_name}'s list.`}</p>
                <Button size="sm" variant="outline" className="h-auto w-full justify-start py-2 text-left" onClick={() => { setKind("existing_unlisted"); setPicked(null); setStep("details"); }}>
                  <UserCheck className="mr-2 h-4 w-4 shrink-0" /><span><span className="block font-medium">I'm a member of {club.club_name}, just not listed</span><span className="block text-muted-foreground">Register as an existing member. No joining fees.</span></span>
                </Button>
                <Button size="sm" variant="outline" className="h-auto w-full justify-start py-2 text-left" onClick={() => { setKind("new"); setPicked(null); setStep("details"); }}>
                  <UserPlus className="mr-2 h-4 w-4 shrink-0" /><span><span className="block font-medium">I'm not a member of {club.club_name}</span><span className="block text-muted-foreground">Join as a new member, then enter</span></span>
                </Button>
              </div>
            )}
            {!user && (
              <button type="button" className="flex items-center gap-1 text-xs text-primary underline" onClick={() => { setKind(null); setPicked(null); setHaveLogin(true); setStep("account"); }}>
                <LogIn className="h-3.5 w-3.5" />I already use SquashHub — sign in
              </button>
            )}
          </div>
        )}

        {club && step === "details" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {kind === "existing_unlisted"
                ? `Existing member of ${club.club_name}, not on the list yet. The club will confirm you; your entry can go ahead meanwhile.`
                : `New member of ${club.club_name}. The club will confirm you; your entry can go ahead meanwhile.`}
            </p>
            <div className="space-y-1.5"><Label className="text-xs">First name and surname</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Cell number</Label><Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            {!user && <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>}
            <Button className="w-full" onClick={proceed}>Continue</Button>
            <button type="button" className="text-xs text-primary underline" onClick={() => setStep("search")}>Back</button>
          </div>
        )}

        {step === "account" && (
          <div className="space-y-3">
            <div className="flex gap-2 text-xs">
              {kind && <button type="button" className={haveLogin ? "text-muted-foreground underline" : "font-semibold"} onClick={() => setHaveLogin(false)}>Create my login</button>}
              <button type="button" className={haveLogin ? "font-semibold" : "text-muted-foreground underline"} onClick={() => setHaveLogin(true)}>I already have a login</button>
            </div>
            {!kind && haveLogin && <p className="text-xs text-muted-foreground">After signing in you'll see your profile and can enter.</p>}
            {kind === "claim" && !haveLogin && (
              <div className="space-y-1.5"><Label className="text-xs">Cell number</Label><Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            )}
            <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {!haveLogin && <HCaptcha ref={captchaRef} />}
            <Button className="w-full" disabled={busy} onClick={async () => {
              if (!kind && haveLogin) {
                setBusy(true);
                const { error } = await signIn(email.trim().toLowerCase(), password);
                setBusy(false);
                if (error) setErr("That email and password don't match."); else setStep("choose");
                return;
              }
              await createOrSignIn();
            }}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{haveLogin ? "Sign in and continue" : "Create login and continue"}
            </Button>
            {!haveLogin && <p className="text-xs text-muted-foreground">By continuing you accept the SquashHub terms and privacy policy.</p>}
            <button type="button" className="text-xs text-primary underline" onClick={() => setStep(kind === "claim" || (!kind && club) ? "search" : kind ? "details" : "choose")}>Back</button>
          </div>
        )}

        {err && <p className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs">{err}</p>}
      </div>
    );
  })();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        {header}
        <CardContent className="text-sm">{body}</CardContent>
      </Card>
      {dup.dialog}
    </div>
  );
}

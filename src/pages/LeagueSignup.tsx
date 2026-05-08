import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SEO } from "@/components/SEO";
import { toast } from "sonner";
import { Trophy, Search, CheckCircle2, Loader2, Crown } from "lucide-react";
import { motion } from "framer-motion";
import shLogo from "@/assets/shub-logo-full.png";

type LookupHit = {
  member_id: string;
  masked_name: string;
  full_name: string;
  gender: string | null;
  club_id: string;
  club_name: string;
  club_subdomain: string | null;
  league_name: string;
  already_claimed: boolean;
};

type SearchHit = {
  member_id: string;
  masked_name: string;
  club_name: string;
  club_subdomain: string | null;
  nsa_number: string;
  already_claimed: boolean;
};

export default function LeagueSignup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const presetClub = params.get("club") || null;
  const presetNsa = params.get("nsa") || "";

  // Step 1 — find player. Always keep an "NSF" prefix so members only type their digits.
  const ensureNsfPrefix = (v: string) => {
    const cleaned = (v || "").toUpperCase().replace(/\s+/g, "");
    const digits = cleaned.replace(/^NSF/, "").replace(/[^0-9]/g, "");
    return `NSF${digits}`;
  };
  const [nsaInput, setNsaInput] = useState(ensureNsfPrefix(presetNsa));
  const [nameQuery, setNameQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [hit, setHit] = useState<LookupHit | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // Step 2 — basics
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [accept, setAccept] = useState(false);

  // Captain
  const [isCaptain, setIsCaptain] = useState(false);
  const [nsaUser, setNsaUser] = useState("");
  const [nsaPass, setNsaPass] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ captain_status: string; club_subdomain: string | null } | null>(null);

  // Auto-lookup on NSA number change (debounced)
  useEffect(() => {
    const q = nsaInput.trim();
    if (q.length < 3) { setHit(null); return; }
    const t = setTimeout(async () => {
      setLookingUp(true);
      const { data, error } = await supabase.rpc("lookup_league_player_by_nsa", {
        _nsa_number: q,
        _club_subdomain: presetClub,
      });
      setLookingUp(false);
      if (error) { console.error(error); return; }
      const row = (data as LookupHit[])?.[0] || null;
      setHit(row);
    }, 350);
    return () => clearTimeout(t);
  }, [nsaInput, presetClub]);

  // Type-ahead by name
  useEffect(() => {
    const q = nameQuery.trim();
    if (q.length < 2) { setSearchHits([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase.rpc("search_league_players_by_name", {
        _query: q,
        _club_subdomain: presetClub,
      });
      setSearching(false);
      if (error) { console.error(error); return; }
      setSearchHits((data as SearchHit[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [nameQuery, presetClub]);

  const canSubmit = useMemo(() => {
    if (!hit || hit.already_claimed) return false;
    if (!email.includes("@")) return false;
    if (password.length < 6) return false;
    if (!accept) return false;
    if (isCaptain && (!nsaUser.trim() || !nsaPass.trim())) return false;
    return true;
  }, [hit, email, password, accept, isCaptain, nsaUser, nsaPass]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !hit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("league-player-signup", {
        body: {
          nsa_number: nsaInput.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
          accept_terms: true,
          captain: isCaptain ? { nsa_username: nsaUser.trim(), nsa_password: nsaPass } : undefined,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setDone({ captain_status: data.captain_status, club_subdomain: data.club_subdomain });
      toast.success("Account created! Check your email to verify.");
    } catch (err: any) {
      toast.error(err.message || "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-primary/5 flex items-center justify-center p-4">
        <SEO title="Welcome to SquashHub" description="Sign in to access your league dashboard." />
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-heading">You're in!</h1>
          <p className="text-sm text-muted-foreground">
            Your account is active. Sign in with your email and password to access your league dashboard.
          </p>
          {done.captain_status === "verified" && (
            <div className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-md p-2 flex items-center gap-2 justify-center">
              <Crown className="w-3.5 h-3.5" /> Captain status verified ✓
            </div>
          )}
          {done.captain_status === "pending" && (
            <div className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-md p-2">
              ⚠ NSA captain credentials couldn't be verified. You're signed up as a player. Update your NSA login from Settings → NSA to unlock captain tools.
            </div>
          )}
          <Button asChild className="w-full">
            <Link to={done.club_subdomain ? `/c/${done.club_subdomain}` : "/"}>Continue</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/5 p-4 md:p-8 pb-24">
      <SEO
        title="Free signup for NSA league players | SquashHub"
        description="Sign up free for SquashHub. View your league fixtures, submit scorecards to NSA, and connect with teammates."
      />
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center space-y-3">
          <img
            src={shLogo}
            alt="SquashHub"
            className="h-20 md:h-24 w-auto mx-auto"
          />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold">
            <Trophy className="w-3.5 h-3.5" /> Free forever for league players
          </div>
          <h1 className="text-3xl md:text-4xl font-bold font-heading leading-tight">
            NSA League Player?
            <span className="block text-xl md:text-2xl font-semibold text-muted-foreground mt-1">
              Sign up in 30 seconds
            </span>
          </h1>
          <div className="text-base md:text-lg text-white max-w-2xl mx-auto space-y-2 leading-relaxed">
            <p>
              View your fixtures, set up league teams for the week ahead, and mark and post league games directly to the NSA site.
            </p>
            <p className="text-base font-semibold text-primary">
              Completely free for every NSA league player.
            </p>
          </div>
        </div>

        <Card className="p-5 md:p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Step 1 — find */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">1</span>
                Find yourself in the NSA roster
              </div>

              <div className="space-y-2">
                <Label htmlFor="nsa">NSA Number</Label>
                <div className="relative">
                  <Input
                    id="nsa"
                    value={nsaInput}
                    onChange={(e) => setNsaInput(ensureNsfPrefix(e.target.value))}
                    onFocus={(e) => {
                      // Park caret after the NSF prefix so users type digits directly.
                      const el = e.currentTarget;
                      requestAnimationFrame(() => {
                        const pos = el.value.length;
                        el.setSelectionRange(Math.max(3, pos), pos);
                      });
                    }}
                    placeholder="NSF12345"
                    className="pr-10 uppercase"
                    style={{ textTransform: "uppercase" }}
                    inputMode="text"
                    autoCapitalize="characters"
                  />
                  {lookingUp && <Loader2 className="w-4 h-4 absolute right-3 top-3 animate-spin text-muted-foreground" />}
                </div>
              </div>

              {!hit && nsaInput.trim().length >= 3 && !lookingUp && (
                <div className="text-xs text-muted-foreground">
                  No match. Try searching by name instead:
                  <div className="relative mt-2">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    <Input
                      value={nameQuery}
                      onChange={(e) => setNameQuery(e.target.value)}
                      placeholder="Type your name…"
                      className="pl-10"
                    />
                  </div>
                  {searchHits.length > 0 && (
                    <div className="mt-2 border rounded-md divide-y max-h-60 overflow-y-auto">
                      {searchHits.map(s => (
                        <button
                          key={s.member_id}
                          type="button"
                          disabled={s.already_claimed}
                          onClick={() => { setNsaInput(ensureNsfPrefix(s.nsa_number)); setNameQuery(""); setSearchHits([]); }}
                          className="w-full text-left px-3 py-2 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
                        >
                          <div>
                            <div className="text-sm font-medium">{s.masked_name}</div>
                            <div className="text-[11px] text-muted-foreground">{s.club_name} • NSA #{s.nsa_number}</div>
                          </div>
                          {s.already_claimed && <span className="text-[10px] text-muted-foreground">Already registered</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {searching && <div className="mt-1 text-xs">Searching…</div>}
                </div>
              )}

              {hit && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-md border p-3 ${hit.already_claimed ? "border-destructive/30 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}
                >
                  {hit.already_claimed ? (
                    <div className="text-sm">
                      <div className="font-semibold text-destructive">Already registered</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {hit.masked_name} at {hit.club_name} has already claimed this NSA number.
                      </div>
                      <Button asChild variant="outline" size="sm" className="mt-2 h-7 text-xs">
                        <Link to={hit.club_subdomain ? `/c/${hit.club_subdomain}` : "/"}>Sign in instead</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <div className="font-semibold">{hit.full_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {hit.club_name} • {hit.league_name}
                          {hit.gender && ` • ${hit.gender}`}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* Step 2 — basics (only when valid hit) */}
            {hit && !hit.already_claimed && (
              <>
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">2</span>
                    Your login details
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required minLength={6} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Cell phone <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27..." />
                  </div>

                  <div className="flex items-start gap-2 pt-1">
                    <Checkbox id="captain" checked={isCaptain} onCheckedChange={(v) => setIsCaptain(!!v)} />
                    <div className="flex-1">
                      <Label htmlFor="captain" className="cursor-pointer flex items-center gap-1.5">
                        <Crown className="w-3.5 h-3.5 text-amber-500" />
                        I'm the team captain
                      </Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Captains submit scorecards to NSA. Enter your NSA admin login to verify.
                      </p>
                    </div>
                  </div>

                  {isCaptain && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 pl-6 border-l-2 border-amber-500/30">
                      <div className="space-y-2">
                        <Label htmlFor="nsau" className="text-xs">NSA admin username</Label>
                        <Input id="nsau" value={nsaUser} onChange={(e) => setNsaUser(e.target.value)} placeholder="e.g. smithj" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nsap" className="text-xs">NSA admin password</Label>
                        <Input id="nsap" type="password" value={nsaPass} onChange={(e) => setNsaPass(e.target.value)} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        We'll verify with NSA right now. If verification fails, you'll still sign up as a player and can fix this later.
                      </p>
                    </motion.div>
                  )}

                  <div className="flex items-start gap-2 pt-1">
                    <Checkbox id="terms" checked={accept} onCheckedChange={(v) => setAccept(!!v)} />
                    <Label htmlFor="terms" className="text-xs cursor-pointer leading-snug">
                      I accept the <Link to="/terms" className="underline">Terms of Use</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.
                    </Label>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={!canSubmit || submitting}>
                  {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating your account…</> : "Create my free account"}
                </Button>
              </>
            )}
          </form>

          <div className="text-center text-xs text-muted-foreground pt-2 border-t">
            Already have an account?{" "}
            <Link to={presetClub ? `/c/${presetClub}` : "/"} className="text-primary underline">Sign in</Link>
          </div>
        </Card>

        <Card className="p-6 md:p-8 text-center space-y-4 border-primary/30 bg-primary/5">
          <h2 className="text-2xl md:text-3xl font-bold font-heading text-primary">
            Are you a club admin?
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto">
            Visit the SquashHub website to see plans, features and pricing for full club administration, finance, court bookings & access control.
          </p>
          <div>
            <a
              href="https://squashhub.co.za"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition"
            >
              Visit squashhub.co.za →
            </a>
          </div>
          <div className="pt-3 border-t border-border/50 space-y-1.5 text-sm">
            <div className="font-semibold text-foreground">Or get in touch:</div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center items-center text-muted-foreground">
              <a
                href="https://wa.me/27833759003"
                target="_blank"
                rel="noopener"
                className="text-primary hover:underline"
              >
                WhatsApp +27 83 375 9003
              </a>
              <span className="hidden sm:inline">·</span>
              <a
                href="mailto:register@squashhub.co.za"
                className="text-primary hover:underline"
              >
                register@squashhub.co.za
              </a>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

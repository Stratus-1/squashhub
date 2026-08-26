import { useParams, Navigate, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Building2, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect } from "react";
import { SEO } from "@/components/SEO";
import { PoweredBySquashHub } from "@/components/PoweredBySquashHub";
import { getPublicClubBySubdomain } from "@/lib/public-clubs";
import { usePublicClubRules } from "@/hooks/use-club-rules";
import { ClubRulesContent } from "@/components/ClubRulesContent";
import { hasRulesContent } from "@/lib/club-rules";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { buildClubPublicUrl } from "@/lib/club-public-url";





interface ClubDelegate {
  id: string;
  name: string | null;
}

interface ClubData {
  id: string;
  name: string;
  subdomain: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  chairman_member_id?: string | null;
  secretary_member_id?: string | null;
  club_captain_member_id?: string | null;
  treasurer_member_id?: string | null;
  show_delegates_on_landing?: boolean;
}

function AnimatedCount({ value }: { value: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest).toString());
  useEffect(() => {
    const controls = animate(count, value, { duration: 1.8, ease: "easeOut" });
    return controls.stop;
  }, [value, count]);
  return <motion.span>{rounded}</motion.span>;
}

interface ClubLandingProps {
  hostClub?: ClubData | null;
  hostSubdomain?: string | null;
}

export default function ClubLanding({ hostClub, hostSubdomain }: ClubLandingProps = {}) {
  const { subdomain } = useParams<{ subdomain: string }>();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  // Signed-in admins can preview the public page with ?preview=1 — otherwise
  // signed-in users are bounced straight to their dashboard.
  const isPreview = searchParams.get("preview") === "1";

  const effectiveSubdomain = subdomain ?? hostSubdomain ?? null;
  const needsQuery = !hostClub && !!effectiveSubdomain;

  const { data: queriedClub, isLoading } = useQuery({
    queryKey: ["club-by-subdomain", effectiveSubdomain],
    queryFn: () => getPublicClubBySubdomain(effectiveSubdomain as string) as Promise<ClubData | null>,
    enabled: needsQuery,
  });

  const club = hostClub ?? queriedClub;
  const loading = needsQuery && isLoading;
  const displaySubdomain = club?.subdomain ?? effectiveSubdomain;

  // Fetch public delegate details via safe security-definer function (no PII exposed)
  const { data: delegates = [] } = useQuery({
    queryKey: ["club-delegates", club?.id],
    queryFn: async () => {
      if (!club?.id) return [];
      const { data, error } = await (supabase.rpc as any)("get_club_delegates_public", { _club_id: club.id });
      if (error) throw error;
      return (data || []).map((d: any) => ({
        id: d.id,
        name: d.name || "Unknown",
      })) as ClubDelegate[];
    },
    enabled: !!club?.id,
  });

  // Fetch member count (public, no PII)
  const { data: memberCount = 0 } = useQuery({
    queryKey: ["club-member-count-public", club?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_club_member_count", { _club_id: club!.id });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: !!club?.id,
  });

  // Fees the club admin flagged for the public page (safe, definer-backed read)
  const { data: publicFees = [] } = useQuery({
    queryKey: ["club-public-fees", club?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_club_public_fees", { _club_id: club!.id });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        name: string;
        description: string | null;
        annual_fee: number;
        billing_period: string | null;
      }>;
    },
    enabled: !!club?.id,
  });

  // Membership rules / constitution the admin flagged for the public page
  const { data: publicRules } = usePublicClubRules(club?.id);

  const formatFee = (amount: number, period?: string | null) => {
    const value = `R${Math.round(Number(amount) || 0).toLocaleString("en-ZA")}`;
    if (!period || period === "annual" || period === "yearly") return `${value} / year`;
    if (period === "monthly") return `${value} / month`;
    if (period === "quarterly") return `${value} / quarter`;
    return value;
  };


  const getDelegateName = (memberId: string | null | undefined) => {
    if (!memberId) return null;
    return delegates.find(d => d.id === memberId) || null;
  };

  const chairmanDelegate = getDelegateName(club?.chairman_member_id);
  const secretaryDelegate = getDelegateName(club?.secretary_member_id);
  const captainDelegate = getDelegateName(club?.club_captain_member_id);
  const treasurerDelegate = getDelegateName(club?.treasurer_member_id);

  const signInUrl = displaySubdomain
    ? buildClubPublicUrl(displaySubdomain, "/auth")
    : "/auth";


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!club) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-4">
        <Building2 className="w-12 h-12 text-muted-foreground" />
        <h1 className="text-xl font-bold font-heading">Club not found</h1>
        <p className="text-sm text-muted-foreground text-center">
          No club with the abbreviation <span className="font-mono font-semibold text-foreground">"{displaySubdomain}"</span> exists.
        </p>
        <Button variant="outline" onClick={() => window.location.href = "/"}>Go Home</Button>
      </div>
    );
  }

  if (!authLoading && user && !isPreview) {
    return <Navigate to={displaySubdomain ? `/?club=${encodeURIComponent(displaySubdomain)}` : "/"} replace />;
  }

  const hasDelegates = chairmanDelegate || secretaryDelegate || captainDelegate || treasurerDelegate;

  return (
    <div className="min-h-screen bg-background">
      {isPreview && user && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-amber-500 text-black text-xs font-medium px-4 py-1.5 shadow-lg">
          Preview mode — this is what visitors see
          <Link to="/" className="underline underline-offset-2 font-semibold">Back to app</Link>
        </div>
      )}
      <SEO
        title={`${club.name} | SquashHub`}
        description={`Join ${club.name} on SquashHub — book courts, track matches, and compete on the ladder.`}
        path={`/c/${displaySubdomain}`}
      />

      <section className="relative overflow-hidden">
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src="/videos/squash-hero.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />

        <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-16">
          <motion.div
            className="w-full max-w-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="rounded-2xl bg-[#07122E]/20 backdrop-blur-md border border-white/20 shadow-2xl p-8 text-center space-y-5">
              {club.logo_url ? (
                <img src={club.logo_url} alt={`${club.name} logo`} loading="eager" fetchPriority="high" decoding="async" className="w-28 h-28 sm:w-32 sm:h-32 object-contain mx-auto rounded-xl shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto shadow-lg">
                  <Building2 className="w-10 h-10 text-primary-foreground" />
                </div>
              )}
              <h1 className="text-3xl sm:text-4xl font-extrabold font-heading tracking-tight text-white">
                {club.name}
              </h1>
              <p className="text-sm font-bold font-mono text-white invisible">{displaySubdomain}.squashhub.co.za</p>

              {memberCount > 0 && (
                <div className="flex items-baseline justify-center gap-2 pt-2">
                  <span className="text-5xl font-extrabold font-heading text-white tabular-nums"><AnimatedCount value={memberCount} /></span>
                  <span className="text-base font-bold text-white/90 uppercase tracking-wide">Squash Members</span>
                </div>
              )}

              {club.address && <p className="text-base text-white/90">{club.address}</p>}
              {(club.email || club.phone) && (
                <p className="text-white/80 text-base font-bold">
                  {club.email}{club.email && club.phone ? " · " : ""}{club.phone}
                </p>
              )}

              {hasDelegates && club.show_delegates_on_landing !== false && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4 text-white">
                  {chairmanDelegate && (
                    <div>
                      <div className="font-bold text-sm">Chairman:</div>
                      <div className="text-sm">{chairmanDelegate.name}</div>
                    </div>
                  )}
                  {secretaryDelegate && (
                    <div>
                      <div className="font-bold text-sm">Secretary:</div>
                      <div className="text-sm">{secretaryDelegate.name}</div>
                    </div>
                  )}
                  {captainDelegate && (
                    <div>
                      <div className="font-bold text-sm">Captain:</div>
                      <div className="text-sm">{captainDelegate.name}</div>
                    </div>
                  )}
                  {treasurerDelegate && (
                    <div>
                      <div className="font-bold text-sm">Treasurer:</div>
                      <div className="text-sm">{treasurerDelegate.name}</div>
                    </div>
                  )}
                </div>
              )}
              {publicFees.length > 0 && (
                <div className="pt-4 text-left">
                  <Collapsible defaultOpen={false}>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white/90 transition-colors hover:bg-white/10"
                      >
                        <span>Membership Fees</span>
                        <ChevronDown className="w-4 h-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-180" />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="rounded-b-xl border-x border-b border-white/15 bg-white/5 p-4 -mt-2 pt-6">
                        <ul className="divide-y divide-white/15 rounded-xl border border-white/15 bg-white/5">
                          {publicFees.map((f) => (
                            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                              <span className="text-sm text-white">{f.name}</span>
                              <span className="text-sm font-bold text-white tabular-nums whitespace-nowrap">
                                {formatFee(f.annual_fee, f.billing_period)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}

              {hasRulesContent(publicRules) && (
                <div id="club-rules" className="pt-4 text-left scroll-mt-8">
                  <Collapsible defaultOpen={false}>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white/90 transition-colors hover:bg-white/10"
                      >
                        <span>Club Rules</span>
                        <ChevronDown className="w-4 h-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-180" />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="rounded-b-xl border-x border-b border-white/15 bg-white/5 p-4 -mt-2 pt-6">
                        <ClubRulesContent
                          rulesText={publicRules?.rules_text}
                          documents={publicRules?.documents}
                          tone="onDark"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}


              <div className="pt-4">

                <Button
                  size="lg"
                  className="w-full gap-2 bg-landing-navy hover:bg-landing-navy/90 text-white rounded-full h-12"
                  onClick={() => { window.location.href = signInUrl; }}
                >
                  Sign in, register, apply for membership
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              <PoweredBySquashHub />
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

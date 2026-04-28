import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PoweredBySquashHub } from "@/components/PoweredBySquashHub";
import { SEO } from "@/components/SEO";
import { motion } from "framer-motion";


interface ClubDelegate {
  id: string;
  name: string | null;
}

interface FeeCategory {
  id: string;
  name: string;
  description: string | null;
  annual_fee: number;
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
}

interface ClubLandingProps {
  hostClub?: ClubData | null;
}

export default function ClubLanding({ hostClub }: ClubLandingProps = {}) {
  const { subdomain } = useParams<{ subdomain: string }>();
  const { user, loading: authLoading } = useAuth();

  const needsQuery = !hostClub && !!subdomain;

  const { data: queriedClub, isLoading } = useQuery({
    queryKey: ["club-by-subdomain", subdomain],
    queryFn: async () => {
      const { data, error } = await fromExt("clubs")
        .select("id, name, subdomain, address, email, phone, logo_url, chairman_member_id, secretary_member_id, club_captain_member_id")
        .eq("subdomain", subdomain!)
        .maybeSingle();
      if (error) throw error;
      return data as ClubData | null;
    },
    enabled: needsQuery,
  });

  const club = hostClub ?? queriedClub;
  const loading = needsQuery && isLoading;
  const displaySubdomain = club?.subdomain ?? subdomain;

  // Fetch delegate details via safe public view (no PII exposed)
  const delegateIds = [club?.chairman_member_id, club?.secretary_member_id, club?.club_captain_member_id].filter(Boolean) as string[];
  const { data: delegates = [] } = useQuery({
    queryKey: ["club-delegates", club?.id, delegateIds.join(",")],
    queryFn: async () => {
      if (delegateIds.length === 0) return [];
      const { data, error } = await fromExt("club_delegates_public")
        .select("id, name")
        .in("id", delegateIds);
      if (error) throw error;
      return (data || []).map((d: any) => ({
        id: d.id,
        name: d.name || "Unknown",
      })) as ClubDelegate[];
    },
    enabled: !!club && delegateIds.length > 0,
  });

  // Fetch fee categories
  const { data: feeCategories = [] } = useQuery({
    queryKey: ["club-fee-categories-public", club?.id],
    queryFn: async () => {
      const { data, error } = await fromExt("member_fee_categories")
        .select("id, name, description, annual_fee")
        .eq("club_id", club!.id)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as FeeCategory[];
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

  const getDelegateName = (memberId: string | null | undefined) => {
    if (!memberId) return null;
    return delegates.find(d => d.id === memberId) || null;
  };

  const chairmanDelegate = getDelegateName(club?.chairman_member_id);
  const secretaryDelegate = getDelegateName(club?.secretary_member_id);
  const captainDelegate = getDelegateName(club?.club_captain_member_id);

  const signInUrl = (() => {
    const clubParam = displaySubdomain ? `club=${encodeURIComponent(displaySubdomain)}` : "";
    const redirect = displaySubdomain
      ? `redirectTo=${encodeURIComponent(`/?club=${displaySubdomain}`)}`
      : "";
    const query = [clubParam, redirect].filter(Boolean).join("&");
    return query ? `/auth?${query}` : "/auth";
  })();

  if (loading || authLoading) {
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

  if (user) {
    return <Navigate to={displaySubdomain ? `/?club=${encodeURIComponent(displaySubdomain)}` : "/"} replace />;
  }

  const hasDelegates = chairmanDelegate || secretaryDelegate || captainDelegate;
  const hasFees = feeCategories.length > 0;

  return (
    <div className="min-h-screen bg-background">
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
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />

        <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-16">
          <motion.div
            className="w-full max-w-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full h-auto p-0 bg-transparent grid grid-cols-2 gap-0 rounded-t-2xl overflow-hidden">
                <TabsTrigger
                  value="details"
                  className="rounded-none rounded-tl-2xl py-4 text-base font-bold font-heading bg-white/90 text-landing-navy data-[state=active]:bg-landing-navy data-[state=active]:text-white shadow-none transition-colors"
                >
                  Club Details
                </TabsTrigger>
                <TabsTrigger
                  value="fees"
                  className="rounded-none rounded-tr-2xl py-4 text-base font-bold font-heading bg-white/90 text-landing-navy data-[state=active]:bg-landing-navy data-[state=active]:text-white shadow-none transition-colors"
                >
                  Membership Fees
                </TabsTrigger>
              </TabsList>

              <div className="rounded-b-2xl bg-[#07122E]/20 backdrop-blur-md border border-white/20 shadow-2xl p-8">
                <TabsContent value="details" className="mt-0 space-y-5 text-center">
                  {club.logo_url ? (
                    <img src={club.logo_url} alt={`${club.name} logo`} className="w-28 h-28 sm:w-32 sm:h-32 object-contain mx-auto rounded-xl shadow-lg" />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto shadow-lg">
                      <Building2 className="w-10 h-10 text-primary-foreground" />
                    </div>
                  )}
                  <h1 className="text-3xl sm:text-4xl font-extrabold font-heading tracking-tight text-white">
                    {club.name}
                  </h1>
                  <p className="text-sm font-bold font-mono text-white invisible">{displaySubdomain}.squashhub.co.za</p>
                  {club.address && <p className="text-base text-white/90">{club.address}</p>}
                  {(club.email || club.phone) && (
                    <p className="text-white/80 text-base font-bold">
                      {club.email}{club.email && club.phone ? " · " : ""}{club.phone}
                    </p>
                  )}

                  {memberCount > 0 && (
                    <div className="flex items-baseline justify-center gap-2 pt-2">
                      <span className="text-5xl font-extrabold font-heading text-white tabular-nums">{memberCount}</span>
                      <span className="text-base font-bold text-white/90 uppercase tracking-wide">Squash Members</span>
                    </div>
                  )}

                  {hasDelegates && (
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
                        <div className="col-span-2">
                          <div className="font-bold text-sm">Captain:</div>
                          <div className="text-sm">{captainDelegate.name}</div>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="fees" className="mt-0 space-y-5">
                  <div className="flex flex-col items-center space-y-3">
                    {club.logo_url ? (
                      <img src={club.logo_url} alt={`${club.name} logo`} className="w-28 h-28 sm:w-32 sm:h-32 object-contain rounded-xl shadow-lg" />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
                        <Building2 className="w-10 h-10 text-primary-foreground" />
                      </div>
                    )}
                    <h1 className="text-3xl sm:text-4xl font-extrabold font-heading tracking-tight text-white">
                      {club.name}
                    </h1>
                  </div>

                  {hasFees ? (
                    <div className="rounded-xl bg-landing-navy/95 overflow-hidden shadow-lg">
                      <table className="w-full text-sm">
                        <tbody>
                          {feeCategories.map((cat, i) => (
                            <tr key={cat.id} className={i > 0 ? "border-t border-white/10" : ""}>
                              <td className="px-4 py-3 text-white font-bold">
                                {cat.name}
                                {cat.description && (
                                  <span className="block text-xs text-white/60 font-normal mt-0.5">{cat.description}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-primary whitespace-nowrap">
                                R{cat.annual_fee}<span className="text-white/60 font-normal">/yr</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-center text-landing-navy/70 py-8">No membership fees configured.</p>
                  )}
                </TabsContent>

                <div className="mt-6">
                  <Button
                    size="lg"
                    className="w-full gap-2 bg-landing-navy hover:bg-landing-navy/90 text-white rounded-full h-12"
                    onClick={() => { window.location.href = signInUrl; }}
                  >
                    Sign In / Register
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex justify-center">
                <PoweredBySquashHub />
              </div>
            </Tabs>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

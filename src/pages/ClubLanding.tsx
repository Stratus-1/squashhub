import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Building2, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PoweredBySquashHub } from "@/components/PoweredBySquashHub";
import { SEO } from "@/components/SEO";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";

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
  const { user } = useAuth();

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
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/70 to-background" />

        <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-16">
          {/* Club header */}
          <motion.div
            className="text-center space-y-3 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {club.logo_url ? (
              <img src={club.logo_url} alt={`${club.name} logo`} className="w-32 h-32 sm:w-36 sm:h-36 object-contain mx-auto rounded-xl shadow-lg" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto shadow-lg">
                <Building2 className="w-10 h-10 text-primary-foreground" />
              </div>
            )}
            <h1 className="text-3xl sm:text-4xl font-extrabold font-heading tracking-tight text-foreground">
              {club.name}
            </h1>
            <p className="text-sm font-mono text-primary">{displaySubdomain}.squashhub.co.za</p>
            {club.address && <p className="text-sm text-muted-foreground">{club.address}</p>}
            {(club.email || club.phone) && (
              <p className="text-xs text-muted-foreground">
                {club.email}{club.email && club.phone ? " · " : ""}{club.phone}
              </p>
            )}
          </motion.div>

          {/* Delegates inline */}
          {hasDelegates && (
            <motion.div
              className="w-full max-w-lg mb-6 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {[
                  { label: "Chairman", delegate: chairmanDelegate },
                  { label: "Secretary", delegate: secretaryDelegate },
                  { label: "Captain", delegate: captainDelegate },
                ].filter(d => d.delegate).map(({ label, delegate }, i, arr) => (
                  <span key={label} className="inline-flex items-center gap-1">
                    <span className="font-medium text-foreground">{label}:</span>
                    <span>{delegate!.name || "—"}</span>
                    {i < arr.length - 1 && <span className="text-border ml-1">·</span>}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {/* Fees - collapsible small section */}
          {hasFees && (
            <motion.div
              className="w-full max-w-sm mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <details className="group">
                <summary className="flex items-center justify-center gap-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none">
                  <span>View Membership Fees</span>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-3 rounded-lg border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      {feeCategories.map((cat, i) => (
                        <tr key={cat.id} className={i > 0 ? "border-t border-border/30" : ""}>
                          <td className="px-3 py-2 text-foreground font-medium">
                            {cat.name}
                            {cat.description && (
                              <span className="block text-[10px] text-muted-foreground font-normal">{cat.description}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-primary whitespace-nowrap">
                            R{cat.annual_fee}<span className="text-muted-foreground font-normal">/yr</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </motion.div>
          )}

          {/* Centered Sign In button */}
          <motion.div
            className="w-full max-w-xs"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={() => { window.location.href = signInUrl; }}
            >
              Sign In / Register
              <ArrowRight className="w-4 h-4" />
            </Button>
            <div className="mt-4">
              <PoweredBySquashHub />
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

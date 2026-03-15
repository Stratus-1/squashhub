import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Building2, ArrowRight, Mail, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PoweredBySquashHub } from "@/components/PoweredBySquashHub";
import { SEO } from "@/components/SEO";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";

interface ClubDelegate {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
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

  // If hostClub is provided (subdomain routing), skip the query
  const needsQuery = !hostClub && !!subdomain;

  const { data: queriedClub, isLoading, error } = useQuery({
    queryKey: ["club-by-subdomain", subdomain],
    queryFn: async () => {
      const { data, error } = await fromExt("clubs")
        .select("id, name, subdomain, address, email, phone, logo_url")
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

  // If user is logged in from path-based club route, keep club context in URL
  if (user) {
    return <Navigate to={displaySubdomain ? `/?club=${encodeURIComponent(displaySubdomain)}` : "/"} replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${club.name} | SquashHub`}
        description={`Join ${club.name} on SquashHub — book courts, track matches, and compete on the ladder.`}
        path={`/c/${displaySubdomain}`}
      />

      {/* Hero with squash court background */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/70 to-background" />

        <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-20">
          <motion.div
            className="max-w-md w-full text-center space-y-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {club.logo_url ? (
              <img src={club.logo_url} alt={`${club.name} logo`} className="w-24 h-24 object-contain mx-auto rounded-xl shadow-lg" />
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
            <div className="pt-3 space-y-3">
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={() => {
                  const clubParam = displaySubdomain ? `club=${encodeURIComponent(displaySubdomain)}` : "";
                  const redirect = displaySubdomain
                    ? `redirectTo=${encodeURIComponent(`/?club=${displaySubdomain}`)}`
                    : "";
                  const query = [clubParam, redirect].filter(Boolean).join("&");
                  window.location.href = query ? `/auth?${query}` : "/auth";
                }}
              >
                Sign In / Register
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
            <PoweredBySquashHub />
          </motion.div>
        </div>
      </section>
    </div>
  );
}

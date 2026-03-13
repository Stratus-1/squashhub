import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";

interface ClubData {
  id: string;
  name: string;
  subdomain: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
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

  // If user is logged in, redirect to dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <SEO
        title={`${club.name} | SquashHub`}
        description={`Join ${club.name} on SquashHub — book courts, track matches, and compete on the ladder.`}
        path={`/c/${displaySubdomain}`}
      />
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        {club.logo_url ? (
          <img src={club.logo_url} alt={`${club.name} logo`} className="w-20 h-20 object-contain mx-auto rounded-md" />
        ) : (
          <Building2 className="w-12 h-12 text-primary mx-auto" />
        )}
        <h1 className="text-2xl font-bold font-heading">{club.name}</h1>
        <p className="text-sm font-mono text-primary">{displaySubdomain}.squashhub.co.za</p>
        {club.address && <p className="text-sm text-muted-foreground">{club.address}</p>}
        <div className="pt-2 space-y-2">
          <Button className="w-full" onClick={() => window.location.href = `/auth`}>
            Sign In / Register
          </Button>
        </div>
      </Card>
    </div>
  );
}

import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";

export default function ClubLanding() {
  const { subdomain } = useParams<{ subdomain: string }>();
  const { user } = useAuth();

  const { data: club, isLoading, error } = useQuery({
    queryKey: ["club-by-subdomain", subdomain],
    queryFn: async () => {
      const { data, error } = await fromExt("clubs")
        .select("id, name, subdomain, address, email, phone, logo_url")
        .eq("subdomain", subdomain!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!subdomain,
  });

  if (isLoading) {
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
          No club with the abbreviation <span className="font-mono font-semibold text-foreground">"{subdomain}"</span> exists.
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
        path={`/c/${subdomain}`}
      />
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        {club.logo_url ? (
          <img src={club.logo_url} alt={`${club.name} logo`} className="w-20 h-20 object-contain mx-auto rounded-md" />
        ) : (
          <Building2 className="w-12 h-12 text-primary mx-auto" />
        )}
        <h1 className="text-2xl font-bold font-heading">{club.name}</h1>
        <p className="text-sm font-mono text-primary">{club.subdomain}.squashhub.app</p>
        {club.address && <p className="text-sm text-muted-foreground">{club.address}</p>}
        <div className="pt-2 space-y-2">
          <Button className="w-full" onClick={() => window.location.href = `/auth?redirectTo=/dashboard`}>
            Sign In / Sign Up
          </Button>
        </div>
      </Card>
    </div>
  );
}

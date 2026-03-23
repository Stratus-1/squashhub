import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";
import { absoluteUrl } from "@/lib/site";
import {
  Building2, ChevronRight, Trophy, Users, Calendar, Swords,
  ArrowRight, Shield, Zap, BarChart3
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";
import shLogoFull from "@/assets/shub-logo-full.jpeg";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

interface ClubPublic {
  id: string;
  name: string;
  subdomain: string | null;
  logo_url: string | null;
  address: string | null;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Public query — anon can read clubs now
  const { data: clubs, isLoading: clubsLoading } = useQuery({
    queryKey: ["public-clubs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, subdomain, logo_url, address")
        .not("subdomain", "is", null)
        .order("name");
      if (error) throw error;
      return (data || []) as ClubPublic[];
    },
    staleTime: 60_000,
  });

  // If logged in, redirect to home (Dashboard)
  if (user) {
    navigate("/", { replace: true });
    return null;
  }

  const features = [
    {
      icon: Calendar,
      title: "Court Bookings",
      description: "Members book courts in seconds with real-time availability and automated light control.",
    },
    {
      icon: Trophy,
      title: "Ladder & Challenges",
      description: "Run an internal ladder with automated rankings, challenge rules, and match tracking.",
    },
    {
      icon: Users,
      title: "Member Management",
      description: "Manage your roster, fee categories, payments, and league registrations in one place.",
    },
    {
      icon: Swords,
      title: "Club Championships",
      description: "Set up round-robin group stages, auto-generate fixtures, and track results live.",
    },
    {
      icon: BarChart3,
      title: "Analytics & Insights",
      description: "Court utilisation, match stats, member activity — all visualised for your committee.",
    },
    {
      icon: Shield,
      title: "Your Own Subdomain",
      description: "Every club gets a branded subdomain (e.g. wsc.squashhub.co.za) for their members.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="SquashHub — Club Management Platform for Squash"
        description="The all-in-one platform for squash clubs. Court bookings, ladders, championships, member management and more."
        path="/"
      />

      {/* ─── Top Bar ─── */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border/40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-heading font-bold text-lg text-foreground tracking-tight">SquashHub</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
              Sign In
            </Button>
            <Button size="sm" onClick={() => navigate("/auth")} className="gap-1.5">
              Register Club
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/70 to-background" />

        <div className="relative max-w-5xl mx-auto px-4 pt-24 pb-20 text-center space-y-6">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <Badge variant="secondary" className="mb-4 text-sm font-medium">
              <Zap className="w-3.5 h-3.5 mr-1" />
              Now open for clubs
            </Badge>
          </motion.div>

          <motion.h1
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold font-heading tracking-tight text-foreground"
          >
            Run your squash club
            <br />
            <span className="text-primary">like a pro</span>
          </motion.h1>

          <motion.p
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Court bookings, ladders, championships, member management, payments and analytics —
            everything your club needs in one platform.
          </motion.p>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3 justify-center pt-2"
          >
            <Button size="lg" onClick={() => navigate("/auth")} className="gap-2">
              Register Your Club
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => {
              document.getElementById("clubs")?.scrollIntoView({ behavior: "smooth" });
            }}>
              Find Your Club
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold font-heading text-center mb-10">
          Everything your club needs
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              {...fadeUp}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <Card className="h-full hover:border-primary/40 transition-colors">
                <CardContent className="p-6 space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Clubs Directory ─── */}
      <section id="clubs" className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold font-heading text-center mb-2">
          Clubs on SquashHub
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Find your club and sign in through their portal.
        </p>

        {clubsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : !clubs || clubs.length === 0 ? (
          <Card className="max-w-md mx-auto text-center p-8">
            <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No clubs registered yet. Be the first!</p>
            <Button className="mt-4" onClick={() => navigate("/auth")}>
              Register Your Club
            </Button>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clubs.map((club) => (
              <Card
                key={club.id}
                className="hover:border-primary/40 transition-colors cursor-pointer group"
                onClick={() => {
                  if (club.subdomain) {
                    // In production, redirect to subdomain. In preview, use path routing.
                    const isPreview = window.location.hostname.includes("lovable");
                    if (isPreview) {
                      navigate(`/c/${club.subdomain}`);
                    } else {
                      window.location.href = `https://${club.subdomain}.squashhub.co.za`;
                    }
                  }
                }}
              >
                <CardContent className="p-5 flex items-center gap-4">
                  {club.logo_url ? (
                    <img
                      src={club.logo_url}
                      alt={`${club.name} logo`}
                      className="w-12 h-12 rounded-md object-contain flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-6 h-6 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground truncate">{club.name}</h3>
                    {club.subdomain && (
                      <p className="text-xs font-mono text-primary">{club.subdomain}.squashhub.co.za</p>
                    )}
                    {club.address && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{club.address}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ─── CTA ─── */}
      <section className="max-w-3xl mx-auto px-4 py-16 text-center">
        <Card className="p-8 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
          <h2 className="text-2xl font-bold font-heading mb-2">Ready to get started?</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Register your club in under 2 minutes. No credit card required.
          </p>
          <Button size="lg" onClick={() => navigate("/auth")} className="gap-2">
            Register Your Club
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Card>
      </section>
    </div>
  );
}

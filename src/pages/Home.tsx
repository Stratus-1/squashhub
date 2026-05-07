import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SEO } from "@/components/SEO";
import {
  Building2, ChevronRight, Landmark, Check,
  AlertCircle, Calendar, Trophy, Users, BarChart3, Mail, Menu,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-court.jpg";
import featureImg from "@/assets/feature-woman-phone.png";
import playerRacketImg from "@/assets/player-racket.jpg";
import playersMatchImg from "@/assets/players-match.jpg";
import shLogoFull from "@/assets/shub-logo-white.png";
import featuresCourtBg from "@/assets/features-court-bg.jpg";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

interface TenantPublic {
  id: string;
  name: string;
  subdomain: string | null;
  logo_url: string | null;
  address: string | null;
  tenant_type: string;
  nsa_club_id: string | null;
  chairman_member_id: string | null;
}

const PROBLEMS = [
  { icon: Calendar, label: "Manual bookings and double-ups" },
  { icon: Users, label: "Disorganized leagues and fixtures" },
  { icon: AlertCircle, label: "Time-consuming admin" },
  { icon: BarChart3, label: "Poor payment tracking" },
  { icon: Trophy, label: "Low member engagement" },
];

const FEATURES = [
  { title: "Court Bookings", desc: "Real-time availability, no conflicts" },
  { title: "Ladders & Challenges", desc: "Automated rankings and match tracking" },
  { title: "Member Management", desc: "Fees, categories, and registrations in one place" },
  { title: "Championships", desc: "Fixtures, results, and formats handled for you" },
  { title: "Analytics", desc: "Clear insights into usage and activity" },
  { title: "Club Portal", desc: "Your own branded subdomain for members" },
];

const BENEFITS = [
  "Save hours of admin",
  "Eliminate booking errors",
  "Increase participation",
  "Track payments easily",
  "Run leagues effortlessly",
  "Improve member experience",
  "Make better decisions with data",
  "Scale without complexity",
  "Look more professional",
  "Grow club revenue",
];

const FAQS = [
  { q: "What is SquashHub?", a: "A squash club management platform for bookings, leagues, members, and payments." },
  { q: "Who is it for?", a: "Clubs and associations across South Africa." },
  { q: "Is it free?", a: "Yes, completely free until September 2026. Final subscription pricing has not yet been finalised, but it will not exceed R5 per member, and a sliding scale will further reduce the per-member rate as your club's membership grows." },
  { q: "How long does setup take?", a: "Setting up your club on the platform is quick and easy — usually under 2 minutes. Onboarding your existing members is the more involved part, but our team will assist you to migrate them across seamlessly. Depending on the size of your club, this may take a bit of time." },
  { q: "Do members need accounts?", a: "Members don't sign up to SquashHub directly — the club creates its own platform on SquashHub, and its members join under the club. Every member has an account with their club, where bookings, participation, and any outstanding fees or payments are reflected." },
  { q: "Can associations use it?", a: "Yes. League associations in smaller or rural areas often don't have a dedicated administrative platform. SquashHub can provide a full association management platform at a small fee, and members affiliated to that league are automatically linked through to the clubs where they play." },
  { q: "Is my data secure?", a: "Yes. The platform runs on secure HTTPS pages and is fully POPIA-aligned, with hCaptcha protection on sign-in and registration to guard against bots and site crawling. Only authorised club admin personnel — such as the Captain, Chairman, Secretary, and Financial Manager — have full admin rights and access to member information." },
];

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ["public-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, subdomain, logo_url, address, tenant_type, nsa_club_id, chairman_member_id")
        .not("subdomain", "is", null)
        .order("name");
      if (error) throw error;
      return (data || []) as TenantPublic[];
    },
    staleTime: 60_000,
  });

  // A club is "live" once an admin (chairman) is assigned. Until then, clicking
  // a club routes NSA players to the /league self-signup flow instead of the
  // tenant portal.
  const allClubs = tenants?.filter((t) => t.tenant_type !== "association") ?? [];
  const liveClubs = allClubs.filter((t) => !!t.chairman_member_id);
  const nsaClubs = allClubs.filter((t) => !t.chairman_member_id);
  const clubs = allClubs;
  const associations = tenants?.filter((t) => t.tenant_type === "association") ?? [];

  if (user) {
    navigate("/", { replace: true });
    return null;
  }

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  const handleMobileNav = (action: () => void) => {
    setMobileMenuOpen(false);
    // Defer so the sheet starts closing first and the target section is reachable.
    setTimeout(action, 50);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="SquashHub — Squash Club Management Software for South Africa"
        description="All-in-one squash club management software for South African clubs and associations. Bookings, leagues, members, and payments, all in one simple platform."
        path="/"
      />

      {/* ─── Hero with Top Bar ─── */}
      <section id="top" className="relative overflow-hidden">
        <video
          className="absolute inset-0 w-full h-full object-cover"
          src="/videos/hero-bg.webm"
          autoPlay
          loop
          muted
          playsInline
          poster={heroBg}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" />

        <header className="relative z-50 pt-4 px-4">
          <div className="max-w-6xl mx-auto h-14 px-4 flex items-center justify-between rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2 min-w-0">
              <img src={shLogoFull} alt="SquashHub" className="h-10 sm:h-12 w-auto object-contain" />
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => scrollTo("top")} className="text-white hover:bg-white/10 hover:text-white">Home</Button>
              <Button variant="ghost" size="sm" onClick={() => scrollTo("features")} className="text-white hover:bg-white/10 hover:text-white">Features</Button>
              <Button variant="ghost" size="sm" onClick={() => scrollTo("pricing")} className="text-white hover:bg-white/10 hover:text-white">Pricing</Button>
            </nav>

            {/* Desktop actions */}
            <div className="hidden md:flex items-center gap-2">
              <Button size="sm" onClick={() => navigate("/league")} className="rounded-full bg-amber-500 text-amber-950 hover:bg-amber-400 border border-amber-300/40 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)] font-semibold">
                <Trophy className="w-3.5 h-3.5 mr-1" /> NSA Player? Register Here
              </Button>
              <Button size="sm" onClick={() => scrollTo("clubs")} className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
                Find/Create My Association
              </Button>
              <Button size="sm" onClick={() => navigate("/auth")} className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
                Register Your Club
              </Button>
            </div>

            {/* Mobile hamburger */}
            <div className="md:hidden">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-white hover:bg-white/10 hover:text-white"
                    aria-label="Open menu"
                  >
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[85vw] max-w-sm bg-background/95 backdrop-blur-xl border-l border-border">
                  <SheetHeader>
                    <SheetTitle className="text-left font-heading uppercase tracking-tight">Menu</SheetTitle>
                  </SheetHeader>
                  <nav className="flex flex-col gap-2 mt-6">
                    <Button variant="ghost" className="justify-start text-base" onClick={() => handleMobileNav(() => scrollTo("top"))}>Home</Button>
                    <Button variant="ghost" className="justify-start text-base" onClick={() => handleMobileNav(() => scrollTo("features"))}>Features</Button>
                    <Button variant="ghost" className="justify-start text-base" onClick={() => handleMobileNav(() => scrollTo("pricing"))}>Pricing</Button>
                    <div className="h-px bg-border my-3" />
                    <Button className="rounded-full w-full bg-amber-500 text-amber-950 hover:bg-amber-400 font-semibold" onClick={() => handleMobileNav(() => navigate("/league"))}>
                      <Trophy className="w-4 h-4 mr-1" /> NSA Player? Register Here
                    </Button>
                    <Button className="rounded-full w-full" onClick={() => handleMobileNav(() => scrollTo("clubs"))}>
                      Find/Create My Association
                    </Button>
                    <Button className="rounded-full w-full" onClick={() => handleMobileNav(() => navigate("/auth"))}>
                      Register Your Club
                    </Button>
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        <div className="relative max-w-6xl mx-auto px-4 pt-12 pb-20">
          <div className="max-w-3xl space-y-6">
            <motion.h1
              {...fadeUp}
              transition={{ duration: 0.5 }}
              className="text-4xl sm:text-5xl font-extrabold font-heading uppercase tracking-tight text-foreground leading-[1.05] md:text-5xl"
            >
              Looking for a platform to{" "}
              <span className="text-landing-navy">run your squash club?</span>
            </motion.h1>

            <motion.p
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-base sm:text-lg text-gray-200 max-w-2xl [text-shadow:_0_2px_8px_rgb(0_0_0_/_70%)]"
            >
              All-in-one squash club management software for South African clubs and associations.
              Bookings, leagues, members, and payments, all in one simple platform.
            </motion.p>

            {/* Stats */}
            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="flex flex-wrap items-center gap-6 pt-2"
            >
              <Stat value={clubs.length} label="Clubs" loading={tenantsLoading} />
              <div className="h-8 w-px bg-border/60" />
              <Stat value={associations.length} label="Leagues & Associations" loading={tenantsLoading} />
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="space-y-2 pt-2"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="lg" onClick={() => scrollTo("clubs")} className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
                  Find/Create My Association
                </Button>
                <Button size="lg" onClick={() => navigate("/auth")} className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
                  Register Your Club
                </Button>
              </div>
              <p className="text-xs text-white/80 drop-shadow">
                Free until September 2026 · No credit card required
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Problem Section ─── */}
      <section className="bg-card/40 border-y border-border/40">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl sm:text-3xl font-extrabold font-heading uppercase tracking-tight text-center mb-10 text-foreground max-w-4xl mx-auto">
            RUNNING A SQUASH CLUB SHOULDN’T {"\n"} BE THIS COMPLICATED
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 max-w-5xl mx-auto">
            {PROBLEMS.map((p, i) => (
              <motion.div
                key={p.label}
                {...fadeUp}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="flex flex-col items-center text-center gap-3"
              >
                <div className="w-12 h-12 rounded-full border border-border bg-background flex items-center justify-center">
                  <p.icon className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm text-foreground font-medium leading-snug">{p.label}</p>
              </motion.div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground text-center max-w-2xl mx-auto mt-10 leading-relaxed">
            These issues don't just slow you down, they hold your club back.
            Missed payments, frustrated members, and hours lost on admin make it
            harder to grow and run a professional club.
          </p>
        </div>
      </section>

      {/* ─── Features / Manage Everything ─── */}
      <section id="features" className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${featuresCourtBg})` }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(11, 31, 80, 0.4)" }}
          aria-hidden="true"
        />
        <div className="relative max-w-6xl mx-auto px-4 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <motion.h2
                {...fadeUp}
                transition={{ duration: 0.5 }}
                className="text-2xl sm:text-3xl md:text-4xl font-extrabold font-heading uppercase tracking-tight text-white"
              >
                <span>MANAGE EVERYTHING IN</span>
                <br />
                <span className="text-landing-navy">ONE PLACE</span>
              </motion.h2>

              <ul className="space-y-3">
                {FEATURES.map((f, i) => (
                  <motion.li
                    key={f.title}
                    {...fadeUp}
                    transition={{ duration: 0.4, delay: i * 0.05 }}
                    className="flex items-start gap-3"
                  >
                    <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <p className="text-sm sm:text-base text-white">
                      <span className="font-semibold">{f.title}:</span>{" "}
                      <span className="text-white/85">{f.desc}</span>
                    </p>
                  </motion.li>
                ))}
              </ul>

              <div className="space-y-2 pt-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button size="lg" onClick={() => scrollTo("clubs")} className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
                    Find/Create My Association
                  </Button>
                  <Button size="lg" onClick={() => navigate("/auth")} className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
                    Register Your Club
                  </Button>
                </div>
                <p className="text-xs text-white/80 drop-shadow">
                  Free until September 2026 · No credit card required
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ─── Why use SquashHub (benefits grid) ─── */}
      <section className="relative overflow-hidden border-y border-border/40">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${playersMatchImg})` }}
        />
        <div className="absolute inset-0 bg-neutral-950/90 backdrop-blur-sm" />
        <div className="relative max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl sm:text-3xl font-extrabold font-heading uppercase tracking-tight text-center mb-10 text-white">
            Why use SquashHub
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5 max-w-5xl mx-auto">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={b}
                {...fadeUp}
                transition={{ duration: 0.4, delay: i * 0.04 }}
                className="flex flex-col items-center text-center gap-3"
              >
                <div className="w-14 h-14 rounded-xl bg-white border border-white/20 shadow-sm flex items-center justify-center">
                  <Check className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm text-white font-medium leading-snug">{b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Directory ─── */}
      <section id="clubs" className="max-w-6xl mx-auto px-4 py-20 space-y-14">
        {tenantsLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Live Clubs */}
            <Card className="bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 rounded-2xl text-white shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
              <CardContent className="p-6 sm:p-8 space-y-5">
                <div>
                  <h3 className="text-lg font-extrabold font-heading uppercase tracking-tight text-white">
                    Live Clubs
                  </h3>
                  <p className="text-sm text-white/60 mt-1">
                    Clubs fully set up on SquashHub. Sign in via their portal.
                  </p>
                </div>
                {liveClubs.length === 0 ? (
                  <div className="text-center py-8">
                    <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No clubs are fully live yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {liveClubs.slice(0, 3).map((t) => (
                      <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Building2} />
                    ))}
                  </div>
                )}
                {liveClubs.length > 3 && (
                  <Button
                    className="w-full rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]"
                    onClick={() => scrollTo("all-clubs")}
                  >
                    View More Clubs
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* NSA Clubs (not yet administratively live) */}
            <Card className="bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-amber-400/40 rounded-2xl text-white shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
              <CardContent className="p-6 sm:p-8 space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold font-heading uppercase tracking-tight text-white">
                      NSA Clubs
                    </h3>
                    <p className="text-sm text-white/70 mt-1">
                      NSA-affiliated clubs not yet fully set up. NSA players can register now with their NSF number.
                    </p>
                  </div>
                  <Trophy className="w-6 h-6 text-amber-400 flex-shrink-0" />
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate("/league")}
                  className="w-full rounded-full bg-amber-500 text-amber-950 hover:bg-amber-400 font-semibold"
                >
                  NSA Members Register Here
                </Button>
                {nsaClubs.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-white/60">No NSA clubs imported yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {nsaClubs.slice(0, 3).map((t) => (
                      <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Building2} nsaMode />
                    ))}
                  </div>
                )}
                {nsaClubs.length > 3 && (
                  <Button
                    className="w-full rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]"
                    onClick={() => scrollTo("all-clubs")}
                  >
                    View All NSA Clubs
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Associations */}
            <Card className="lg:col-span-2 bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 rounded-2xl text-white shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
              <CardContent className="p-6 sm:p-8 space-y-5">
                <div>
                  <h3 className="text-lg font-extrabold font-heading uppercase tracking-tight text-white">
                    Leagues & Associations
                  </h3>
                  <p className="text-sm text-white/60 mt-1">
                    Regional &amp; national squash bodies on SquashHub.
                  </p>
                </div>
                {associations.length === 0 ? (
                  <div className="text-center py-8">
                    <Landmark className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No associations registered yet.</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {associations.slice(0, 6).map((t) => (
                      <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Landmark} />
                    ))}
                  </div>
                )}
                {associations.length > 6 && (
                  <Button
                    className="w-full rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]"
                    onClick={() => scrollTo("all-clubs")}
                  >
                    View More
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Full directory expanded */}
        {(liveClubs.length > 3 || nsaClubs.length > 3 || associations.length > 6) && (
          <div id="all-clubs" className="space-y-10 pt-6">
            {liveClubs.length > 3 && (
              <div>
                <h3 className="text-lg font-extrabold font-heading uppercase tracking-tight mb-4 text-foreground">
                  All Live Clubs
                </h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {liveClubs.map((t) => (
                    <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Building2} />
                  ))}
                </div>
              </div>
            )}
            {nsaClubs.length > 3 && (
              <div>
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <h3 className="text-lg font-extrabold font-heading uppercase tracking-tight text-foreground">
                    All NSA Clubs
                  </h3>
                  <Button
                    size="sm"
                    onClick={() => navigate("/league")}
                    className="rounded-full bg-amber-500 text-amber-950 hover:bg-amber-400 font-semibold"
                  >
                    <Trophy className="w-3.5 h-3.5 mr-1" /> NSA Members Register Here
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  These clubs are listed from NSA but not yet administratively live on SquashHub. Clicking a club will take you to the league self-signup page.
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {nsaClubs.map((t) => (
                    <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Building2} nsaMode />
                  ))}
                </div>
              </div>
            )}
            {associations.length > 6 && (
              <div>
                <h3 className="text-lg font-extrabold font-heading uppercase tracking-tight mb-4 text-foreground">
                  All Leagues & Associations
                </h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {associations.map((t) => (
                    <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Landmark} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" className="bg-card/40 border-y border-border/40">
        <div className="max-w-5xl mx-auto px-4 py-20">
          <div className="text-center mb-10 space-y-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold font-heading uppercase tracking-tight text-foreground">
              Pricing
            </h2>
            <p className="text-base sm:text-lg text-primary font-semibold">
              Free until September 2026
            </p>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              Only pay for active members. No hidden costs. No credit card required.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <PricingCard
              icon={Building2}
              title="Clubs"
              priceLabel="From R5"
              perks={["All features included", "Billed only on active members", "Free until September 2026"]}
              onGetStarted={() => navigate("/auth")}
            />
            <PricingCard
              icon={Landmark}
              title="Associations"
              priceLabel="From R2"
              perks={["Admin, fixtures & finance tools", "Oversight across affiliated clubs", "Free until September 2026"]}
              onGetStarted={() => navigate("/auth")}
            />
          </div>
        </div>
      </section>

      {/* ─── FAQs ─── */}
      <section id="faqs" className="max-w-3xl mx-auto px-4 py-20">
        <h2 className="text-2xl sm:text-3xl font-extrabold font-heading uppercase tracking-tight text-center mb-10 text-foreground">
          FAQ
        </h2>
        <Accordion type="single" collapsible className="space-y-3">
          {FAQS.map((f, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="rounded-xl border border-white/10 bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md text-white px-4"
            >
              <AccordionTrigger className="text-left text-sm sm:text-base font-medium hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* ─── Get Started CTA ─── */}
      <section id="get-started" className="relative overflow-hidden border-y border-border/40">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${playerRacketImg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
        <div className="relative max-w-3xl mx-auto px-4 py-24 text-center space-y-6">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold font-heading uppercase tracking-tight text-foreground">
            Get Started
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
            Run your club with less admin and more control.
          </p>
          <div className="space-y-2 pt-2 flex flex-col items-center">
            <Button size="lg" onClick={() => navigate("/auth")} className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
              Register Your Club
            </Button>
            <p className="text-xs text-muted-foreground">
              Free until September 2026 · No credit card required
            </p>
          </div>
        </div>
      </section>

      {/* ─── Contact form ─── */}
      <section id="contact" className="bg-card/40 border-y border-border/40">
        <div className="max-w-2xl mx-auto px-4 py-20">
          <div className="text-center mb-10 space-y-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold font-heading uppercase tracking-tight text-foreground">
              Contact Us
            </h2>
            <p className="text-sm text-muted-foreground">
              Need help? We'll get back to you shortly and help you get set up.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border/40">
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <img src={shLogoFull} alt="SquashHub" className="h-8 w-auto object-contain" />
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <button onClick={() => scrollTo("top")} className="hover:text-foreground">Home</button>
            <button onClick={() => scrollTo("features")} className="hover:text-foreground">Features</button>
            <button onClick={() => scrollTo("pricing")} className="hover:text-foreground">Pricing</button>
            <button onClick={() => scrollTo("contact")} className="hover:text-foreground">Contact</button>
          </nav>
        </div>
        <div className="border-t border-border/40 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} SquashHub · A product of HKFT Services (Pty) Ltd / Proudly designed by JLT Digital
        </div>
      </footer>
    </div>
  );
}

/* ─────────────── Sub-components ─────────────── */

function Stat({ value, label, loading }: { value: number; label: string; loading: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-3xl sm:text-4xl font-extrabold font-heading text-gray-200 [text-shadow:_0_2px_8px_rgb(0_0_0_/_70%)]">
        {loading ? "—" : value}
      </span>
      <span className="text-sm text-gray-200 font-medium [text-shadow:_0_2px_6px_rgb(0_0_0_/_70%)]">{label}</span>
    </div>
  );
}

function PricingCard({
  icon: Icon,
  title,
  priceLabel,
  perks,
  onGetStarted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  priceLabel: string;
  perks: string[];
  onGetStarted?: () => void;
}) {
  return (
    <Card className="bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 rounded-2xl text-white shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-[hsl(var(--accent))]" />
          </div>
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
        <div>
          <div className="flex items-baseline gap-1 flex-wrap">
            <span className="text-3xl font-bold font-heading text-white">{priceLabel}</span>
            <span className="text-sm text-white/60">/ member per month</span>
          </div>
          <p className="text-xs text-white/50 mt-1">
            From September 2026
          </p>
        </div>
        <ul className="space-y-2 text-sm text-white/70 pt-2 border-t border-white/10">
          {perks.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <Check className="w-4 h-4 text-[hsl(var(--accent))] flex-shrink-0 mt-0.5" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        {onGetStarted && (
          <Button
            onClick={onGetStarted}
            className="w-full rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]"
          >
            Get Started
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface TenantRowProps {
  tenant: TenantPublic;
  navigate: (path: string) => void;
  icon: React.ComponentType<{ className?: string }>;
  /** When true, clicking the row routes to /league?club=<subdomain> instead of
   *  the tenant subdomain. Used for NSA-seeded clubs that are not yet
   *  administratively live on SquashHub. */
  nsaMode?: boolean;
}

function TenantRow({ tenant, navigate, icon: Icon, nsaMode = false }: TenantRowProps) {
  const handleClick = () => {
    if (nsaMode) {
      const sub = tenant.subdomain ? `?club=${encodeURIComponent(tenant.subdomain)}` : "";
      navigate(`/league${sub}`);
      return;
    }
    if (!tenant.subdomain) return;
    const isPreview = window.location.hostname.includes("lovable");
    if (isPreview) {
      navigate(`/c/${tenant.subdomain}`);
    } else {
      window.location.href = `https://${tenant.subdomain}.squashhub.co.za`;
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full text-left rounded-xl border border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors p-3 flex items-center gap-3 group shadow-sm"
    >
      {tenant.logo_url ? (
        <img
          src={tenant.logo_url}
          alt={`${tenant.name} logo`}
          className="w-10 h-10 rounded-md object-contain flex-shrink-0 bg-white/10"
        />
      ) : (
        <div className="w-10 h-10 rounded-md bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-[hsl(var(--accent))]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold text-primary-foreground text-sm truncate">{tenant.name}</h4>
        {nsaMode ? (
          <p className="text-[11px] text-amber-300 truncate font-medium">
            NSA players → register here
          </p>
        ) : tenant.subdomain && (
          <p className="text-xs font-mono text-[hsl(var(--accent))] truncate">
            {tenant.subdomain}.squashhub.co.za
          </p>
        )}
        {tenant.address && (
          <p className="text-xs text-primary-foreground/70 truncate">{tenant.address}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-primary-foreground/70 group-hover:text-primary-foreground transition-colors flex-shrink-0" />
    </button>
  );
}

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`SquashHub enquiry from ${name || "website"}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\nClub / Company: ${company}\n\n${message}`
    );
    window.location.href = `mailto:hello@squashhub.co.za?subject=${subject}&body=${body}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">Full Name</Label>
          <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-email">Email Address</Label>
          <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-company">Club / Company Name</Label>
        <Input id="contact-company" value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-msg">Message</Label>
        <Textarea
          id="contact-msg"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="lg" className="gap-2 rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
          <Mail className="w-4 h-4" />
          Submit Message
        </Button>
      </div>
    </form>
  );
}

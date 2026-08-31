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
  AlertCircle, Calendar, Trophy, Users, BarChart3, Mail, Menu, Zap,
  Lightbulb, ScanFace, Phone, MessageCircle,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { useSaasPricing } from "@/hooks/use-saas-pricing";
import { computeTieredCharge } from "@/lib/saas-tiers";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { toast } from "sonner";
import heroBg from "@/assets/hero-court.jpg";
import featureImg from "@/assets/feature-woman-phone.png";
import playerRacketImg from "@/assets/player-racket.jpg";
import playersMatchImg from "@/assets/players-match.jpg";
import shellyImg from "@/assets/shelly-pro-4pm.jpg";
import lightsAccessVideo from "@/assets/lights-access-demo-v3.mp4.asset.json";
import doorAccessImg from "@/assets/club-door-access.png";
import appShowcaseImg from "@/assets/app-showcase.png";
import appHomePhoneImg from "@/assets/app-home-phone.png";
import shLogoFull from "@/assets/shub-logo-white.png";
import featuresCourtBg from "@/assets/features-court-bg.jpg";
import { listPublicClubs } from "@/lib/public-clubs";

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
  treasurer_member_id?: string | null;
}
const PROBLEMS = [
  { icon: Calendar, label: "Manual bookings and double-ups" },
  { icon: Users, label: "Disorganized leagues and fixtures" },
  { icon: AlertCircle, label: "Time-consuming admin" },
  { icon: BarChart3, label: "Poor payment tracking" },
  { icon: Trophy, label: "Low member engagement" },
  { icon: Lightbulb, label: "Court lights left on, wasted electricity" },
  { icon: ScanFace, label: "No access control on courts" },
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
  { q: "Is it free?", a: "Every new club gets a 3-month free trial from the day it registers — time to load members, sort out your data and set the club up exactly how you want it. No credit card is needed, and billing only starts the day after the trial ends. After that, pricing is on a sliding scale — each band of active members is charged at its own rate, so the bigger your club, the lower your average cost per member. The current bands and minimum monthly charge are shown in the Pricing section above. Paying upfront earns a discount off the monthly scale — 5% for six months in advance, 10% for a full year — and international clubs are billed proportionally in USD or EUR." },
  { q: "How long does setup take?", a: "Setting up your club on the platform is quick and easy — usually under 2 minutes. Onboarding your existing members is the more involved part, but our team will assist you to migrate them across seamlessly. Depending on the size of your club, this may take a bit of time." },
  { q: "Do members need accounts?", a: "Members don't sign up to SquashHub directly — the club creates its own platform on SquashHub, and its members join under the club. Every member has an account with their club, where bookings, participation, and any outstanding fees or payments are reflected." },
  { q: "Can associations use it?", a: "Yes — several league associations already run on SquashHub, and members affiliated to those leagues are automatically linked through to the clubs where they play. Association onboarding is currently arranged directly with the SquashHub team while the association structure and pricing are being finalised — contact us if your league is interested." },
  { q: "Is my data secure?", a: "Yes. The platform runs on secure HTTPS pages and is fully POPIA-aligned, with hCaptcha protection on sign-in and registration to guard against bots and site crawling. Only authorised club admin personnel — such as the Captain, Chairman, Secretary, and Financial Manager — have full admin rights and access to member information." },
];

export default function Home() {
  const navigate = useNavigate();
  const pricing = useSaasPricing("ZAR");
  const lowestRate = pricing.monthlyTiers.length
    ? Math.min(...pricing.monthlyTiers.map((t) => t.rate))
    : 0;
  const highestRate = pricing.monthlyTiers.length
    ? Math.max(...pricing.monthlyTiers.map((t) => t.rate))
    : 0;
  const scaleLabel = `per active member · sliding scale from ${pricing.format(highestRate)} down to ${pricing.format(lowestRate)} · minimum ${pricing.format(pricing.monthlyMin)} / month`;
  const example = computeTieredCharge(197, pricing.monthlyTiers, pricing.monthlyMin);
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ["public-tenants"],
    queryFn: async () => {
      return (await listPublicClubs()) as TenantPublic[];
    },
    staleTime: 60_000,
  });

  // Clubs that have at least one full admin (role='admin') assigned. NSA-seeded
  // tenants graduate into "Live Clubs" once any such admin exists.
  const { data: clubsWithAdmins } = useQuery({
    queryKey: ["clubs-with-admins"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_clubs_with_admins");
      if (error) throw error;
      return new Set<string>((data || []).map((r: { club_id: string }) => r.club_id));
    },
    staleTime: 60_000,
  });

  const allClubs = tenants?.filter((t) => t.tenant_type !== "association") ?? [];
  const adminSet = clubsWithAdmins ?? new Set<string>();
  // Live = non-NSA-seeded OR an NSA-seeded club that now has an admin assigned.
  // Sort so clubs with a full admin (truly active) surface first, then alphabetical.
  const liveClubs = allClubs
    .filter((t) => t.tenant_type !== "nsa_seeded" || adminSet.has(t.id))
    .sort((a, b) => {
      const aAdmin = adminSet.has(a.id) ? 0 : 1;
      const bAdmin = adminSet.has(b.id) ? 0 : 1;
      if (aAdmin !== bAdmin) return aAdmin - bAdmin;
      return a.name.localeCompare(b.name);
    });
  const nonNsaClubs = allClubs.filter((t) => t.tenant_type !== "nsa_seeded");
  const nsaClubs = allClubs.filter((t) => t.tenant_type === "nsa_seeded" && !adminSet.has(t.id));
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
        title="Squash Club Management Software"
        description="All-in-one squash club management software for clubs and associations. Bookings, leagues, members, and payments, all in one simple platform."
        path="/"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": FAQS.map((faq) => ({
            "@type": "Question",
            "name": faq.q,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": faq.a,
            },
          })),
        }}
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
              <Button variant="ghost" size="sm" onClick={() => navigate("/clubs")} className="text-white hover:bg-white/10 hover:text-white">Clubs</Button>

              <Button variant="ghost" size="sm" onClick={() => navigate("/lights")} className="text-white hover:bg-white/10 hover:text-white">
                <Zap className="w-3.5 h-3.5 mr-1 text-amber-400" />Lights
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/lights#access")} className="text-white hover:bg-white/10 hover:text-white">
                <Zap className="w-3.5 h-3.5 mr-1 text-emerald-400" />Access
              </Button>
              <Button variant="ghost" size="sm" onClick={() => scrollTo("contact")} className="text-white hover:bg-white/10 hover:text-white">Contact Us</Button>
            </nav>

            {/* Desktop actions */}
            <div className="hidden md:flex items-center gap-2">
              <Button size="sm" onClick={() => navigate("/register-club")} className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
                Register
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
                    <Button variant="ghost" className="justify-start text-base" onClick={() => handleMobileNav(() => navigate("/clubs"))}>Clubs</Button>

                    <Button variant="ghost" className="justify-start text-base" onClick={() => handleMobileNav(() => navigate("/lights"))}>
                      <Zap className="w-4 h-4 mr-1 text-amber-500" />Lights Integration
                    </Button>
                    <Button variant="ghost" className="justify-start text-base" onClick={() => handleMobileNav(() => navigate("/lights#access"))}>
                      <Zap className="w-4 h-4 mr-1 text-emerald-500" />Access Control
                    </Button>
                    <Button variant="ghost" className="justify-start text-base" onClick={() => handleMobileNav(() => scrollTo("contact"))}>Contact Us</Button>
                    <div className="h-px bg-border my-3" />
                    <Button className="rounded-full w-full bg-amber-500 text-amber-950 hover:bg-amber-400 font-semibold" onClick={() => handleMobileNav(() => navigate("/league"))}>
                      <Trophy className="w-4 h-4 mr-1" /> NSA Player? Register Here
                    </Button>
                    <Button className="rounded-full w-full" onClick={() => handleMobileNav(() => navigate("/register-club"))}>
                      Register
                    </Button>
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        <div className="relative max-w-6xl mx-auto px-4 pt-12 pb-20">
          <div className="grid lg:grid-cols-[1.5fr_1fr] gap-10 items-center">
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
              All-in-one squash club management software for clubs and associations.
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
                <Button size="lg" onClick={() => navigate("/register-club")} className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
                  Register
                </Button>
                <Button size="lg" onClick={() => navigate("/league")} className="rounded-full bg-amber-500 text-amber-950 hover:bg-amber-400 border border-amber-300/40 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)] font-semibold">
                  <Trophy className="w-4 h-4 mr-1.5" /> NSA Player? Register Here
                </Button>
              </div>
              <p className="text-xs text-amber-200/90 drop-shadow max-w-2xl">
                Pretoria clubs affiliated with NSA don't need to register — just request SquashHub to activate your full administrative functionality. SquashHub is fully integrated with NSA via API.
              </p>
              <p className="text-xs text-amber-200/90 drop-shadow max-w-2xl">
                NSA league games can be marked and results posted via API to NSA. Set up your teams from available players in your league.
              </p>

            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col items-center lg:items-end gap-4"
            style={{ perspective: 1200 }}
          >
            <motion.div
              initial={{ rotateY: -78, rotateX: 8, scale: 0.86, opacity: 0 }}
              animate={{ rotateY: 0, rotateX: 0, scale: 1, opacity: 1 }}
              transition={{ duration: 1.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformStyle: "preserve-3d", transformOrigin: "left center" }}
              className="relative"
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1.8 }}
                className="relative"
              >
                <img
                  src={appHomePhoneImg}
                  alt="SquashHub member home screen on a phone showing club stats, quick actions and door access"
                  loading="eager"
                  className="w-full max-w-[300px] rounded-2xl drop-shadow-[0_28px_60px_rgba(0,0,0,0.6)]"
                />
                {/* glare sweep */}
                <motion.div
                  aria-hidden
                  initial={{ x: "-140%", opacity: 0 }}
                  animate={{ x: "140%", opacity: [0, 0.55, 0] }}
                  transition={{ duration: 1.4, delay: 1.5, ease: "easeInOut" }}
                  className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden"
                >
                  <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent blur-md -skew-x-12" />
                </motion.div>
              </motion.div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.9 }}
              className="text-sm sm:text-base font-heading uppercase tracking-[0.18em] text-amber-300 drop-shadow text-center lg:text-right"
            >
              At last — your whole club, in your pocket.
            </motion.p>
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

      {/* ─── Technology Upgrade CTA ─── */}
      <section className="relative overflow-hidden border-y border-border/40">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${featureImg})` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-slate-200/95 dark:bg-slate-900/90 backdrop-blur-sm" />
        <div className="relative max-w-6xl mx-auto px-4 py-16">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/5 dark:bg-white/10 border border-slate-900/15 dark:border-white/20 text-slate-900 dark:text-slate-100 text-xs font-semibold">
                <Zap className="w-3.5 h-3.5" /> Now is the time to upgrade
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold font-heading uppercase tracking-tight text-slate-900 dark:text-slate-50">
                Convert your club to the latest technology
              </h2>
              <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed max-w-xl">
                Simplified automated court lighting and access control — all through one
                affordable platform. No separate systems, no complicated wiring, and no
                massive upfront cost.
              </p>
              <ul className="space-y-3">
                {[
                  { icon: Lightbulb, text: "Auto court lights that switch on with bookings" },
                  { icon: ScanFace, text: "Access control that knows who is on court" },
                  { icon: Check, text: "One simple solution for lights, bookings, and member access" },
                  { icon: Check, text: "Very affordable compared to traditional court systems" },
                ].map((item, i) => (
                  <motion.li
                    key={item.text}
                    {...fadeUp}
                    transition={{ duration: 0.4, delay: i * 0.05 }}
                    className="flex items-start gap-3 text-sm sm:text-base"
                  >
                    <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <item.icon className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    </div>
                    <span className="text-slate-700 dark:text-slate-300">{item.text}</span>
                  </motion.li>
                ))}
              </ul>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button size="lg" onClick={() => navigate("/lights")} className="rounded-full bg-amber-500 text-amber-950 hover:bg-amber-400 font-semibold">
                  <Zap className="w-4 h-4 mr-1.5" /> Explore Lights & Access
                </Button>
                <Button size="lg" onClick={() => navigate("/register-club")} variant="outline" className="rounded-full border-slate-900/25 text-slate-900 hover:bg-slate-900/5 hover:text-slate-900 dark:border-white/30 dark:text-white dark:hover:bg-white/10 dark:hover:text-white">
                  Register
                </Button>
              </div>
            </div>
            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col items-center gap-4"
            >
              <figure className="relative w-full max-w-md">
                <img
                  src={doorAccessImg}
                  alt="Member unlocking the squash club door with the SquashHub app on his phone"
                  loading="lazy"
                  className="w-full rounded-2xl border border-slate-900/10 dark:border-white/10 object-cover shadow-[0_8px_32px_-12px_rgba(0,0,0,0.4)]"
                />
                <figcaption className="mt-2 text-[11px] text-slate-600 dark:text-slate-400 italic text-center">
                  Walk up, tap once — the door unlocks and the court lights come on.
                </figcaption>
              </figure>

              <div className="relative hidden lg:block">
                <div className="absolute inset-0 bg-amber-500/30 blur-3xl rounded-full" />
                <video
                  src={lightsAccessVideo.url}
                  poster={shellyImg}
                  autoPlay
                  muted
                  loop
                  playsInline
                  aria-label="Court lights switching on and club door unlocking from the SquashHub app"
                  className="relative w-56 h-56 object-cover rounded-2xl border border-white/10 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── App showcase ─── */}
      <section id="app" className="bg-card/30 border-b border-border/40">
        <div className="max-w-6xl mx-auto px-4 py-20 space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold font-heading uppercase tracking-tight text-foreground">
              See the app
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Bookings, smart lighting, door access, club administration and member billing — one app
              your players and committee actually enjoy using.
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <motion.img
              {...fadeUp}
              transition={{ duration: 0.5 }}
              src={appShowcaseImg}
              alt="SquashHub app screens: court booking, smart lighting, door access, club administration and member dashboard"
              loading="lazy"
              className="w-full rounded-2xl border border-white/10 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]"
            />
          </div>

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
                  <Button size="lg" onClick={() => navigate("/register-club")} className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
                    Register
                  </Button>
                </div>
                <p className="text-xs text-white/80 drop-shadow">
                  3-month free trial for new clubs · No credit card required
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

      {/* ─── Directory CTA (full list lives on /clubs) ─── */}
      <section id="clubs" className="max-w-6xl mx-auto px-4 py-16">
        <Card className="bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 rounded-2xl text-white shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
          <CardContent className="p-6 sm:p-10 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 space-y-3">
              <h2 className="text-xl sm:text-2xl font-extrabold font-heading uppercase tracking-tight text-white">
                Listed Clubs & Associations
              </h2>
              <p className="text-sm text-white/70 max-w-xl">
                Browse every club, NSA-affiliated club, and league association on SquashHub. Find your club to sign in, or register as an NSA player.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs">
                  {tenantsLoading ? "…" : liveClubs.length} Live Clubs
                </span>
                <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-100 text-xs">
                  {tenantsLoading ? "…" : nsaClubs.length} NSA Clubs
                </span>
                <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs">
                  {tenantsLoading ? "…" : associations.length} Associations
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 md:min-w-[220px]">
              <Button
                onClick={() => navigate("/clubs")}
                className="rounded-full bg-white text-primary hover:bg-white/90 font-semibold"
              >
                Browse All Clubs <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              <Button
                onClick={() => navigate("/league")}
                className="rounded-full bg-amber-500 text-amber-950 hover:bg-amber-400 font-semibold"
              >
                <Trophy className="w-4 h-4 mr-1" /> NSA Player? Register
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>


      {/* ─── Pricing ─── */}
      <section id="pricing" className="bg-card/40 border-y border-border/40">
        <div className="max-w-5xl mx-auto px-4 py-20">
          <div className="text-center mb-10 space-y-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold font-heading uppercase tracking-tight text-foreground">
              Pricing
            </h2>
            <p className="text-base sm:text-lg text-primary font-semibold">
              Up to 3 months free onboarding for every new club that registers to get you settled in
            </p>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              A sliding scale — like tax bands, each block of members is charged at its own rate, so the bigger your
              club, the lower your average cost per member. Only active members count.
            </p>
          </div>

          <div className="max-w-md mx-auto">
            <PricingCard
              icon={Building2}
              title="Clubs"
              priceLabel={`From ${pricing.format(lowestRate)}`}
              intlLabel={scaleLabel}
              perks={["All features included", "Billed only on active members", "Save 5% paying 6-monthly, 10% annually", "3 months free to get set up"]}
              onGetStarted={() => navigate("/auth")}
            />
          </div>

          {/* Sliding scale bands */}
          <div className="max-w-3xl mx-auto mt-6 rounded-2xl border border-white/10 bg-[hsl(220_45%_8%/0.6)] backdrop-blur-md p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">How the sliding scale works</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              {pricing.monthlyTiers.map((t, i) => {
                const from = i === 0 ? 1 : (pricing.monthlyTiers[i - 1].upTo ?? 0) + 1;
                return (
                  <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {pricing.bandLabel(from, t.upTo)}
                    </div>
                    <div className="text-base font-bold text-foreground">{pricing.format(t.rate)}</div>
                    <div className="text-[10px] text-muted-foreground">/ member / month</div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Example: a 197-member club pays about{" "}
              <strong className="text-foreground">{pricing.format(example.subtotal)} per month</strong> — roughly{" "}
              {pricing.format(example.effectiveRate)} per member. Minimum charge {pricing.format(pricing.monthlyMin)} /
              month. International clubs are billed proportionally in USD or EUR.
            </p>
          </div>



          {/* Lights integration teaser */}
          <div className="max-w-4xl mx-auto mt-8">
            <button
              onClick={() => navigate("/lights")}
              className="group w-full text-left rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent backdrop-blur-md p-5 sm:p-6 hover:border-amber-400/60 hover:from-amber-500/15 transition-all"
            >
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="relative shrink-0">
                  <div className="absolute inset-0 bg-amber-500/30 blur-2xl rounded-full" />
                  <img
                    src={shellyImg}
                    alt="Shelly Pro 4PM smart relay"
                    className="relative w-28 h-28 sm:w-32 sm:h-32 object-contain rounded-xl bg-white p-2 border border-white/10"
                  />
                </div>
                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                    <Zap className="w-3 h-3" /> Shelly Ready
                  </div>
                  <h3 className="text-lg sm:text-xl font-heading uppercase tracking-tight text-foreground">
                    Smart court lights — included
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    SquashHub may integrate with your existing relay hardware, or pair with affordable
                    <strong className="text-foreground"> Shelly relays</strong> — the right model depends on your
                    court count and the amps each court's lights draw. Bookings <em>and</em> lights in one place
                    — no separate booking system required.
                  </p>

                  <div className="inline-flex items-center gap-1 text-amber-400 text-sm font-semibold pt-1 group-hover:gap-2 transition-all">
                    Learn more <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </button>
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
            <Button size="lg" onClick={() => navigate("/register-club")} className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
              Register
            </Button>
            <p className="text-xs text-muted-foreground">
              3-month free trial for new clubs · No credit card required
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
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <a
                href="tel:+27833759003"
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                <Phone className="w-4 h-4" />
                Call us on 083 375 9003
              </a>
              <span className="hidden sm:inline text-muted-foreground">·</span>
              <a
                href="https://wa.me/27833759003"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#25D366] hover:opacity-80 transition-opacity"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp us on 083 375 9003
              </a>
            </div>
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
          © {new Date().getFullYear()} SquashHub · A product of Stratus Software Solutions (Pty) Ltd / Proudly designed by JLT Digital
        </div>
      </footer>

      {/* Floating WhatsApp button */}
      <a
        href="https://wa.me/27833759003"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#25D366] text-white px-4 py-3 shadow-lg hover:opacity-90 transition-opacity"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-sm font-semibold hidden sm:inline">WhatsApp Us</span>
      </a>
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
  intlLabel,
  perks,
  onGetStarted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  priceLabel: string;
  intlLabel?: string;
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
          {intlLabel && (
            <p className="text-xs text-white/70 mt-1 font-medium">{intlLabel}</p>
          )}
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
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "support-new-message",
          recipientEmail: "support@squashhub.co.za",
          idempotencyKey: `web-contact-${email}-${Date.now()}`,
          templateData: {
            subject: `Website enquiry${company ? ` — ${company}` : ""}`,
            message: `Club / Company: ${company || "—"}\n\n${message}`,
            fromName: name,
            fromEmail: email,
            isNewThread: true,
          },
        },
      });
      if (error) throw error;
      toast.success("Message sent — we'll be in touch shortly.");
      setName(""); setEmail(""); setCompany(""); setMessage("");
    } catch (err) {
      console.error("contact form send failed:", err);
      toast.error("Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
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
        <Button type="submit" size="lg" disabled={sending} className="gap-2 rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
          <Mail className="w-4 h-4" />
          {sending ? "Sending…" : "Submit Message"}
        </Button>
      </div>
    </form>
  );
}

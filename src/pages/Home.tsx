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
  Building2, ChevronRight, ArrowRight, Landmark, Check,
  AlertCircle, Calendar, Trophy, Users, BarChart3, Mail,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-court.jpg";
import featureImg from "@/assets/feature-woman-phone.png";
import playerRacketImg from "@/assets/player-racket.jpg";
import playersMatchImg from "@/assets/players-match.jpg";
import shLogoFull from "@/assets/shub-logo-full.png";
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
  { q: "Is it free?", a: "Yes, until September 2026." },
  { q: "How long does setup take?", a: "Under 2 minutes." },
  { q: "Do members need accounts?", a: "Yes, for bookings and participation." },
  { q: "Can associations use it?", a: "Yes, with full oversight tools." },
  { q: "Is my data secure?", a: "Yes, fully POPIA-aligned." },
];

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ["public-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, subdomain, logo_url, address, tenant_type")
        .not("subdomain", "is", null)
        .order("name");
      if (error) throw error;
      return (data || []) as TenantPublic[];
    },
    staleTime: 60_000,
  });

  const clubs = tenants?.filter((t) => t.tenant_type !== "association") ?? [];
  const associations = tenants?.filter((t) => t.tenant_type === "association") ?? [];

  if (user) {
    navigate("/", { replace: true });
    return null;
  }

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="SquashHub — Squash Club Management Software for South Africa"
        description="All-in-one squash club management software for South African clubs and associations. Bookings, leagues, members, and payments, all in one simple platform."
        path="/"
      />

      {/* ─── Top Bar ─── */}
      <header className="sticky top-0 z-50 bg-background/85 backdrop-blur border-b border-border/40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={shLogoFull} alt="SquashHub" className="h-7 w-auto object-contain" />
          </div>
          <nav className="hidden sm:flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => scrollTo("top")}>Home</Button>
            <Button variant="ghost" size="sm" onClick={() => scrollTo("features")}>Features</Button>
            <Button variant="ghost" size="sm" onClick={() => scrollTo("pricing")}>Pricing</Button>
          </nav>
          <Button size="sm" onClick={() => navigate("/auth")} className="gap-1.5">
            Start Free Trial
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section id="top" className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/75 to-background" />

        <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-20">
          <div className="max-w-3xl space-y-6">
            <motion.h1
              {...fadeUp}
              transition={{ duration: 0.5 }}
              className="text-4xl sm:text-5xl md:text-6xl font-extrabold font-heading uppercase tracking-tight text-foreground leading-[1.05]"
            >
              Looking for a platform to{" "}
              <span className="text-primary">run your squash club?</span>
            </motion.h1>

            <motion.p
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-base sm:text-lg text-muted-foreground max-w-2xl"
            >
              All-in-one squash club management software for South African clubs and associations.
              Bookings, leagues, members, and payments — all in one simple platform.
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
                <Button size="lg" onClick={() => navigate("/auth")} className="gap-2">
                  Register Your Club
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => scrollTo("clubs")}>
                  Find your club
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
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
          style={{ backgroundColor: "rgba(11, 31, 80, 0.3)" }}
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
                Manage everything in <span className="text-[#ec4155]">one place</span>
              </motion.h2>

              <ul className="space-y-3">
                {FEATURES.map((f, i) => (
                  <motion.li
                    key={f.title}
                    {...fadeUp}
                    transition={{ duration: 0.4, delay: i * 0.05 }}
                    className="flex items-start gap-3"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <p className="text-sm sm:text-base text-foreground">
                      <span className="font-semibold">{f.title}:</span>{" "}
                      <span className="text-muted-foreground">{f.desc}</span>
                    </p>
                  </motion.li>
                ))}
              </ul>

              <div className="space-y-2 pt-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button size="lg" onClick={() => navigate("/auth")} className="gap-2">
                    Register Your Club
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => scrollTo("clubs")}>
                    Find your club
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
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
        <div className="absolute inset-0 bg-background/88 backdrop-blur-sm" />
        <div className="relative max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl sm:text-3xl font-extrabold font-heading uppercase tracking-tight text-center mb-10 text-foreground">
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
                <div className="w-14 h-14 rounded-xl bg-background border border-border shadow-sm flex items-center justify-center">
                  <Check className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm text-foreground font-medium leading-snug">{b}</p>
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
            {/* Clubs */}
            <Card className="bg-card/80">
              <CardContent className="p-6 sm:p-8 space-y-5">
                <div>
                  <h3 className="text-lg font-extrabold font-heading uppercase tracking-tight text-foreground">
                    Clubs
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Find your club and sign in through their portal.
                  </p>
                </div>
                {clubs.length === 0 ? (
                  <div className="text-center py-8">
                    <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No clubs registered yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {clubs.slice(0, 3).map((t) => (
                      <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Building2} />
                    ))}
                  </div>
                )}
                {clubs.length > 3 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => scrollTo("all-clubs")}
                  >
                    View More Clubs
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Associations */}
            <Card className="bg-card/80">
              <CardContent className="p-6 sm:p-8 space-y-5">
                <div>
                  <h3 className="text-lg font-extrabold font-heading uppercase tracking-tight text-foreground">
                    Leagues & Associations
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Regional &amp; national squash bodies on SquashHub.
                  </p>
                </div>
                {associations.length === 0 ? (
                  <div className="text-center py-8">
                    <Landmark className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No associations registered yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {associations.slice(0, 3).map((t) => (
                      <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Landmark} />
                    ))}
                  </div>
                )}
                {associations.length > 3 && (
                  <Button
                    variant="outline"
                    className="w-full"
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
        {(clubs.length > 3 || associations.length > 3) && (
          <div id="all-clubs" className="space-y-10 pt-6">
            {clubs.length > 3 && (
              <div>
                <h3 className="text-lg font-extrabold font-heading uppercase tracking-tight mb-4 text-foreground">
                  All Clubs
                </h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {clubs.map((t) => (
                    <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Building2} />
                  ))}
                </div>
              </div>
            )}
            {associations.length > 3 && (
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
            />
            <PricingCard
              icon={Landmark}
              title="Associations"
              priceLabel="From R2"
              perks={["Admin, fixtures & finance tools", "Oversight across affiliated clubs", "Free until September 2026"]}
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
              className="rounded-lg border border-border/60 bg-card/60 px-4"
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
            <Button size="lg" onClick={() => navigate("/auth")} className="gap-2">
              Register Your Club
              <ArrowRight className="w-4 h-4" />
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
          © {new Date().getFullYear()} SquashHub · A product of HKFT Services (Pty) Ltd
        </div>
      </footer>
    </div>
  );
}

/* ─────────────── Sub-components ─────────────── */

function Stat({ value, label, loading }: { value: number; label: string; loading: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-3xl sm:text-4xl font-extrabold font-heading text-primary">
        {loading ? "—" : value}
      </span>
      <span className="text-sm text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

function PricingCard({
  icon: Icon,
  title,
  priceLabel,
  perks,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  priceLabel: string;
  perks: string[];
}) {
  return (
    <Card className="border-primary/30">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <div>
          <div className="flex items-baseline gap-1 flex-wrap">
            <span className="text-3xl font-bold font-heading text-foreground">{priceLabel}</span>
            <span className="text-sm text-muted-foreground">/ member / month</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            From September 2026
          </p>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground pt-2 border-t border-border/40">
          {perks.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

interface TenantRowProps {
  tenant: TenantPublic;
  navigate: (path: string) => void;
  icon: React.ComponentType<{ className?: string }>;
}

function TenantRow({ tenant, navigate, icon: Icon }: TenantRowProps) {
  const handleClick = () => {
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
      className="w-full text-left rounded-lg border border-border/60 bg-background/60 hover:border-primary/50 hover:bg-background transition-colors p-3 flex items-center gap-3 group"
    >
      {tenant.logo_url ? (
        <img
          src={tenant.logo_url}
          alt={`${tenant.name} logo`}
          className="w-10 h-10 rounded-md object-contain flex-shrink-0 bg-background"
        />
      ) : (
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold text-foreground text-sm truncate">{tenant.name}</h4>
        {tenant.subdomain && (
          <p className="text-xs font-mono text-primary truncate">
            {tenant.subdomain}.squashhub.co.za
          </p>
        )}
        {tenant.address && (
          <p className="text-xs text-muted-foreground truncate">{tenant.address}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
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
        <Button type="submit" size="lg" className="gap-2">
          <Mail className="w-4 h-4" />
          Submit Message
        </Button>
      </div>
    </form>
  );
}

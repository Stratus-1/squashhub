import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";
import { ArrowLeft, Zap, Lightbulb, Wifi, Gauge, ShieldCheck, Wrench, Receipt, CheckCircle2, Users, CalendarClock } from "lucide-react";
import shellyImg from "@/assets/shelly-pro-4pm.jpg";

export default function LightsIntegration() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(220_45%_8%)] via-[hsl(220_40%_12%)] to-background text-foreground">
      <SEO
        title="Smart Court Lights Integration — Shelly Ready | SquashHub"
        description="Pay-as-you-play court lighting. SquashHub is Shelly Pro 4PM ready — automatic on/off, fair per-minute billing, and zero wasted electricity."
      />

      {/* Header */}
      <header className="border-b border-white/10 bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-white hover:bg-white/10 hover:text-white gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <span className="text-white font-heading uppercase tracking-tight text-sm">Court Lights</span>
          <Button size="sm" onClick={() => navigate("/auth")} className="rounded-full bg-amber-500 text-amber-950 hover:bg-amber-400 font-semibold">
            Get Started
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-12 pb-16">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/20">
              <Zap className="w-3 h-3 mr-1" /> Shelly Ready
            </Badge>
            <h1 className="text-4xl md:text-5xl font-heading uppercase tracking-tight text-white leading-tight">
              Pay-as-you-play <span className="text-amber-400">court lighting</span>
            </h1>
            <p className="text-lg text-white/70 leading-relaxed">
              SquashHub talks directly to <strong className="text-white">Shelly Pro 4PM</strong> smart relays.
              Lights switch on the moment a member taps "Play", off the second they finish — and every cent
              is billed to the right player automatically.
            </p>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm text-white/85 leading-relaxed">
                <strong className="text-amber-300">One app does it all.</strong> SquashHub is your booking
                system <em>and</em> your court-lights controller. No separate hardware app, no third-party
                booking tool — members book, the lights come on, and the cost is charged
                <strong className="text-white"> per your club's own rules</strong> (per minute, per hour,
                peak / off-peak, member vs visitor).
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <FeatureChip icon={Wifi} label="No app for the player" />
              <FeatureChip icon={Gauge} label="Per-minute billing" />
              <FeatureChip icon={ShieldCheck} label="Zero wasted power" />
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full" />
            <img
              src={shellyImg}
              alt="Shelly Pro 4PM smart relay on DIN rail"
              width={1024}
              height={1024}
              className="relative rounded-2xl border border-white/10 shadow-2xl bg-white"
            />
            <p className="text-center text-xs text-white/50 mt-2 italic">Shelly Pro 4PM — one device controls four courts</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl md:text-3xl font-heading uppercase tracking-tight text-white mb-8">
          How it works
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          <StepCard step="1" icon={Lightbulb} title="Member taps Play">
            From their phone, in the live SquashHub session banner. No PIN pads, no key cards.
          </StepCard>
          <StepCard step="2" icon={Zap} title="Lights snap on">
            SquashHub fires the relay over WiFi in under a second. Transfers between courts mid-session work too.
          </StepCard>
          <StepCard step="3" icon={Receipt} title="Auto-billed at the buzzer">
            When the session ends, actual minutes × your hourly rate is added to the player's tab. Done.
          </StepCard>
        </div>

        {/* More smart features */}
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <StepCard step="+" icon={Users} title="Split fees between players">
            One player taps Play, but the cost is shared. SquashHub splits the light bill evenly across
            everyone in the booking — singles, doubles, or coaching groups — exactly as the booker requests.
          </StepCard>
          <StepCard step="+" icon={CalendarClock} title="Plan & book league night lights">
            Admins schedule a whole league evening in one click. Lights for every court turn on at the
            fixture's start time, off at the end — no manual switching, no lights left burning after the
            last match.
          </StepCard>
        </div>
      </section>

      {/* Costs */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl md:text-3xl font-heading uppercase tracking-tight text-white mb-2">
          What it costs your club
        </h2>
        <p className="text-white/60 mb-8">One-off setup. No monthly fee from SquashHub for the integration.</p>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-white font-semibold text-lg">Shelly Pro 4PM hardware</h3>
            </div>
            <p className="text-3xl font-heading text-white">~R3,500 <span className="text-sm text-white/50 font-sans">once-off</span></p>
            <p className="text-sm text-white/60 mt-2">
              One unit drives <strong className="text-white">up to 4 courts</strong>. Built-in energy metering, DIN-rail mount,
              works with any 230V lighting circuit (LED, fluorescent, halide).
            </p>
          </Card>

          <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-md">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-white font-semibold text-lg">Electrician installation</h3>
            </div>
            <p className="text-3xl font-heading text-white">R1,500–3,000 <span className="text-sm text-white/50 font-sans">once-off</span></p>
            <p className="text-sm text-white/60 mt-2">
              A registered electrician fits the relay into your existing DB board, wires up to 4 light circuits,
              and connects it to the club WiFi. Typically 2–3 hours on site.
            </p>
          </Card>
        </div>

        <Card className="p-6 mt-4 bg-gradient-to-r from-amber-500/10 to-amber-500/5 border-amber-500/30 backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <CheckCircle2 className="w-8 h-8 text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="text-white font-semibold">Total: R5,000 – R6,500 for a 4-court club.</p>
              <p className="text-sm text-white/70 mt-1">
                Most clubs recover the full cost in <strong>2–4 months</strong> just from accurate billing —
                eliminating the "lights left on all night" leak.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Why */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl md:text-3xl font-heading uppercase tracking-tight text-white mb-8">
          Why clubs love it
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <BenefitRow text="No more honour-system disputes — the relay knows who, when, and how long." />
          <BenefitRow text="Lights physically cannot be left on. They cut at session end, every time." />
          <BenefitRow text="Per-court rates configurable per club (e.g. R12/hour, R0.20/minute)." />
          <BenefitRow text="Mid-session court transfers carry the billing across automatically." />
          <BenefitRow text="Captains and admins see live energy spend in the dashboard." />
          <BenefitRow text="Hardware is yours — SquashHub charges nothing for the integration itself." />
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl md:text-4xl font-heading uppercase tracking-tight text-white mb-4">
          Ready to switch on smart lighting?
        </h2>
        <p className="text-white/70 mb-6 max-w-xl mx-auto">
          Register your club on SquashHub and we'll walk you through the Shelly setup — including a recommended
          electrician in your area if you need one.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => navigate("/auth")} className="rounded-full bg-amber-500 text-amber-950 hover:bg-amber-400 font-semibold">
            Register Your Club
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate("/")} className="rounded-full border-white/20 text-white hover:bg-white/10 hover:text-white">
            Back to Home
          </Button>
        </div>
      </section>
    </div>
  );
}

function FeatureChip({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-white text-xs">
      <Icon className="w-3.5 h-3.5 text-amber-400" />
      {label}
    </div>
  );
}

function StepCard({ step, icon: Icon, title, children }: { step: string; icon: any; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-md relative overflow-hidden">
      <span className="absolute top-3 right-4 text-5xl font-heading text-white/5">{step}</span>
      <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-amber-400" />
      </div>
      <h3 className="text-white font-semibold mb-1.5">{title}</h3>
      <p className="text-sm text-white/70 leading-relaxed">{children}</p>
    </Card>
  );
}

function BenefitRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <span className="text-sm text-white/85">{text}</span>
    </div>
  );
}

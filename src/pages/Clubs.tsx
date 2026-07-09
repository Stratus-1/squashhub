import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { Building2, ChevronRight, Landmark, Trophy, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import shLogoFull from "@/assets/shub-logo-white.png";
import heroBg from "@/assets/hero-court.jpg";

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

export default function Clubs() {
  const navigate = useNavigate();

  const { data: tenants, isLoading } = useQuery({
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
  const associations = tenants?.filter((t) => t.tenant_type === "association") ?? [];

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Listed Clubs & Associations — SquashHub"
        description="Browse every squash club, NSA-affiliated club, and league association on SquashHub. Sign in via your club portal or register as an NSA player."
        path="/clubs"
      />

      {/* Hero band */}
      <section className="relative overflow-hidden border-b border-white/10">
        <img src={heroBg} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/70 to-background" />
        <header className="relative z-10 pt-4 px-4">
          <div className="max-w-6xl mx-auto h-14 px-4 flex items-center justify-between rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]">
            <button onClick={() => navigate("/")} className="flex items-center gap-2 min-w-0">
              <img src={shLogoFull} alt="SquashHub" className="h-10 sm:h-12 w-auto object-contain" />
            </button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="text-white hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Home
              </Button>
              <Button
                size="sm"
                onClick={() => navigate("/auth")}
                className="rounded-full bg-[hsl(220_45%_8%/0.85)] backdrop-blur-md border border-white/10 text-white hover:bg-[hsl(220_45%_12%/0.9)]"
              >
                Register Your Club
              </Button>
            </div>
          </div>
        </header>

        <div className="relative z-10 max-w-6xl mx-auto px-4 pt-10 pb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold font-heading uppercase tracking-tight text-foreground">
            Listed Clubs & Associations
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-2xl">
            Every club, NSA-affiliated club, and league association currently on SquashHub.
          </p>
          <div className="flex flex-wrap gap-3 mt-5 text-xs text-white/80">
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10">
              {liveClubs.length} Live Clubs
            </span>
            <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-100">
              {nsaClubs.length} NSA Clubs
            </span>
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/10">
              {associations.length} Associations
            </span>
          </div>
        </div>
      </section>

      {/* Directory */}
      <section className="max-w-6xl mx-auto px-4 py-14 space-y-14">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* Live Clubs */}
            <div>
              <h2 className="text-lg font-extrabold font-heading uppercase tracking-tight mb-4 text-foreground">
                Live Clubs
              </h2>
              {liveClubs.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-60" />
                  No clubs are fully live yet.
                </CardContent></Card>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {liveClubs.map((t) => (
                    <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Building2} />
                  ))}
                </div>
              )}
            </div>

            {/* NSA Clubs */}
            <div>
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h2 className="text-lg font-extrabold font-heading uppercase tracking-tight text-foreground">
                  NSA Clubs
                </h2>
                <Button
                  size="sm"
                  onClick={() => navigate("/league")}
                  className="rounded-full bg-amber-500 text-amber-950 hover:bg-amber-400 font-semibold"
                >
                  <Trophy className="w-3.5 h-3.5 mr-1" /> NSA Members Register Here
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                NSA-affiliated clubs not yet fully set up on SquashHub. Clicking a club opens the league self-signup page.
              </p>
              {nsaClubs.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No NSA clubs imported yet.
                </CardContent></Card>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {nsaClubs.map((t) => (
                    <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Building2} nsaMode />
                  ))}
                </div>
              )}
            </div>

            {/* Non-NSA independent clubs (only if there are extras worth calling out) */}
            {nonNsaClubs.length > 0 && (
              <div>
                <h2 className="text-lg font-extrabold font-heading uppercase tracking-tight mb-4 text-foreground">
                  Independent Clubs
                </h2>
                <p className="text-xs text-muted-foreground mb-3">
                  Clubs running on SquashHub outside the NSA roster.
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {nonNsaClubs.map((t) => (
                    <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Building2} />
                  ))}
                </div>
              </div>
            )}

            {/* Associations */}
            <div>
              <h2 className="text-lg font-extrabold font-heading uppercase tracking-tight mb-4 text-foreground">
                Leagues & Associations
              </h2>
              {associations.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
                  <Landmark className="w-8 h-8 mx-auto mb-2 opacity-60" />
                  No associations registered yet.
                </CardContent></Card>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {associations.map((t) => (
                    <TenantRow key={t.id} tenant={t} navigate={navigate} icon={Landmark} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

interface TenantRowProps {
  tenant: TenantPublic;
  navigate: (path: string) => void;
  icon: React.ComponentType<{ className?: string }>;
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

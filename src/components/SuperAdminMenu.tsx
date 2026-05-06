import { useState, useMemo } from "react";
import { Shield, Building2, ExternalLink, Search, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/hooks/use-data";
import { useClubContext } from "@/contexts/ClubContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Builds the URL to a given subdomain (or root) on the same Lovable/squashhub
 * deployment. Handles three host shapes:
 *   - Production:  *.squashhub.co.za / .app
 *   - Lovable:     id-preview--xxxx.lovable.app  (cannot do real subdomains
 *                  → uses ?club=<sub> on the same host so cookies persist)
 *   - localhost:   uses ?club=<sub>
 */
function buildClubUrl(subdomain: string | null): string {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port ? `:${port}` : "";

  // Lovable preview hosts and localhost: keep host, use ?club= or strip
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".lovable.app") ||
    hostname.endsWith(".lovableproject.com")
  ) {
    if (!subdomain) return `${protocol}//${hostname}${portSuffix}/`;
    return `${protocol}//${hostname}${portSuffix}/?club=${subdomain}`;
  }

  // Real production domains
  const KNOWN_ROOTS = ["squashhub.co.za", "squashhub.app"];
  let root: string | null = null;
  for (const r of KNOWN_ROOTS) {
    if (hostname === r || hostname.endsWith(`.${r}`)) {
      root = r;
      break;
    }
  }
  if (!root) {
    // Fallback: use ?club on whatever host we're on
    if (!subdomain) return `${protocol}//${hostname}${portSuffix}/`;
    return `${protocol}//${hostname}${portSuffix}/?club=${subdomain}`;
  }
  if (!subdomain) return `${protocol}//${root}${portSuffix}/`;
  return `${protocol}//${subdomain}.${root}${portSuffix}/`;
}

export function SuperAdminMenu() {
  const { data: roles } = useMyRoles();
  const { subdomain: currentSubdomain } = useClubContext();
  const [switchOpen, setSwitchOpen] = useState(false);
  const [search, setSearch] = useState("");

  const isSuperAdmin = (roles || []).includes("admin") || (roles || []).includes("moderator");

  const { data: clubs = [] } = useQuery({
    queryKey: ["super-admin-club-list"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, subdomain, tenant_type")
        .not("subdomain", "is", null)
        .order("name");
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; subdomain: string; tenant_type: string | null }>;
    },
  });

  const filteredClubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clubs;
    return clubs.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.subdomain || "").toLowerCase().includes(q),
    );
  }, [clubs, search]);

  if (!isSuperAdmin) return null;

  const goToAdminPanel = () => {
    // Super-admin panel lives on the root host (no club subdomain)
    window.location.href = `${buildClubUrl(null)}admin`.replace(/\/+admin$/, "/admin");
  };

  const switchToClub = (sub: string) => {
    if (sub === currentSubdomain) {
      setSwitchOpen(false);
      return;
    }
    window.location.href = buildClubUrl(sub);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs font-medium text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
            title="Super Admin tools"
          >
            <Shield className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Super Admin</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Platform Tools
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={goToAdminPanel} className="gap-2">
            <Shield className="h-4 w-4" />
            <span>Super Admin Panel</span>
            <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Switch Club
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setSwitchOpen(true)} className="gap-2">
            <Building2 className="h-4 w-4" />
            <span>Browse all clubs…</span>
            <span className="ml-auto text-[11px] text-muted-foreground">{clubs.length}</span>
          </DropdownMenuItem>
          {currentSubdomain && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground border-t mt-1">
              Currently on: <span className="font-medium text-foreground">{currentSubdomain}</span>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Switch club
            </DialogTitle>
            <DialogDescription>
              Open another club's tenant. You'll stay signed in with the same account
              (you may be asked to sign in again on a different domain).
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search clubs by name or slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>
          <ScrollArea className="h-[360px] pr-2 -mr-2">
            <div className="flex flex-col gap-0.5">
              {filteredClubs.map((c) => {
                const isCurrent = c.subdomain === currentSubdomain;
                return (
                  <button
                    key={c.id}
                    onClick={() => switchToClub(c.subdomain)}
                    className={`group flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                      isCurrent
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {c.subdomain}
                        {c.tenant_type === "nsa_seeded" && (
                          <span className="ml-1.5 rounded bg-amber-500/10 px-1 text-amber-500">
                            seeded
                          </span>
                        )}
                        {c.tenant_type === "association" && (
                          <span className="ml-1.5 rounded bg-blue-500/10 px-1 text-blue-500">
                            league
                          </span>
                        )}
                      </div>
                    </div>
                    {isCurrent ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50" />
                    )}
                  </button>
                );
              })}
              {filteredClubs.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No clubs match "{search}".
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

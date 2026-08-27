import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useClubContext } from "@/contexts/ClubContext";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, ChevronDown, Trophy, Check, ShieldCheck } from "lucide-react";
import { useIsSuperAdmin } from "@/hooks/use-club";

interface TenantOption {
  id: string;
  name: string;
  subdomain: string | null;
  tenant_type: string;
}

/**
 * Shows a dropdown when the current user has membership at multiple tenants
 * (e.g. their home club + a league association). Switches by navigating to
 * the tenant's subdomain.
 */
export function TenantSwitcher() {
  const { user } = useAuth();
  const { club: currentClub, subdomain: currentSubdomain } = useClubContext();
  const [search, setSearch] = useState("");
  const isPlatformAdmin = useIsSuperAdmin();

  const { data: tenants = [] } = useQuery({
    queryKey: ["my-tenants", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<TenantOption[]> => {
      const seen = new Set<string>();
      const list: TenantOption[] = [];
      const push = (c: any) => {
        if (!c || !c.subdomain || seen.has(c.id)) return;
        seen.add(c.id);
        list.push({ id: c.id, name: c.name, subdomain: c.subdomain, tenant_type: c.tenant_type || "club" });
      };

      // Platform super admin: browse all clubs/associations.
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin");
      const isSuperAdmin = (roles || []).length > 0;

      if (isSuperAdmin) {
        const { data, error } = await fromExt("clubs")
          .select("id, name, subdomain, tenant_type")
          .not("subdomain", "is", null)
          .order("name");
        if (error) throw error;
        for (const c of (data || []) as any[]) push(c);
      } else {
        // Tenants where the user is a member.
        const { data, error } = await fromExt("club_members")
          .select("club:club_id(id, name, subdomain, tenant_type)")
          .eq("user_id", user!.id);
        if (error) throw error;
        for (const row of (data || []) as any[]) push(row.club);

        // Association tenants the user administers (RLS-safe RPC).
        const { data: adminTenants } = await (supabase as any).rpc("my_admin_tenants");
        for (const c of (adminTenants || []) as any[]) push(c);
      }

      return list.sort((a, b) => {
        if (a.tenant_type === b.tenant_type) return a.name.localeCompare(b.name);
        return a.tenant_type === "club" ? -1 : 1;
      });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.subdomain || "").toLowerCase().includes(q),
    );
  }, [tenants, search]);

  if (tenants.length < 2 && !isPlatformAdmin) return null;

  const isPreviewHost = () =>
    typeof window !== "undefined" &&
    (
      window.location.hostname.includes("lovable.app") ||
      window.location.hostname.includes("lovableproject.com") ||
      window.location.hostname.includes("id-preview--") ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    );

  const goToTenant = (sub: string) => {
    if (sub === currentSubdomain) return;
    if (isPreviewHost()) {
      window.location.href = `/c/${sub}/`;
    } else {
      window.location.href = `https://${sub}.squashhub.co.za/`;
    }
  };

  const goToSuperAdmin = () => {
    if (isPreviewHost()) {
      window.location.href = "/admin";
    } else {
      window.location.href = "https://squashhub.co.za/admin";
    }
  };

  const activeName = currentClub?.name || "Switch tenant";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          {currentClub?.tenant_type === "association" ? (
            <Trophy className="w-3.5 h-3.5" />
          ) : (
            <Building2 className="w-3.5 h-3.5" />
          )}
          <span className="max-w-[110px] truncate">{activeName}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs">Switch workspace</DropdownMenuLabel>
        {tenants.length > 6 && (
          <div className="px-2 pb-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clubs..."
              className="h-7 text-xs"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto">
          {filtered.map((t) => {
            const isActive = t.subdomain === currentSubdomain;
            return (
              <DropdownMenuItem
                key={t.id}
                onClick={() => t.subdomain && goToTenant(t.subdomain)}
                className="cursor-pointer"
              >
                {t.tenant_type === "association" ? (
                  <Trophy className="w-3.5 h-3.5 mr-2 text-primary" />
                ) : (
                  <Building2 className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{t.tenant_type}</p>
                </div>
                {isActive && <Check className="w-3.5 h-3.5 text-primary" />}
              </DropdownMenuItem>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

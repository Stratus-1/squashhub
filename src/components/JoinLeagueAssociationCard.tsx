import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useLeagueAssociations } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  LeagueParticipationPicker,
  LeagueSelection,
  applyLeagueSelections,
} from "@/components/LeagueParticipationPicker";

interface JoinLeagueAssociationCardProps {
  clubId: string | null | undefined;
  variant?: "banner" | "card";
  className?: string;
}

/**
 * Dashboard prompt for already-onboarded members who haven't yet opted into
 * league play. Lets them tick any of the club's configured league associations
 * (LS / NIL / NSA-style) and provisions each correctly.
 *
 * Hidden when:
 *  - Member already has plays_league = true, OR
 *  - The club has no league associations configured, OR
 *  - The member has already been provisioned at every tenant association
 *    AND there are no remaining internal/external rows.
 */
export function JoinLeagueAssociationCard({ clubId, variant = "card", className }: JoinLeagueAssociationCardProps) {
  const { user } = useAuth();
  const { activeMember } = useMemberContext();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selections, setSelections] = useState<Record<string, LeagueSelection>>({});

  const { data: leagueAssocs = [] } = useLeagueAssociations(clubId);

  // Already-provisioned tenant association ids (so we don't re-prompt for those)
  const { data: existingTenantAssocIds = [] } = useQuery({
    queryKey: ["my-association-memberships-min", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await fromExt("club_members")
        .select("club_id, clubs:club_id(tenant_type)")
        .eq("user_id", user!.id);
      return ((data || []) as any[])
        .filter((r) => r?.clubs?.tenant_type === "association")
        .map((r) => r.club_id as string);
    },
  });

  // Cross-reference: tenant association ids that match our league_associations rows
  const { data: tenantsByLeagueAssoc = {} } = useQuery({
    queryKey: ["tenant-by-league-assoc", clubId, leagueAssocs.length],
    enabled: !!clubId && leagueAssocs.length > 0,
    queryFn: async () => {
      const { data } = await fromExt("clubs")
        .select("id, name, subdomain, tenant_type")
        .eq("tenant_type", "association");
      const tenants = (data || []) as any[];
      const map: Record<string, string> = {};
      for (const a of leagueAssocs) {
        if (a.platform_association_id) {
          map[a.id] = a.platform_association_id as string;
          continue;
        }
        const abbr = (a.abbreviation || "").toLowerCase();
        const name = (a.name || "").toLowerCase();
        const t = tenants.find(
          (t) =>
            (abbr && (t.subdomain || "").toLowerCase() === abbr) ||
            (name && (t.name || "").toLowerCase() === name),
        );
        if (t) map[a.id] = t.id as string;
      }
      return map;
    },
  });

  // Hide league_associations whose linked tenant the user already joined
  const excludeIds = useMemo(() => {
    const out: string[] = [];
    for (const [assocId, tenantId] of Object.entries(tenantsByLeagueAssoc)) {
      if (existingTenantAssocIds.includes(tenantId)) out.push(assocId);
    }
    return out;
  }, [tenantsByLeagueAssoc, existingTenantAssocIds]);

  const remainingCount = leagueAssocs.length - excludeIds.length;
  const hideEntirely = !activeMember || activeMember.plays_league || remainingCount <= 0;

  const join = useMutation({
    mutationFn: async () => {
      if (!clubId || !activeMember?.id) throw new Error("Not ready");
      const sels = Object.values(selections);
      if (sels.length === 0) throw new Error("Pick at least one league");
      await applyLeagueSelections({
        clubId,
        clubMemberId: activeMember.id,
        selections: sels,
        invokeProvision: async (subdomain) => {
          const { error } = await supabase.functions.invoke("provision-association-member", {
            body: { associationSubdomain: subdomain, homeClubId: clubId },
          });
          if (error) throw error;
        },
      });
    },
    onSuccess: () => {
      toast.success("Joined! Your league fees and number(s) are being set up.");
      setOpen(false);
      setSelections({});
      queryClient.invalidateQueries({ queryKey: ["my-association-memberships-min"] });
      queryClient.invalidateQueries({ queryKey: ["account-club-member"] });
      queryClient.invalidateQueries({ queryKey: ["my-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to join leagues");
    },
  });

  if (hideEntirely) return null;

  const Body = (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Are you playing league? Tick the leagues you want to join.
      </p>
      <LeagueParticipationPicker
        clubId={clubId}
        value={selections}
        onChange={setSelections}
        excludeAssociationIds={excludeIds}
        compact
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Not now
        </Button>
        <Button
          size="sm"
          disabled={join.isPending || Object.keys(selections).length === 0}
          onClick={() => join.mutate()}
        >
          {join.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          Join selected
        </Button>
      </div>
    </div>
  );

  if (variant === "banner") {
    return (
      <div className={cn("px-4 mt-2", className)}>
        <Card className="p-3 border-primary/30 bg-primary/5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Trophy className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              {!open ? (
                <>
                  <p className="text-sm font-semibold leading-tight">
                    Are you playing league?
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your club is affiliated to {remainingCount} {remainingCount === 1 ? "league" : "leagues"}. Opt in to play league fixtures.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
                      Choose leagues
                    </Button>
                  </div>
                </>
              ) : (
                Body
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">League membership</h3>
      </div>
      {!open ? (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            Are you playing league? Your club is affiliated to {remainingCount} {remainingCount === 1 ? "league" : "leagues"}.
          </p>
          <Button size="sm" onClick={() => setOpen(true)}>
            Choose leagues
          </Button>
        </>
      ) : (
        Body
      )}
    </Card>
  );
}

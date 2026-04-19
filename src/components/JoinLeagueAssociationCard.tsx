import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface JoinLeagueAssociationCardProps {
  clubId: string | null | undefined;
  variant?: "banner" | "card";
  className?: string;
}

interface AffiliatedAssociation {
  id: string;
  name: string;
  subdomain: string | null;
}

/**
 * Shows affiliated associations the current member can opt-into for league play.
 * Only renders when the member's club is affiliated to at least one association
 * AND the member has not yet been provisioned at any of them.
 */
export function JoinLeagueAssociationCard({ clubId, variant = "card", className }: JoinLeagueAssociationCardProps) {
  const { user } = useAuth();
  const { activeMember } = useMemberContext();
  const queryClient = useQueryClient();

  const { data: associations = [], isLoading } = useQuery({
    queryKey: ["affiliated-associations-for-join", clubId],
    enabled: !!clubId,
    queryFn: async (): Promise<AffiliatedAssociation[]> => {
      const { data, error } = await fromExt("association_affiliated_clubs")
        .select("association:association_tenant_id(id, name, subdomain, tenant_type)")
        .eq("club_id", clubId!)
        .eq("status", "active");
      if (error) throw error;
      return ((data || []) as any[])
        .map((r) => r.association)
        .filter((a) => a && a.tenant_type === "association")
        .map((a: any) => ({ id: a.id, name: a.name, subdomain: a.subdomain }));
    },
    staleTime: 60_000,
  });

  // Check which of these associations the user already has a member row at
  const associationIds = associations.map((a) => a.id);
  const { data: existingMemberships = [] } = useQuery({
    queryKey: ["my-association-memberships", user?.id, associationIds.sort().join(",")],
    enabled: !!user?.id && associationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("club_id")
        .eq("user_id", user!.id)
        .in("club_id", associationIds);
      if (error) throw error;
      return (data || []).map((r: any) => r.club_id as string);
    },
  });

  const joinable = associations.filter((a) => !existingMemberships.includes(a.id));

  const joinMutation = useMutation({
    mutationFn: async (assoc: AffiliatedAssociation) => {
      if (!assoc.subdomain) throw new Error("Association has no subdomain configured");
      const { data, error } = await supabase.functions.invoke("provision-association-member", {
        body: {
          associationSubdomain: assoc.subdomain,
          homeClubId: clubId,
        },
      });
      if (error) throw error;
      return { assoc, data };
    },
    onSuccess: ({ assoc }) => {
      toast.success(`You've joined ${assoc.name}. The admin will allocate your league number and fees.`);
      queryClient.invalidateQueries({ queryKey: ["my-association-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["affiliated-associations-for-join"] });
      queryClient.invalidateQueries({ queryKey: ["account-club-member"] });
      queryClient.invalidateQueries({ queryKey: ["my-tenants"] });
      // Mark on the club-side member row that this user has opted into the association
      if (activeMember?.id) {
        fromExt("club_members")
          .update({ enable_league_association_id: assoc.id, plays_league: true })
          .eq("id", activeMember.id)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["account-club-member"] });
          });
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to join the association");
    },
  });

  if (isLoading || joinable.length === 0) return null;

  if (variant === "banner") {
    return (
      <div className={cn("px-4 mt-2", className)}>
        <Card className="p-3 border-primary/30 bg-primary/5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Trophy className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">
                Join {joinable.length === 1 ? joinable[0].name : "a league association"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your club is affiliated. Opt in to play in league fixtures.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {joinable.map((a) => (
                  <Button
                    key={a.id}
                    size="sm"
                    className="h-7 text-xs"
                    disabled={joinMutation.isPending}
                    onClick={() => joinMutation.mutate(a)}
                  >
                    {joinMutation.isPending && joinMutation.variables?.id === a.id ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : null}
                    Join {a.name}
                  </Button>
                ))}
              </div>
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
      <p className="text-xs text-muted-foreground mb-3">
        Your club is affiliated to {joinable.length === 1 ? "this association" : "these associations"}. Join to participate in league fixtures — the league admin will allocate your number and fees.
      </p>
      <div className="space-y-2">
        {joinable.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{a.name}</p>
              <Badge variant="outline" className="text-[10px] mt-0.5">Annual league fee applies</Badge>
            </div>
            <Button
              size="sm"
              disabled={joinMutation.isPending}
              onClick={() => joinMutation.mutate(a)}
            >
              {joinMutation.isPending && joinMutation.variables?.id === a.id ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3 h-3 mr-1" />
              )}
              Join
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

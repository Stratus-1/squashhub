import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type OrgKind = "national" | "association" | "club";

export interface Organisation {
  id: string;
  kind: OrgKind;
  name: string;
  abbreviation: string | null;
  country: string;
  club_id: string | null;
  league_association_id: string | null;
  is_internal_league?: boolean;
  active: boolean;
}

export interface OrgRelationship {
  id: string;
  parent_org_id: string;
  child_org_id: string;
  effective_to: string | null;
}

export interface OrgNode extends Organisation {
  children: OrgNode[];
}

/** Full organisation hierarchy (national → associations → clubs). */
export function useFederationHierarchy() {
  return useQuery({
    queryKey: ["federation-hierarchy"],
    queryFn: async () => {
      const [orgsRes, relsRes] = await Promise.all([
        supabase.from("organisations").select("*").order("kind").order("name"),
        supabase.from("organisation_relationships").select("id, parent_org_id, child_org_id, effective_to"),
      ]);
      if (orgsRes.error) throw orgsRes.error;
      if (relsRes.error) throw relsRes.error;

      const orgs = (orgsRes.data || []) as unknown as Organisation[];
      const rels = ((relsRes.data || []) as unknown as OrgRelationship[]).filter(
        (r) => !r.effective_to || new Date(r.effective_to) >= new Date(),
      );

      const byId = new Map<string, OrgNode>();
      orgs.forEach((o) => byId.set(o.id, { ...o, children: [] }));

      const hasParent = new Set<string>();
      rels.forEach((r) => {
        const parent = byId.get(r.parent_org_id);
        const child = byId.get(r.child_org_id);
        if (!parent || !child) return;
        parent.children.push(child);
        hasParent.add(child.id);
      });

      const roots = orgs.filter((o) => !hasParent.has(o.id)).map((o) => byId.get(o.id)!);
      const sortTree = (n: OrgNode) => {
        n.children.sort((a, b) => a.name.localeCompare(b.name));
        n.children.forEach(sortTree);
      };
      roots.forEach(sortTree);

      return { orgs, roots, byId };
    },
  });
}

export interface FederationStats {
  associations: number;
  clubs: number;
  members: number;
  competitiveMembers: number;
  activeMembers: number;
  leagues: number;
  tournaments: number;
  upcomingTournaments: number;
  matches90d: number;
}

/** National roll-up figures across every club on the platform. */
export function useFederationStats() {
  return useQuery({
    queryKey: ["federation-stats"],
    queryFn: async (): Promise<FederationStats> => {
      const since = new Date(Date.now() - 90 * 86400_000).toISOString();
      const today = new Date().toISOString().slice(0, 10);

      const count = (q: any) => q.then((r: any) => r.count ?? 0);

      const [
        associations,
        clubs,
        members,
        activeMembers,
        competitiveMembers,
        leagues,
        tournaments,
        upcomingTournaments,
        matches90d,
      ] = await Promise.all([
        count(
          supabase
            .from("organisations")
            .select("id", { count: "exact", head: true })
            .eq("kind", "association")
            .eq("is_internal_league", false)
            .neq("name", "Unaffiliated Clubs"),
        ),
        count(supabase.from("organisations").select("id", { count: "exact", head: true }).eq("kind", "club")),
        count(supabase.from("club_members").select("id", { count: "exact", head: true })),
        count(supabase.from("club_members").select("id", { count: "exact", head: true }).eq("status", "active")),
        count(
          supabase
            .from("member_association_affiliations")
            .select("id", { count: "exact", head: true })
            .eq("active", true)
            .not("league_association_number", "is", null),
        ),
        count(supabase.from("leagues").select("id", { count: "exact", head: true })),
        count(supabase.from("club_champs").select("id", { count: "exact", head: true })),
        count(supabase.from("club_champs").select("id", { count: "exact", head: true }).gte("start_date", today)),
        count(supabase.from("matches").select("id", { count: "exact", head: true }).gte("created_at", since)),
      ]);

      return {
        associations,
        clubs,
        members,
        activeMembers,
        competitiveMembers,
        leagues,
        tournaments,
        upcomingTournaments,
        matches90d,
      };
    },
  });
}

export interface FederationAdmin {
  id: string;
  org_id: string;
  user_id: string;
  role: string;
  active: boolean;
  created_at: string;
}

export function useFederationAdmins() {
  return useQuery({
    queryKey: ["federation-admins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organisation_admins")
        .select("id, org_id, user_id, role, active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as FederationAdmin[];
    },
  });
}

/** Move an organisation under a new parent (drag & drop in the hierarchy tree). */
export function useReparentOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ childId, parentId }: { childId: string; parentId: string }) => {
      if (childId === parentId) throw new Error("An organisation cannot be its own parent.");
      const { error: delErr } = await supabase
        .from("organisation_relationships")
        .delete()
        .eq("child_org_id", childId);
      if (delErr) throw delErr;
      const { error } = await supabase.from("organisation_relationships").insert({
        parent_org_id: parentId,
        child_org_id: childId,
        relationship: "affiliation",
        effective_from: new Date().toISOString().slice(0, 10),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["federation-hierarchy"] });
      qc.invalidateQueries({ queryKey: ["federation-stats"] });
      toast.success("Hierarchy updated");
    },
    onError: (e: any) => toast.error(e.message || "Could not move organisation"),
  });
}

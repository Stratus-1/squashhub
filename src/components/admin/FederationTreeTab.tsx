import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Link2, ArrowUpCircle, EyeOff, ChevronRight, ChevronDown, Users } from "lucide-react";

type StagedOrg = {
  id: string;
  sportyhq_org_key: string;
  name: string;
  kind: string;
  parent_key: string | null;
  parent_org_id: string | null;
  matched_org_id: string | null;
  matched_club_id: string | null;
  status: string;
  last_scraped_at: string;
};

type StagedMember = {
  id: string;
  org_id: string;
  name: string;
  ranking_slug: string | null;
  rank_position: number | null;
  rank_points: number | null;
  club_label: string | null;
  matched_person_id: string | null;
  matched_club_member_id: string | null;
  match_confidence: string | null;
  status: string;
};

const statusBadge = (status: string, confidence?: string | null) => {
  if (status === "promoted") return <Badge className="bg-green-600 text-white">Promoted</Badge>;
  if (status === "ignored") return <Badge variant="secondary">Ignored</Badge>;
  if (status === "matched")
    return (
      <Badge className={confidence === "probable" ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"}>
        {confidence === "probable" ? "Probable match" : "Matched"}
      </Badge>
    );
  return <Badge variant="outline">New</Badge>;
};

export function FederationTreeTab() {
  const qc = useQueryClient();
  const [orgPath, setOrgPath] = useState("");
  const [groupId, setGroupId] = useState("");
  const [associationId, setAssociationId] = useState<string>("");
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);
  const [linkClubId, setLinkClubId] = useState<Record<string, string>>({});

  const { data: associations } = useQuery({
    queryKey: ["fed-associations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organisations")
        .select("id, name")
        .eq("kind", "association")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: clubs } = useQuery({
    queryKey: ["fed-live-clubs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clubs").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: stagedOrgs, isLoading } = useQuery({
    queryKey: ["fed-staged-orgs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sportyhq_orgs")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as StagedOrg[];
    },
  });

  const { data: runs } = useQuery({
    queryKey: ["fed-tree-runs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sportyhq_tree_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: members } = useQuery({
    queryKey: ["fed-staged-members", expandedOrg],
    enabled: !!expandedOrg,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sportyhq_org_members")
        .select("*")
        .eq("org_id", expandedOrg)
        .order("rank_position", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as StagedMember[];
    },
  });

  const scrape = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { action: "scrape_ranking_group" };
      if (groupId.trim()) payload.group_id = Number(groupId.trim());
      else if (orgPath.trim()) payload.organization_path = orgPath.trim();
      else throw new Error("Enter a ranking group ID or an organization path");
      if (associationId) payload.association_org_id = associationId;
      const { data, error } = await supabase.functions.invoke("sportyhq-lookup", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Scrape done: ${d.orgs_found} clubs, ${d.players_found} players staged`);
      qc.invalidateQueries({ queryKey: ["fed-staged-orgs"] });
      qc.invalidateQueries({ queryKey: ["fed-tree-runs"] });
      qc.invalidateQueries({ queryKey: ["fed-staged-members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scrapeNational = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sportyhq-lookup", {
        body: { action: "scrape_national_tree" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (d) => {
      toast.success(`National tree refreshed: ${d.associations} associations, ${d.clubs_staged} clubs staged`);
      qc.invalidateQueries({ queryKey: ["fed-staged-orgs"] });
      qc.invalidateQueries({ queryKey: ["fed-tree-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateOrg = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from("sportyhq_orgs").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fed-staged-orgs"] });
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const promoteOrg = useMutation({
    mutationFn: async (org: StagedOrg) => {
      if (!associationId && !org.parent_org_id) throw new Error("Pick an association first");
      const { data, error } = await supabase.rpc("promote_sportyhq_org", {
        _org_id: org.id,
        _parent_org_id: org.parent_org_id ?? associationId,
        _club_id: org.matched_club_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fed-staged-orgs"] });
      toast.success("Club added to the federation tree");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const promoteMember = useMutation({
    mutationFn: async (m: StagedMember) => {
      const { error } = await supabase.rpc("promote_sportyhq_org_member", { _member_id: m.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fed-staged-members", expandedOrg] });
      toast.success("Player added to the people register");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMember = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from("sportyhq_org_members").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fed-staged-members", expandedOrg] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const clubName = useMemo(() => {
    const map = new Map<string, string>();
    (clubs ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clubs]);

  // Group staged orgs into national -> association -> clubs tree
  const tree = useMemo(() => {
    const orgs = (stagedOrgs ?? []).filter((o) => showIgnored || o.status !== "ignored");
    const q = search.trim().toLowerCase();
    const clubVisible = (o: StagedOrg) =>
      o.kind !== "club" || !q || o.name.toLowerCase().includes(q) || (o.location_label ?? "").toLowerCase().includes(q);
    const groups = new Map<string, { key: string; name: string; kind: string; clubs: StagedOrg[] }>();
    for (const o of orgs) {
      if (o.kind !== "club") continue;
      if (!clubVisible(o)) continue;
      const pk = o.parent_key ?? "";
      const parent = orgs.find((p) => p.sportyhq_org_key === pk) ??
        (stagedOrgs ?? []).find((p) => p.sportyhq_org_key === pk);
      const key = parent ? parent.sportyhq_org_key : pk || "ungrouped";
      const name = parent ? parent.name : pk.startsWith("group:") ? `Ranking group ${pk.slice(6)}` : "Ungrouped discoveries";
      const kind = parent?.kind ?? "group";
      if (!groups.has(key)) groups.set(key, { key, name, kind, clubs: [] });
      groups.get(key)!.clubs.push(o);
    }
    return [...groups.values()].sort((a, b) => b.clubs.length - a.clubs.length);
  }, [stagedOrgs, search, showIgnored]);

  const toggleGroup = (key: string) =>
    setExpandedGroups((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Discover clubs & players from SportyHQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[13px] text-muted-foreground">
            Scrapes an association's public SportyHQ ranking lists into a staging area. Nothing goes live until you
            promote it here. Enter either a ranking group ID (e.g. <code>1218</code>) or an organization path
            (e.g. <code>/organization/view/130</code>).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={associationId} onValueChange={setAssociationId}>
              <SelectTrigger className="w-56 h-9 text-[13px]">
                <SelectValue placeholder="Association (parent)" />
              </SelectTrigger>
              <SelectContent>
                {(associations ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="w-40 h-9 text-[13px]"
              placeholder="Ranking group ID"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            />
            <Input
              className="w-56 h-9 text-[13px]"
              placeholder="/organization/view/130"
              value={orgPath}
              onChange={(e) => setOrgPath(e.target.value)}
            />
            <Button size="sm" onClick={() => scrape.mutate()} disabled={scrape.isPending}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${scrape.isPending ? "animate-spin" : ""}`} />
              {scrape.isPending ? "Scraping…" : "Scrape clubs & players"}
            </Button>
          </div>
          {(runs ?? []).length > 0 && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {(runs ?? []).map((r) => (
                <div key={r.id}>
                  {new Date(r.created_at).toLocaleString()} — {r.status}: {r.orgs_found} clubs, {r.players_found} players
                  {r.message ? ` (${r.message})` : ""}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Discovered clubs ({stagedOrgs?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {isLoading && <p className="text-[13px] text-muted-foreground">Loading…</p>}
          {!isLoading && (stagedOrgs ?? []).length === 0 && (
            <p className="text-[13px] text-muted-foreground">No scraped clubs yet — run a scrape above.</p>
          )}
          {(stagedOrgs ?? []).map((org) => (
            <div key={org.id} className="border rounded-md">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <button
                  className="flex items-center gap-1.5 text-[13px] font-medium"
                  onClick={() => setExpandedOrg(expandedOrg === org.id ? null : org.id)}
                >
                  {expandedOrg === org.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {org.name}
                </button>
                {statusBadge(org.status)}
                {org.matched_club_id && (
                  <span className="text-xs text-muted-foreground">→ {clubName.get(org.matched_club_id) ?? "linked club"}</span>
                )}
                <span className="flex-1" />
                {!org.matched_club_id && org.status !== "ignored" && (
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={linkClubId[org.id] ?? ""}
                      onValueChange={(v) => setLinkClubId((s) => ({ ...s, [org.id]: v }))}
                    >
                      <SelectTrigger className="w-44 h-8 text-xs">
                        <SelectValue placeholder="Link to club…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(clubs ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={!linkClubId[org.id] || updateOrg.isPending}
                      onClick={() =>
                        updateOrg.mutate({ id: org.id, patch: { matched_club_id: linkClubId[org.id], status: "matched" } })
                      }
                    >
                      <Link2 className="h-3 w-3 mr-1" /> Link
                    </Button>
                  </div>
                )}
                {org.status !== "promoted" && org.status !== "ignored" && (
                  <>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={promoteOrg.isPending}
                      onClick={() => promoteOrg.mutate(org)}
                    >
                      <ArrowUpCircle className="h-3 w-3 mr-1" /> Promote
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => updateOrg.mutate({ id: org.id, patch: { status: "ignored" } })}
                    >
                      <EyeOff className="h-3 w-3 mr-1" /> Ignore
                    </Button>
                  </>
                )}
              </div>
              {expandedOrg === org.id && (
                <div className="border-t px-3 py-2 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Users className="h-3 w-3" /> Players discovered in this club
                  </div>
                  {(members ?? []).map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center gap-2 text-[13px] py-1 border-b last:border-0">
                      <span className="w-10 text-xs text-muted-foreground">#{m.rank_position ?? "–"}</span>
                      <span className="font-medium">{m.name}</span>
                      {m.rank_points != null && (
                        <span className="text-xs text-muted-foreground">{m.rank_points.toLocaleString()} pts</span>
                      )}
                      {statusBadge(m.status, m.match_confidence)}
                      <span className="flex-1" />
                      {m.status !== "promoted" && m.status !== "ignored" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={promoteMember.isPending}
                            onClick={() => promoteMember.mutate(m)}
                          >
                            <ArrowUpCircle className="h-3 w-3 mr-1" /> Add to people
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => updateMember.mutate({ id: m.id, patch: { status: "ignored" } })}
                          >
                            <EyeOff className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                  {members && members.length === 0 && (
                    <p className="text-xs text-muted-foreground">No players staged for this club yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

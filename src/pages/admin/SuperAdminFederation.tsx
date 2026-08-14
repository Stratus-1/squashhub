import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Building2, Users, Trophy, Flag, ChevronRight, ChevronDown, ShieldCheck, GripVertical } from "lucide-react";
import {
  useFederationHierarchy,
  useFederationStats,
  useFederationAdmins,
  useReparentOrg,
  useCreateAssociation,
  type OrgNode,
} from "@/hooks/use-federation";
import FederationPeopleTab from "@/components/admin/FederationPeopleTab";
import FederationOrgChart from "@/components/admin/FederationOrgChart";
import { TournamentsPanel } from "@/components/tournaments/TournamentsPanel";



const ROLE_LABELS: Record<string, string> = {
  super_admin: "National super admin",
  competition_admin: "Competition admin",
  finance_admin: "Finance / reporting",
  association_admin: "Association admin",
  tournament_director: "Tournament director",
  league_admin: "League administrator",
  referee: "Referee / scorer",
};

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: number | string; sub?: string; icon: any }) {
  return (
    <Card className="bg-white/[0.04] border-white/10 backdrop-blur-md">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-white/50">{label}</span>
          <Icon className="w-4 h-4 text-white/40" />
        </div>
        <div className="text-2xl font-semibold mt-1 text-white">{value}</div>
        {sub && <div className="text-[11px] text-white/50 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function descendantIds(n: OrgNode, acc: Set<string> = new Set()): Set<string> {
  n.children.forEach((c) => {
    acc.add(c.id);
    descendantIds(c, acc);
  });
  return acc;
}

function TreeNode({
  node,
  depth,
  filter,
  dragId,
  setDragId,
  onDrop,
}: {
  node: OrgNode;
  depth: number;
  filter: string;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDrop: (childId: string, parentId: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const [over, setOver] = useState(false);
  const matches = (n: OrgNode): boolean =>
    !filter ||
    n.name.toLowerCase().includes(filter.toLowerCase()) ||
    n.children.some(matches);

  if (!matches(node)) return null;
  const hasChildren = node.children.length > 0;

  // Can this node accept the currently dragged org?
  const canAccept =
    !!dragId &&
    dragId !== node.id &&
    node.kind !== "club" &&
    !descendantIds(node).has(dragId);

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          setDragId(node.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", node.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOver(false);
        }}
        onDragOver={(e) => {
          if (!canAccept) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          if (!over) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!canAccept) return;
          e.preventDefault();
          e.stopPropagation();
          const childId = e.dataTransfer.getData("text/plain") || dragId!;
          setOver(false);
          setDragId(null);
          setOpen(true);
          onDrop(childId, node.id);
        }}
        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-white/[0.05] ${
          over ? "bg-primary/20 ring-1 ring-primary/60" : ""
        } ${dragId === node.id ? "opacity-40" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        <GripVertical className="w-3 h-3 text-white/25 shrink-0" />
        {hasChildren ? (
          open ? <ChevronDown className="w-3.5 h-3.5 text-white/50" /> : <ChevronRight className="w-3.5 h-3.5 text-white/50" />
        ) : (
          <span className="w-3.5" />
        )}
        <span className="text-sm text-white/90 truncate">{node.name}</span>
        {node.abbreviation && <span className="text-[11px] text-white/40">({node.abbreviation})</span>}
        <Badge
          variant="outline"
          className="ml-auto text-[10px] border-white/20 text-white/60 capitalize"
        >
          {node.is_internal_league ? "Club league" : node.kind === "national" ? "Federation" : node.kind}
        </Badge>
        {hasChildren && (
          <span className="text-[11px] text-white/40 w-10 text-right">{node.children.length}</span>
        )}
      </div>
      {open &&
        node.children.map((c) => (
          <TreeNode
            key={c.id}
            node={c}
            depth={depth + 1}
            filter={filter}
            dragId={dragId}
            setDragId={setDragId}
            onDrop={onDrop}
          />
        ))}
    </div>
  );
}

export default function SuperAdminFederation() {
  const { data: hierarchy, isLoading: loadingTree } = useFederationHierarchy();
  const { data: stats, isLoading: loadingStats } = useFederationStats();
  const { data: admins = [], isLoading: loadingAdmins } = useFederationAdmins();
  const [filter, setFilter] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "list">("chart");
  const reparent = useReparentOrg();
  const createAssociation = useCreateAssociation();

  const orgName = useMemo(() => {
    const map = new Map<string, string>();
    (hierarchy?.orgs || []).forEach((o) => map.set(o.id, o.name));
    return map;
  }, [hierarchy]);

  const nationalOrgId = useMemo(
    () => (hierarchy?.orgs || []).find((o) => o.kind === "national")?.id ?? null,
    [hierarchy],
  );


  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Flag className="w-4 h-4" /> National Federation
        </h2>
        <p className="text-xs text-white/50 mt-0.5">
          Phase 1 foundation — organisation hierarchy, scoped federation roles and the national roll-up.
        </p>
      </div>

      {loadingStats ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-white/60" /></div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Associations" value={stats.associations} icon={Flag} />
          <StatCard
            label="Clubs"
            value={stats.clubs}
            sub={`${stats.affiliatedClubs} affiliated · ${stats.unaffiliatedClubs} unaffiliated`}
            icon={Building2}
          />
          <StatCard
            label="Connected members"
            value={stats.members}
            sub={`${stats.activeMembers} active`}
            icon={Users}
          />
          <StatCard
            label="Competitive members"
            value={stats.competitiveMembers}
            sub="hold a league registration number"
            icon={ShieldCheck}
          />
          <StatCard label="Leagues" value={stats.leagues} icon={Trophy} />
          <StatCard
            label="Tournaments"
            value={stats.tournaments}
            sub={`${stats.upcomingTournaments} upcoming`}
            icon={Trophy}
          />
          <StatCard label="Matches (90 days)" value={stats.matches90d} icon={Trophy} />
          <StatCard label="Federation roles" value={admins.length} icon={ShieldCheck} />
        </div>
      ) : null}

      <Tabs defaultValue="hierarchy">
        <TabsList className="bg-white/[0.06]">
          <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="competitions">Competitions</TabsTrigger>
          <TabsTrigger value="roles">Federation roles</TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="mt-3">
          <FederationPeopleTab />
        </TabsContent>

        <TabsContent value="competitions" className="mt-3">
          <TournamentsPanel
            ownerOrgId={nationalOrgId}
            title="National competitions"
            description="Tournaments owned by the federation. Governance, rules and the shared draw engine are identical to club and association events."
          />
        </TabsContent>



        <TabsContent value="hierarchy" className="mt-3">
          <Card className="bg-white/[0.04] border-white/10 backdrop-blur-md">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm text-white/90">Organisation hierarchy</CardTitle>
                  <p className="text-[11px] text-white/45">
                    Drag a club or league onto an association (or the federation) to re-affiliate it. Clubs can't be
                    dropped onto other clubs.
                  </p>
                </div>
                <div className="flex rounded-md border border-white/15 overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setView("chart")}
                    className={`px-2.5 py-1 text-[11px] ${view === "chart" ? "bg-white/15 text-white" : "text-white/55"}`}
                  >
                    Chart
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className={`px-2.5 py-1 text-[11px] ${view === "list" ? "bg-white/15 text-white" : "text-white/55"}`}
                  >
                    List
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTree ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-white/60" /></div>
              ) : view === "chart" ? (
                <FederationOrgChart
                  roots={hierarchy?.roots || []}
                  onDrop={(childId, parentId) => reparent.mutate({ childId, parentId })}
                  onCreateAssociation={(input) => createAssociation.mutate(input)}
                  creating={createAssociation.isPending}
                />
              ) : (
                <>
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search organisations…"
                    className="mb-3 h-8 text-xs bg-white/[0.06] border-white/10 text-white placeholder:text-white/40"
                  />
                  <div className="max-h-[520px] overflow-y-auto">
                    {(hierarchy?.roots || []).map((r) => (
                      <TreeNode
                        key={r.id}
                        node={r}
                        depth={0}
                        filter={filter}
                        dragId={dragId}
                        setDragId={setDragId}
                        onDrop={(childId, parentId) => reparent.mutate({ childId, parentId })}
                      />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="mt-3">
          <Card className="bg-white/[0.04] border-white/10 backdrop-blur-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white/90">Scoped federation roles</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingAdmins ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-white/60" /></div>
              ) : admins.length === 0 ? (
                <p className="text-xs text-white/50 py-4">
                  No federation roles granted yet. Roles are scoped to an organisation — an association admin sees only
                  their own branch of the hierarchy, never club-private finance, access-control or contact data.
                </p>
              ) : (
                <div className="divide-y divide-white/10">
                  {admins.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 py-2 text-sm text-white/85">
                      <span className="flex-1 truncate">{orgName.get(a.org_id) || "—"}</span>
                      <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">
                        {ROLE_LABELS[a.role] || a.role}
                      </Badge>
                      <span className="text-[11px] text-white/40 font-mono truncate w-40">{a.user_id.slice(0, 8)}…</span>
                      {!a.active && <Badge variant="destructive" className="text-[10px]">inactive</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

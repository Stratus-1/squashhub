import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, ChevronRight, GripVertical, Loader2, Plus, X, EyeOff, Eye, Building2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { groupingOrgIds, orgDescendants, type GroupingRow, type RelRow } from "@/lib/tournaments/eligibility";
import { provinceOf, SA_PROVINCES } from "@/lib/federation/provinces";
import { OrgKindBadge } from "@/components/federation/OrgKindBadge";

type Org = { id: string; name: string; kind: string; club_id: string | null; metadata: Record<string, unknown> | null };
type Grp = GroupingRow & { id: string };
type Pending = { title: string; run: () => Promise<void> };

const db = supabase as any;

type JuniorRow = { member_id: string; name: string | null; gender: string | null; age: number | null; age_group: string | null };

/** Read-only list of a club's juniors (name, gender, age group — never date of birth or contact details). */
function ClubJuniors({ rootOrgId, clubId }: { rootOrgId?: string; clubId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["junior-structure", "members", rootOrgId ?? "all", clubId],
    queryFn: async () => {
      const { data, error } = await db.rpc("org_junior_members_for", { _org_id: rootOrgId ?? null, _club_id: clubId });
      if (error) throw error;
      return (data || []) as JuniorRow[];
    },
  });
  const { data: missing } = useQuery({
    queryKey: ["junior-structure", "missing-birth", rootOrgId ?? "all", clubId],
    queryFn: async () => {
      const { data, error } = await db.rpc("org_club_missing_birth_count_for", { _org_id: rootOrgId ?? null, _club_id: clubId });
      if (error) return 0;
      return Number(data) || 0;
    },
  });
  const missingNote = missing ? (
    <p className="ml-6 sm:ml-8 py-1 text-[11px] text-amber-700 dark:text-amber-400" data-testid="club-missing-birth">
      {missing} member{missing === 1 ? " has" : "s have"} no ID number or birth date yet, so they can't be placed in an age group.
      The club can add the first 6 digits of the ID on each member's profile.
    </p>
  ) : null;
  if (isLoading) return <div className="pl-8 py-1"><Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /></div>;
  if (error) return <p className="pl-8 py-1 text-[11px] text-destructive">Could not load the juniors for this club.</p>;
  if (!data || data.length === 0) return <><p className="pl-8 py-1 text-[11px] text-muted-foreground">No juniors at this club.</p>{missingNote}</>;
  return (
    <>
    <div className="ml-6 sm:ml-8 my-1 rounded-md border border-border/60 divide-y divide-border/40" data-testid="club-juniors">
      {data.map((j) => (
        <div key={j.member_id} className="flex items-center gap-2 px-2 py-1 text-[12px]">
          <span className="truncate flex-1">{j.name || "Unnamed member"}</span>
          {j.gender && <span className="text-[11px] text-muted-foreground capitalize">{j.gender}</span>}
          {j.age_group && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{j.age_group}</Badge>}
          {j.age != null && <span className="text-[11px] text-muted-foreground w-12 text-right">{j.age} yrs</span>}
        </div>
      ))}
    </div>
    {missingNote}
    </>
  );
}

function useJuniorData(rootOrgId?: string) {
  return useQuery({
    queryKey: ["junior-structure", rootOrgId ?? "all"],
    queryFn: async () => {
      const [o, r, g, j, t] = await Promise.all([
        db.from("organisations").select("id, name, kind, club_id, metadata").eq("active", true).order("name"),
        db.from("organisation_relationships").select("parent_org_id, child_org_id, effective_to"),
        db.from("org_groupings").select("id, parent_org_id, child_org_id, mode"),
        rootOrgId ? db.rpc("org_junior_counts_for", { _org_id: rootOrgId }) : db.rpc("org_junior_counts"),
        db.from("clubs").select("id, subdomain").eq("tenant_type", "association"),
      ]);
      if (o.error) throw o.error;
      if (r.error) throw r.error;
      if (g.error) throw g.error;
      // Junior counts are optional (only shown to the people who manage that part of the structure).
      const juniors = new Map<string, number>(((j.data || []) as any[]).map((x) => [x.club_id, x.juniors]));
      const subdomains = new Map<string, string>(((t.data || []) as any[]).map((x) => [x.id, x.subdomain]));
      return { orgs: o.data as Org[], rels: r.data as RelRow[], groupings: g.data as Grp[], juniors, subdomains };
    },
  });
}

/**
 * Junior structure tree. Without `rootOrgId` it is the Super Admin view of every zone. With `rootOrgId`
 * (a zone or provincial workspace) it shows only that part, and moves go through the server's
 * permission-checked junior actions. Senior associations never change here.
 */
export function FederationJuniorTab({ rootOrgId }: { rootOrgId?: string } = {}) {
  const qc = useQueryClient();
  const scoped = !!rootOrgId;
  const { data, isLoading } = useJuniorData(rootOrgId);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [province, setProvince] = useState("all");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [clubOpen, setClubOpen] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [clubName, setClubName] = useState("");
  const [clubTown, setClubTown] = useState("");
  const [clubTarget, setClubTarget] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["junior-structure"] });
    qc.invalidateQueries({ queryKey: ["org-hierarchy-lite"] });
  };
  const act = useMutation({
    mutationFn: async (fn: () => Promise<void>) => fn(),
    onSuccess: () => { refresh(); toast.success("Junior structure updated"); },
    onError: (e: any) => toast.error(e.message || "Could not update the junior structure"),
  });
  const confirm = (title: string, run: () => Promise<void>) => setPending({ title, run });

  const m = useMemo(() => {
    if (!data) return null;
    const byId = new Map(data.orgs.map((o) => [o.id, o]));
    const kids = (id: string, mode = "include") =>
      data.groupings.filter((g) => g.parent_org_id === id && g.mode === mode);
    const national = data.orgs.find((o) => o.kind === "national");
    const root = rootOrgId ? byId.get(rootOrgId) : undefined;
    const allZones = national ? kids(national.id).map((g) => byId.get(g.child_org_id)).filter(Boolean) as Org[] : [];
    const zones = root ? (root.kind === "zone" ? [root] : []) : allZones;
    const provincialsOf = (zoneId: string) => kids(zoneId).map((g) => byId.get(g.child_org_id)).filter((o) => o?.kind === "provincial") as Org[];
    // Provincial associations this view may move clubs into.
    const targets = root
      ? (root.kind === "zone" ? provincialsOf(root.id) : root.kind === "provincial" ? [root] : [])
      : data.orgs.filter((o) => o.kind === "provincial");
    const live = data.rels.filter((r) => !r.effective_to || new Date(r.effective_to) >= new Date());
    const affiliated = new Set(live.map((r) => r.child_org_id));
    const unlinked = data.orgs.filter((o) => o.kind === "club" && !affiliated.has(o.id));
    const coveredBy = new Map<string, string>();
    data.orgs.filter((o) => o.kind === "provincial").forEach((p) => {
      groupingOrgIds(p.id, data.orgs, data.rels, data.groupings).forEach((id) => { if (!coveredBy.has(id)) coveredBy.set(id, p.id); });
    });
    const inRoot = root ? groupingOrgIds(root.id, data.orgs, data.rels, data.groupings) : new Set<string>();
    const clubCount = (id: string) => {
      const ids = groupingOrgIds(id, data.orgs, data.rels, data.groupings);
      let clubs = 0, juniors = 0;
      ids.forEach((x) => {
        const o = byId.get(x);
        if (o?.kind === "club") { clubs += 1; juniors += (o.club_id && data.juniors.get(o.club_id)) || 0; }
      });
      return { clubs, juniors };
    };
    return { byId, kids, root, zones, targets, unlinked, coveredBy, inRoot, clubCount };
  }, [data, rootOrgId]);

  if (isLoading || !data || !m) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  if (scoped && !m.root) {
    return <p className="text-sm text-muted-foreground">This workspace is not linked to the junior structure yet.</p>;
  }

  const name = (id: string) => m.byId.get(id)?.name ?? "—";
  const targetIds = new Set(m.targets.map((t) => t.id));

  const moveInto = (childId: string, provincialId: string, fromId?: string) => {
    if (fromId === provincialId) {
      // "Include" back into the same provincial association.
      confirm(`Bring ${name(childId)} back into ${name(provincialId)}?`, async () => {
        const { error } = await db.rpc("junior_move_org", { _child_org_id: childId, _to_provincial_id: provincialId });
        if (error) throw error;
      });
      return;
    }
    const from = fromId ?? m.coveredBy.get(childId);
    if (from === provincialId) return;
    const title = from
      ? `Move ${name(childId)} from ${name(from)} to ${name(provincialId)}?`
      : `Add ${name(childId)} to ${name(provincialId)}?`;
    confirm(title, async () => {
      const { error } = await db.rpc("junior_move_org", { _child_org_id: childId, _to_provincial_id: provincialId });
      if (error) throw error;
    });
  };
  const removeFrom = (childId: string, provincialId: string, leaveOut = false) =>
    confirm(`${leaveOut ? "Leave" : "Remove"} ${name(childId)} ${leaveOut ? "out of" : "from"} ${name(provincialId)}? Its senior association does not change.`, async () => {
      const { error } = await db.rpc("junior_remove_org", { _child_org_id: childId, _provincial_id: provincialId });
      if (error) throw error;
    });
  const createProvincial = (zoneId: string) => {
    const n = newName.trim();
    if (!n) return;
    confirm(`Create ${n} under ${name(zoneId)}?`, async () => {
      const { data: row, error } = await db.from("organisations").insert({ kind: "provincial", name: n, country: "ZA", active: true }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await db.from("org_groupings").insert({ parent_org_id: zoneId, child_org_id: row.id, mode: "include" });
      if (e2) throw e2;
      setNewName("");
    });
  };
  const createWorkspace = (org: Org) => {
    const suggested = org.name.split(/\s+/).map((w) => w[0]).join("").toLowerCase();
    const sub = window.prompt(`Web address for the ${org.name} workspace (letters only, e.g. ${suggested})`, suggested);
    if (!sub) return;
    act.mutate(async () => {
      const { error } = await db.rpc("federation_create_workspace", { _org_id: org.id, _subdomain: sub });
      if (error) throw error;
    });
  };
  const target = clubTarget || (m.targets.length === 1 ? m.targets[0].id : "");
  const createClub = () => {
    const n = clubName.trim();
    if (!n || !target) return;
    confirm(`Create the club "${n}" in ${name(target)}?`, async () => {
      const { error } = await db.rpc("junior_create_club", { _provincial_id: target, _name: n, _town: clubTown.trim() || null });
      if (error) throw error;
      setClubName(""); setClubTown("");
    });
  };

  const toggleClosed = (id: string) => setClosed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleClub = (id: string) => setClubOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const juniorCountOf = (c: Org) => (c.club_id && data.juniors.get(c.club_id)) || 0;
  const JuniorToggle = ({ club, large }: { club: Org; large?: boolean }) => {
    if (!club.club_id) return <span className={large ? "w-4" : "w-3.5"} />;
    const isOpen = clubOpen.has(club.id);
    const cls = large ? "w-4 h-4" : "w-3.5 h-3.5";
    return (
      <button type="button" onClick={() => toggleClub(club.id)} aria-expanded={isOpen}
        aria-label={`${isOpen ? "Hide" : "Show"} juniors at ${club.name}`} className="-m-1 rounded p-1 hover:bg-muted shrink-0">
        {isOpen ? <ChevronDown className={`${cls} text-muted-foreground`} /> : <ChevronRight className={`${cls} text-muted-foreground`} />}
      </button>
    );
  };
  const JuniorCount = ({ club }: { club: Org }) => {
    const n = juniorCountOf(club);
    const label = `${n} junior${n === 1 ? "" : "s"}`;
    if (!club.club_id) return <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>;
    return (
      <button type="button" onClick={() => toggleClub(club.id)}
        className="text-[11px] text-muted-foreground whitespace-nowrap underline-offset-2 hover:underline hover:text-foreground">{label}</button>
    );
  };
  const dropProps = (provincialId: string) => ({
    onDragOver: (e: React.DragEvent) => { if (dragId && targetIds.has(provincialId)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("text/plain") || dragId;
      setDragId(null);
      if (!raw || !targetIds.has(provincialId)) return;
      const [id, from] = raw.split("|");
      moveInto(id, provincialId, from || undefined);
    },
  });
  const dragProps = (id: string, fromId?: string) => ({
    draggable: m.targets.length > 0,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      const payload = fromId ? `${id}|${fromId}` : id;
      setDragId(payload); e.dataTransfer.setData("text/plain", payload); e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => setDragId(null),
  });
  const MoveTo = ({ id, current, fromId, label = "Move to…" }: { id: string; current?: string; fromId?: string; label?: string }) => {
    const options = m.targets.filter((p) => p.id !== current);
    if (options.length === 0) return null;
    if (options.length === 1 && current === undefined) {
      return (
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => moveInto(id, options[0].id, fromId)}>
          <Plus className="w-3 h-3 mr-1" />Add
        </Button>
      );
    }
    return (
      <Select value="" onValueChange={(v) => moveInto(id, v, fromId)}>
        <SelectTrigger className="h-6 w-[110px] text-[11px]"><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>
          {options.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  };
  const Count = ({ id }: { id: string }) => {
    const c = m.clubCount(id);
    return <span className="text-[11px] text-muted-foreground whitespace-nowrap">{c.clubs} club{c.clubs === 1 ? "" : "s"} · {c.juniors} junior{c.juniors === 1 ? "" : "s"}</span>;
  };
  const Workspace = ({ org }: { org: Org }) => {
    if (scoped) return null;
    const sub = org.club_id ? data.subdomains.get(org.club_id) : undefined;
    if (sub) return <Badge variant="outline" className="text-[10px]" title="Has its own workspace"><ExternalLink className="w-2.5 h-2.5 mr-1" />{sub}</Badge>;
    return (
      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={(e) => { e.stopPropagation(); createWorkspace(org); }}>
        <Plus className="w-3 h-3 mr-1" />Workspace
      </Button>
    );
  };

  const renderProvincial = (p: Org) => {
    const excluded = m.kids(p.id, "exclude");
    const pOpen = scoped ? !closed.has(p.id) : open.has(p.id);
    const canEdit = targetIds.has(p.id);
    return (
      <div key={p.id} {...dropProps(p.id)} className={`rounded-lg ${dragId && canEdit ? "ring-1 ring-dashed ring-primary/40" : ""}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer"
          onClick={() => (scoped ? toggleClosed(p.id) : toggle(p.id))}>
          {pOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-sm font-medium">{p.name}</span>
          <OrgKindBadge kind="provincial" />
          <Workspace org={p} />
          <span className="ml-auto"><Count id={p.id} /></span>
        </div>
        {pOpen && (
          <div className="pl-2 sm:pl-6 pb-1 space-y-0.5">
            {m.kids(p.id).map((g) => {
              const c = m.byId.get(g.child_org_id);
              if (!c) return null;
              const isAssoc = c.kind === "association";
              const cOpen = open.has(g.id);
              const clubs = isAssoc
                ? [...orgDescendants(c.id, data.rels)].map((x) => m.byId.get(x)).filter((o) => o?.kind === "club") as Org[]
                : [];
              return (
                <div key={g.id}>
                  <div {...(canEdit ? dragProps(c.id) : {})} className={`flex flex-wrap items-center gap-x-2 gap-y-1 py-1 px-2 rounded-lg hover:bg-muted/50 ${canEdit ? "cursor-grab" : ""}`}>
                    {canEdit ? <GripVertical className="w-3 h-3 text-muted-foreground/60" /> : <span className="w-3" />}
                    {isAssoc ? (
                      <button type="button" onClick={() => toggle(g.id)} aria-expanded={cOpen}
                        aria-label={`${cOpen ? "Hide" : "Show"} clubs in ${c.name}`} className="-m-1 rounded p-1 hover:bg-muted">
                        {cOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    ) : c.club_id ? <JuniorToggle club={c} large /> : <span className="w-4" />}
                    <span className={`text-[13px] truncate min-w-[65%] sm:min-w-0 flex-1 ${isAssoc || c.club_id ? "cursor-pointer" : ""}`}
                      onClick={isAssoc ? () => toggle(g.id) : c.club_id ? () => toggleClub(c.id) : undefined}>{c.name}</span>
                    <OrgKindBadge kind={isAssoc ? "association" : "club"} className="hidden sm:inline-flex" />
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      {isAssoc && <span className="text-[11px] text-muted-foreground">{clubs.length} club{clubs.length === 1 ? "" : "s"}</span>}
                      {!isAssoc && <JuniorCount club={c} />}
                      {canEdit && <MoveTo id={c.id} current={p.id} />}
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => removeFrom(c.id, p.id)} aria-label={`Remove ${c.name}`}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </span>
                  </div>
                  {!isAssoc && c.club_id && clubOpen.has(c.id) && <ClubJuniors rootOrgId={rootOrgId} clubId={c.club_id} />}
                  {isAssoc && cOpen && (
                    <div className="pl-4 sm:pl-10 space-y-0.5">
                      {clubs.map((cl) => {
                        const ex = excluded.find((e) => e.child_org_id === cl.id);
                        const movedTo = ex ? m.coveredBy.get(cl.id) : undefined;
                        return (
                          <div key={cl.id}>
                          <div {...(ex || !canEdit ? {} : dragProps(cl.id, p.id))}
                            className={`flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-0.5 pl-2 py-0.5 text-[12px] rounded-lg ${ex ? "text-muted-foreground/60" : `text-foreground/80 hover:bg-muted/50 ${canEdit ? "cursor-grab" : ""}`}`}>
                            {ex || !canEdit ? <span className="w-3" /> : <GripVertical className="w-3 h-3 shrink-0 text-muted-foreground/60" aria-label={`Drag ${cl.name}`} />}
                            <JuniorToggle club={cl} />
                            <span className={`truncate min-w-[60%] sm:min-w-0 flex-1 ${ex ? "line-through" : ""} ${cl.club_id ? "cursor-pointer" : ""}`}
                              onClick={cl.club_id ? () => toggleClub(cl.id) : undefined}>{cl.name}</span>
                            {ex && <span className="text-[11px] whitespace-nowrap">{movedTo && movedTo !== p.id ? `moved to ${name(movedTo)}` : "left out"}</span>}
                            <JuniorCount club={cl} />
                            {!ex && canEdit && <MoveTo id={cl.id} current={p.id} fromId={p.id} />}
                            {canEdit && (
                              <Button size="sm" variant="ghost" className="shrink-0 h-6 px-1.5 text-[11px] text-muted-foreground" onClick={() => (ex ? moveInto(cl.id, p.id, p.id) : removeFrom(cl.id, p.id, true))}>
                                {ex ? <><Eye className="w-3 h-3 mr-1" />Include</> : <><EyeOff className="w-3 h-3 mr-1" />Leave out</>}
                              </Button>
                            )}
                          </div>
                          {cl.club_id && clubOpen.has(cl.id) && <ClubJuniors rootOrgId={rootOrgId} clubId={cl.club_id} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {m.kids(p.id).length === 0 && <p className="text-[11px] text-muted-foreground px-2">No clubs yet. Drag clubs here or use "Bring a club in".</p>}
          </div>
        )}
      </div>
    );
  };

  // Right-hand list: Super Admin sees clubs with no senior association; a workspace sees every club not yet in its list.
  const q = search.trim().toLowerCase();
  const pool = scoped
    ? data.orgs.filter((o) => o.kind === "club" && !m.inRoot.has(o.id))
    : m.unlinked;
  const candidates = pool.filter((o) => {
    const loc = String(o.metadata?.sportyhq_location ?? "");
    if (q && !o.name.toLowerCase().includes(q) && !loc.toLowerCase().includes(q)) return false;
    if (province !== "all" && provinceOf(loc) !== province) return false;
    return true;
  });

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{scoped ? `${m.root!.name} — clubs` : "Junior structure"}</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            {scoped
              ? "The clubs in your junior structure. Drag a club onto a provincial association, use \"Move to…\", or bring a club in from the list. Clubs keep their senior association and regional leagues."
              : "Zones and provincial associations group existing associations and clubs for junior competitions. Clubs keep their senior association — nothing here changes the senior structure. Drag a club or association onto a provincial association, or use \"Move to…\". Open an association to drag one of its clubs on its own."}
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {!scoped && <div className="text-sm font-medium px-2 py-1">{data.orgs.find((o) => o.kind === "national")?.name}</div>}
          {m.root?.kind === "provincial" && renderProvincial(m.root)}
          {!scoped && m.zones.length === 0 && <p className="text-xs text-muted-foreground px-2">No zones yet.</p>}
          {m.zones.map((z) => (
            <div key={z.id} className={scoped ? "" : "pl-4"}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => toggleClosed(z.id)}>
                {closed.has(z.id) ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                <span className="text-sm font-medium">{z.name}</span>
                <OrgKindBadge kind="zone" />
                <Workspace org={z} />
                <span className="ml-auto"><Count id={z.id} /></span>
              </div>
              {!closed.has(z.id) && (
                <div className="pl-2 sm:pl-5 space-y-0.5">
                  {m.kids(z.id).map((pg) => {
                    const p = m.byId.get(pg.child_org_id);
                    return p ? renderProvincial(p) : null;
                  })}
                  {!scoped && (
                    <div className="flex items-center gap-2 px-2 pt-1">
                      <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New provincial association name" className="h-7 text-xs max-w-xs" />
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!newName.trim()} onClick={() => createProvincial(z.id)}>
                        <Plus className="w-3 h-3 mr-1" />Add
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-3">
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{scoped ? "Bring a club in" : `Clubs with no association (${m.unlinked.length})`}</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              {scoped
                ? "Search for the club, then drag it onto a provincial association or press Add. A club in another provincial association moves across — it is never in two."
                : "Drag onto a provincial association, or use \"Move to…\"."}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or town…" className="h-8 text-xs" />
              <Select value={province} onValueChange={setProvince}>
                <SelectTrigger className="h-8 w-[150px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All provinces</SelectItem>
                  {SA_PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {scoped && !q && province === "all" ? (
              <p className="text-xs text-muted-foreground py-2">Type a club name or town, or choose a province.</p>
            ) : (
              <div className="max-h-[480px] overflow-y-auto space-y-0.5">
                {candidates.slice(0, 300).map((o) => {
                  const inGroup = m.coveredBy.get(o.id);
                  return (
                    <div key={o.id} {...dragProps(o.id)} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-muted/50 cursor-grab">
                      <GripVertical className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[13px] truncate">{o.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {String(o.metadata?.sportyhq_location ?? "") || "No address"}
                          {inGroup ? ` · in ${name(inGroup)}` : ""}
                        </div>
                      </div>
                      <span className="ml-auto"><MoveTo id={o.id} current={scoped ? undefined : inGroup} /></span>
                    </div>
                  );
                })}
                {candidates.length === 0 && <p className="text-xs text-muted-foreground py-2">No clubs match.</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {m.targets.length > 0 && (
          <Card className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" />Create a new club</CardTitle>
              <p className="text-[11px] text-muted-foreground">Only when the club is not on SquashHub yet — search above first. It is added straight into the provincial association.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="Club name" className="h-8 text-xs" />
              <Input value={clubTown} onChange={(e) => setClubTown(e.target.value)} placeholder="Town (optional)" className="h-8 text-xs" />
              {m.targets.length > 1 && (
                <Select value={clubTarget} onValueChange={setClubTarget}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Provincial association" /></SelectTrigger>
                  <SelectContent>
                    {m.targets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" className="h-8 text-xs w-full" disabled={clubName.trim().length < 3 || !target} onClick={createClub}>
                <Plus className="w-3 h-3 mr-1" />Create club
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm change</AlertDialogTitle>
            <AlertDialogDescription>{pending?.title} The change is recorded and can be reversed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const p = pending; setPending(null); if (p) act.mutate(p.run); }}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

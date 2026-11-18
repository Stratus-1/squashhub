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
import { ChevronDown, ChevronRight, GripVertical, Loader2, Plus, X, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";
import { groupingOrgIds, orgDescendants, type GroupingRow, type RelRow } from "@/lib/tournaments/eligibility";
import { provinceOf, SA_PROVINCES } from "@/lib/federation/provinces";

type Org = { id: string; name: string; kind: string; club_id: string | null; metadata: Record<string, unknown> | null };
type Grp = GroupingRow & { id: string };
type Pending = { title: string; run: () => Promise<void> };

const db = supabase as any;

function useJuniorData() {
  return useQuery({
    queryKey: ["junior-structure"],
    queryFn: async () => {
      const [o, r, g, j] = await Promise.all([
        db.from("organisations").select("id, name, kind, club_id, metadata").eq("active", true).order("name"),
        db.from("organisation_relationships").select("parent_org_id, child_org_id, effective_to"),
        db.from("org_groupings").select("id, parent_org_id, child_org_id, mode"),
        db.rpc("org_junior_counts"),
      ]);
      if (o.error) throw o.error;
      if (r.error) throw r.error;
      if (g.error) throw g.error;
      const juniors = new Map<string, number>(((j.data || []) as any[]).map((x) => [x.club_id, x.juniors]));
      return { orgs: o.data as Org[], rels: r.data as RelRow[], groupings: g.data as Grp[], juniors };
    },
  });
}

export function FederationJuniorTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useJuniorData();
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [province, setProvince] = useState("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");

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
    const zones = national ? kids(national.id).map((g) => byId.get(g.child_org_id)).filter(Boolean) as Org[] : [];
    const provincials = data.orgs.filter((o) => o.kind === "provincial");
    const live = data.rels.filter((r) => !r.effective_to || new Date(r.effective_to) >= new Date());
    const affiliated = new Set(live.map((r) => r.child_org_id));
    const unlinked = data.orgs.filter((o) => o.kind === "club" && !affiliated.has(o.id));
    const clubCount = (id: string) => {
      const ids = groupingOrgIds(id, data.orgs, data.rels, data.groupings);
      let clubs = 0, juniors = 0;
      ids.forEach((x) => {
        const o = byId.get(x);
        if (o?.kind === "club") { clubs += 1; juniors += (o.club_id && data.juniors.get(o.club_id)) || 0; }
      });
      return { clubs, juniors };
    };
    return { byId, kids, zones, provincials, unlinked, clubCount };
  }, [data]);

  if (isLoading || !data || !m) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-white/60" /></div>;
  }

  const name = (id: string) => m.byId.get(id)?.name ?? "—";
  const parentOf = (childId: string) => data.groupings.find((g) => g.child_org_id === childId && g.mode === "include" && m.byId.get(g.parent_org_id)?.kind === "provincial");

  const moveInto = (childId: string, provincialId: string) => {
    const existing = parentOf(childId);
    if (existing?.parent_org_id === provincialId) return;
    const child = m.byId.get(childId);
    const title = existing
      ? `Move ${child?.name} from ${name(existing.parent_org_id)} to ${name(provincialId)}?`
      : `Add ${child?.name} to ${name(provincialId)}?`;
    confirm(title, async () => {
      if (existing) {
        const { error } = await db.from("org_groupings").update({ parent_org_id: provincialId }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("org_groupings").insert({ parent_org_id: provincialId, child_org_id: childId, mode: "include" });
        if (error) throw error;
      }
    });
  };
  const remove = (g: Grp) =>
    confirm(`Remove ${name(g.child_org_id)} from ${name(g.parent_org_id)}? Its senior association does not change.`, async () => {
      const { error } = await db.from("org_groupings").delete().eq("id", g.id);
      if (error) throw error;
    });
  const toggleExclude = (provincialId: string, clubOrgId: string, excluded?: Grp) =>
    excluded
      ? confirm(`Bring ${name(clubOrgId)} back into ${name(provincialId)}?`, async () => {
          const { error } = await db.from("org_groupings").delete().eq("id", excluded.id);
          if (error) throw error;
        })
      : confirm(`Leave ${name(clubOrgId)} out of ${name(provincialId)}? Its senior association does not change.`, async () => {
          const { error } = await db.from("org_groupings").insert({ parent_org_id: provincialId, child_org_id: clubOrgId, mode: "exclude" });
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

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const dropProps = (provincialId: string) => ({
    onDragOver: (e: React.DragEvent) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain") || dragId;
      setDragId(null);
      if (id) moveInto(id, provincialId);
    },
  });
  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDragId(id); e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; },
    onDragEnd: () => setDragId(null),
  });
  const MoveTo = ({ id, current }: { id: string; current?: string }) => (
    <Select value="" onValueChange={(v) => moveInto(id, v)}>
      <SelectTrigger className="h-6 w-[110px] text-[11px] bg-transparent border-white/15 text-white/70"><SelectValue placeholder="Move to…" /></SelectTrigger>
      <SelectContent>
        {m.provincials.filter((p) => p.id !== current).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  const Count = ({ id }: { id: string }) => {
    const c = m.clubCount(id);
    return <span className="text-[11px] text-white/45 whitespace-nowrap">{c.clubs} club{c.clubs === 1 ? "" : "s"} · {c.juniors} junior{c.juniors === 1 ? "" : "s"}</span>;
  };

  const q = search.trim().toLowerCase();
  const unlinked = m.unlinked.filter((o) => {
    const loc = String(o.metadata?.sportyhq_location ?? "");
    if (q && !o.name.toLowerCase().includes(q) && !loc.toLowerCase().includes(q)) return false;
    if (province !== "all" && provinceOf(loc) !== province) return false;
    return true;
  });

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
      <Card className="min-w-0 bg-white/[0.04] border-white/10 backdrop-blur-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/90">Junior structure</CardTitle>
          <p className="text-[11px] text-white/45">
            Zones and provincial associations group existing associations and clubs for junior competitions. Clubs keep
            their senior association — nothing here changes the senior structure. Drag a club or association onto a
            provincial association, or use "Move to…".
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-sm text-white/90 px-2 py-1">{data.orgs.find((o) => o.kind === "national")?.name}</div>
          {m.zones.length === 0 && <p className="text-xs text-white/50 px-2">No zones yet.</p>}
          {m.zones.map((z) => (
            <div key={z.id} className="pl-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 px-2 rounded-lg hover:bg-white/[0.05] cursor-pointer" onClick={() => toggle(z.id)}>
                {open.has(z.id) ? <ChevronRight className="w-3.5 h-3.5 text-white/50" /> : <ChevronDown className="w-3.5 h-3.5 text-white/50" />}
                <span className="text-sm text-white/90">{z.name}</span>
                <Badge variant="outline" className="text-[10px] border-white/20 text-white/60">Zone</Badge>
                <span className="ml-auto"><Count id={z.id} /></span>
              </div>
              {!open.has(z.id) && (
                <div className="pl-2 sm:pl-5 space-y-0.5">
                  {m.kids(z.id).map((pg) => {
                    const p = m.byId.get(pg.child_org_id);
                    if (!p) return null;
                    const excluded = m.kids(p.id, "exclude");
                    const pOpen = open.has(p.id);
                    return (
                      <div key={p.id} {...dropProps(p.id)} className={`rounded-lg ${dragId ? "ring-1 ring-dashed ring-primary/40" : ""}`}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 px-2 rounded-lg hover:bg-white/[0.05] cursor-pointer" onClick={() => toggle(p.id)}>
                          {pOpen ? <ChevronDown className="w-3.5 h-3.5 text-white/50" /> : <ChevronRight className="w-3.5 h-3.5 text-white/50" />}
                          <span className="text-sm text-white/90">{p.name}</span>
                          <Badge variant="outline" className="text-[10px] border-white/20 text-white/60">Provincial</Badge>
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
                                  <div {...dragProps(c.id)} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 px-2 rounded-lg hover:bg-white/[0.05] cursor-grab">
                                    <GripVertical className="w-3 h-3 text-white/25" />
                                    {isAssoc ? (
                                      <button type="button" onClick={() => toggle(g.id)} aria-label="Show clubs">
                                        {cOpen ? <ChevronDown className="w-3.5 h-3.5 text-white/50" /> : <ChevronRight className="w-3.5 h-3.5 text-white/50" />}
                                      </button>
                                    ) : <span className="w-3.5" />}
                                    <span className="text-[13px] text-white/85 truncate min-w-[65%] sm:min-w-0 flex-1">{c.name}</span>
                                    <Badge variant="outline" className="hidden sm:inline-flex text-[10px] border-white/20 text-white/55">{isAssoc ? "Whole association" : "Single club"}</Badge>
                                    <span className="ml-auto flex items-center gap-1 shrink-0">
                                      {isAssoc && <span className="text-[11px] text-white/45">{clubs.length} club{clubs.length === 1 ? "" : "s"}</span>}
                                      <MoveTo id={c.id} current={p.id} />
                                      <Button size="icon" variant="ghost" className="h-6 w-6 text-white/50" onClick={() => remove(g)} aria-label={`Remove ${c.name}`}>
                                        <X className="w-3.5 h-3.5" />
                                      </Button>
                                    </span>
                                  </div>
                                  {isAssoc && cOpen && (
                                    <div className="pl-4 sm:pl-10 space-y-0.5">
                                      {clubs.map((cl) => {
                                        const ex = excluded.find((e) => e.child_org_id === cl.id);
                                        return (
                                          <div key={cl.id} className={`flex items-center gap-2 pl-2 py-0.5 text-[12px] ${ex ? "text-white/35 line-through" : "text-white/70"}`}>
                                            <span className="truncate min-w-0 flex-1">{cl.name}</span>
                                            <span className="text-[11px] text-white/40 whitespace-nowrap">{(cl.club_id && data.juniors.get(cl.club_id)) || 0} juniors</span>
                                            <Button size="sm" variant="ghost" className="shrink-0 h-6 px-1.5 text-[11px] text-white/55" onClick={() => toggleExclude(p.id, cl.id, ex)}>
                                              {ex ? <><Eye className="w-3 h-3 mr-1" />Include</> : <><EyeOff className="w-3 h-3 mr-1" />Leave out</>}
                                            </Button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {m.kids(p.id).length === 0 && <p className="text-[11px] text-white/45 px-2">Drop associations or clubs here.</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 px-2 pt-1">
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New provincial association name"
                      className="h-7 text-xs bg-white/[0.06] border-white/10 text-white placeholder:text-white/40 max-w-xs" />
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!newName.trim()} onClick={() => createProvincial(z.id)}>
                      <Plus className="w-3 h-3 mr-1" />Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="min-w-0 bg-white/[0.04] border-white/10 backdrop-blur-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/90">Clubs with no association ({m.unlinked.length})</CardTitle>
          <p className="text-[11px] text-white/45">Drag onto a provincial association, or use "Move to…".</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or town…"
              className="h-8 text-xs bg-white/[0.06] border-white/10 text-white placeholder:text-white/40" />
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger className="h-8 w-[150px] shrink-0 text-xs bg-white/[0.06] border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All provinces</SelectItem>
                {SA_PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-[560px] overflow-y-auto space-y-0.5">
            {unlinked.slice(0, 300).map((o) => {
              const inGroup = parentOf(o.id);
              return (
                <div key={o.id} {...dragProps(o.id)} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-white/[0.05] cursor-grab">
                  <GripVertical className="w-3 h-3 text-white/25 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[13px] text-white/85 truncate">{o.name}</div>
                    <div className="text-[11px] text-white/40 truncate">
                      {String(o.metadata?.sportyhq_location ?? "") || "No address"}
                      {inGroup ? ` · in ${name(inGroup.parent_org_id)}` : ""}
                    </div>
                  </div>
                  <span className="ml-auto"><MoveTo id={o.id} current={inGroup?.parent_org_id} /></span>
                </div>
              );
            })}
            {unlinked.length === 0 && <p className="text-xs text-white/50 py-2">No clubs match.</p>}
          </div>
        </CardContent>
      </Card>

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

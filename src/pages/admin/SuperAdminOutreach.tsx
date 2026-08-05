import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ImportProspectsDialog } from "@/components/admin/outreach/ImportProspectsDialog";
import { ProspectEditorDialog, type ProspectRecord } from "@/components/admin/outreach/ProspectEditorDialog";
import { SendToClubDialog } from "@/components/admin/outreach/SendToClubDialog";
import { PROSPECT_STATUSES, STATUS_LABEL } from "@/lib/outreach-templates";
import { toCsv } from "@/lib/outreach-import";
import {
  Download, Mail, Pencil, Plus, Search, Upload, Trash2, CalendarClock, Send,
} from "lucide-react";

interface Row extends ProspectRecord {
  contacts: { id: string; name: string | null; role: string | null; email: string; phone: string | null; opted_out: boolean; bounced: boolean }[];
}

/** Pull any SA/international looking phone numbers out of free-text notes. */
const phonesFromNotes = (notes?: string | null): string[] => {
  if (!notes) return [];
  const found = notes.match(/(\+?\d[\d\s().-]{7,}\d)/g) ?? [];
  return [...new Set(found.map((p) => p.trim().replace(/\s{2,}/g, " ")))].slice(0, 3);
};

const STATUS_TONE: Record<string, string> = {
  new: "bg-slate-500/20 text-slate-200 border-slate-400/30",
  contacted: "bg-blue-500/20 text-blue-200 border-blue-400/30",
  opened: "bg-cyan-500/20 text-cyan-200 border-cyan-400/30",
  clicked: "bg-violet-500/20 text-violet-200 border-violet-400/30",
  replied: "bg-emerald-500/20 text-emerald-200 border-emerald-400/30",
  interested: "bg-amber-500/25 text-amber-100 border-amber-400/40",
  not_interested: "bg-zinc-600/30 text-zinc-300 border-zinc-500/30",
  bounced: "bg-red-500/20 text-red-200 border-red-400/30",
  unsubscribed: "bg-red-900/40 text-red-200 border-red-500/30",
};

export default function SuperAdminOutreach() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assocFilter, setAssocFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [nsaFilter, setNsaFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [emailFilter, setEmailFilter] = useState("all");
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ProspectRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState<Row | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("outreach_prospects")
      .select("*, outreach_contacts(id,name,role,email,phone,opted_out,bounced)")
      .order("club_name");
    if (error) {
      toast({ title: "Could not load prospects", description: error.message, variant: "destructive" });
    }
    setRows(
      (data ?? []).map((p: any) => ({ ...p, contacts: p.outreach_contacts ?? [] })) as Row[],
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const associations = useMemo(
    () => [...new Set(rows.map((r) => r.association).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const countries = useMemo(
    () => [...new Set(rows.map((r) => r.country).filter(Boolean))].sort(),
    [rows],
  );
  const allTags = useMemo(
    () => [...new Set(rows.flatMap((r) => r.tags ?? []))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (assocFilter !== "all" && r.association !== assocFilter) return false;
      if (countryFilter !== "all" && r.country !== countryFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (nsaFilter === "yes" && !r.is_nsa) return false;
      if (nsaFilter === "no" && r.is_nsa) return false;
      if (tagFilter !== "all" && !(r.tags ?? []).includes(tagFilter)) return false;
      const hasEmail = r.contacts.some((c) => !!c.email);
      const hasPhone = r.contacts.some((c) => !!c.phone) || phonesFromNotes(r.notes).length > 0;
      if (emailFilter === "with" && !hasEmail) return false;
      if (emailFilter === "without" && hasEmail) return false;
      if (emailFilter === "phone_only" && (hasEmail || !hasPhone)) return false;
      if (emailFilter === "no_contact" && (hasEmail || hasPhone)) return false;
      if (!q) return true;
      return (
        r.club_name.toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q) ||
        (r.association ?? "").toLowerCase().includes(q) ||
        r.contacts.some(
          (c) => c.email.toLowerCase().includes(q) || (c.name ?? "").toLowerCase().includes(q) ||
            (c.phone ?? "").includes(q),
        )
      );
    });
  }, [rows, search, assocFilter, countryFilter, statusFilter, nsaFilter, tagFilter, emailFilter]);

  const followUps = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows
      .filter((r) => r.follow_up_date && r.follow_up_date <= today &&
        !["replied", "interested", "not_interested", "unsubscribed"].includes(r.status))
      .sort((a, b) => (a.follow_up_date ?? "").localeCompare(b.follow_up_date ?? ""));
  }, [rows]);

  const stats = useMemo(() => {
    const contacts = rows.flatMap((r) => r.contacts);
    return {
      clubs: rows.length,
      withEmail: rows.filter((r) => r.contacts.some((c) => !!c.email)).length,
      noEmail: rows.filter((r) => !r.contacts.some((c) => !!c.email)).length,
      contactable: contacts.filter((c) => !c.opted_out && !c.bounced).length,
      replied: rows.filter((r) => ["replied", "interested"].includes(r.status)).length,
    };
  }, [rows]);

  const exportCsv = () => {
    const flat = filtered.flatMap((r) =>
      (r.contacts.length ? r.contacts : [null]).map((c) => ({
        club_name: r.club_name,
        association: r.association ?? "",
        city: r.city ?? "",
        country: r.country,
        courts: r.courts ?? "",
        website: r.website ?? "",
        nsa: r.is_nsa ? "yes" : "no",
        status: STATUS_LABEL[r.status] ?? r.status,
        tags: (r.tags ?? []).join("|"),
        contact_name: c?.name ?? "",
        role: c?.role ?? "",
        has_email: c?.email ? "yes" : "no",
        email: c?.email ?? "",
        phone: c?.phone ?? phonesFromNotes(r.notes).join(" / "),
        source: r.source ?? "",
      })),
    );
    const csv = toCsv(flat, [
      "club_name", "association", "city", "country", "courts", "website",
      "nsa", "status", "tags", "contact_name", "role", "has_email", "email", "phone", "source",
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `squashhub-prospects-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete ${name} and all its contacts from your outreach list?`)) return;
    const { error } = await supabase.from("outreach_prospects").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Deleted" }); load(); }
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("outreach_prospects").update({ status }).eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else setRows((p) => p.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Outreach</h2>
          <p className="text-xs text-white/60">
            Club prospect list, campaigns and response tracking.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/admin/outreach/campaigns")}>
            <Send className="h-4 w-4 mr-1" /> Campaigns
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add club
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Clubs", value: stats.clubs },
          { label: "Contacts", value: stats.contacts },
          { label: "Contactable", value: stats.contactable },
          { label: "NSA clubs", value: stats.nsa },
          { label: "Replied / interested", value: stats.replied },
        ].map((s) => (
          <Card key={s.label} className="p-3 bg-white/5 border-white/10">
            <p className="text-[11px] uppercase tracking-wide text-white/50">{s.label}</p>
            <p className="text-2xl font-semibold">{s.value}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">All clubs</TabsTrigger>
          <TabsTrigger value="followup">
            Needs follow-up
            {followUps.length > 0 && (
              <Badge className="ml-1.5 h-4 px-1 text-[10px]">{followUps.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-3">
          <Card className="p-3 bg-white/5 border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <div className="relative md:col-span-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-white/40" />
                <Input
                  className="pl-8" placeholder="Search club, city or email…"
                  value={search} onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={assocFilter} onValueChange={setAssocFilter}>
                <SelectTrigger><SelectValue placeholder="Association" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All associations</SelectItem>
                  {associations.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All countries</SelectItem>
                  {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {PROSPECT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Select value={nsaFilter} onValueChange={setNsaFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">NSA: any</SelectItem>
                    <SelectItem value="yes">NSA only</SelectItem>
                    <SelectItem value="no">Non-NSA</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger><SelectValue placeholder="Tag" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tags</SelectItem>
                    {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="bg-white/5 border-white/10 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-white/50 border-b border-white/10">
                  <th className="p-2.5">Club</th>
                  <th className="p-2.5">Contacts</th>
                  <th className="p-2.5">Tags</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="p-6 text-center text-white/50">Loading…</td></tr>
                )}
                {!loading && !filtered.length && (
                  <tr><td colSpan={5} className="p-6 text-center text-white/50">
                    No clubs yet — use Import to paste your list.
                  </td></tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-2.5">
                      <div className="font-medium flex items-center gap-1.5">
                        {r.club_name}
                        {r.is_nsa && <Badge className="h-4 px-1 text-[9px] bg-amber-500/25 text-amber-100 border-amber-400/40">NSA</Badge>}
                      </div>
                      <div className="text-white/50 text-[11px]">
                        {[r.city, r.association, r.country].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="p-2.5">
                      {r.contacts.length === 0 && <span className="text-white/40">—</span>}
                      {r.contacts.slice(0, 3).map((c) => (
                        <div key={c.id} className="text-[11px] break-all">
                          <span className="text-white/80">{c.name || c.email}</span>
                          {c.role && <span className="text-white/40"> · {c.role}</span>}
                          {(c.opted_out || c.bounced) && (
                            <span className="text-red-300"> · {c.opted_out ? "opted out" : "bounced"}</span>
                          )}
                        </div>
                      ))}
                      {r.contacts.length > 3 && (
                        <div className="text-[11px] text-white/40">+{r.contacts.length - 3} more</div>
                      )}
                    </td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(r.tags ?? []).map((t) => (
                          <Badge key={t} variant="outline" className="h-4 px-1 text-[9px] border-white/20 text-white/70">{t}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-2.5">
                      <Select value={r.status} onValueChange={(v) => setStatus(r.id, v)}>
                        <SelectTrigger className={`h-7 text-[11px] w-[140px] ${STATUS_TONE[r.status] ?? ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROSPECT_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {r.follow_up_date && (
                        <div className="text-[10px] text-white/50 mt-1 flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" /> {r.follow_up_date}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Send a campaign to this club"
                        onClick={() => { setSendTarget(r); setSendOpen(true); }}>
                        <Mail className="h-3.5 w-3.5 text-sky-300" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => { setEditing(r); setEditorOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => remove(r.id, r.club_name)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="followup">
          <Card className="bg-white/5 border-white/10 p-3">
            {!followUps.length ? (
              <p className="text-sm text-white/50 p-4 text-center">Nothing due for follow-up.</p>
            ) : (
              <div className="space-y-2">
                {followUps.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-2.5">
                    <div>
                      <div className="font-medium text-sm">{r.club_name}</div>
                      <div className="text-[11px] text-white/50">
                        Due {r.follow_up_date} · {STATUS_LABEL[r.status]} ·{" "}
                        {r.contacts.map((c) => c.email).join(", ")}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" asChild>
                        <a href={`mailto:${r.contacts[0]?.email ?? ""}`}>
                          <Mail className="h-3.5 w-3.5 mr-1" /> Email
                        </a>
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => { setEditing(r); setEditorOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <ImportProspectsDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />
      <ProspectEditorDialog
        open={editorOpen} onOpenChange={setEditorOpen} prospect={editing} onSaved={load}
      />
      <SendToClubDialog
        open={sendOpen} onOpenChange={setSendOpen} prospect={sendTarget} onSent={load}
      />
    </div>
  );
}

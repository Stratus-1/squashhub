import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { buildVideoBlock, VIDEO_BLOCK_PLACEHOLDER, STATUS_LABEL } from "@/lib/outreach-templates";
import {
  ArrowLeft, Play, Save, Send, Users, MailOpen, MousePointerClick, RefreshCw, Video,
} from "lucide-react";

const MERGE_FIELDS = [
  "club_name", "contact_name", "first_name", "role", "association", "city", "country",
];

interface Recipient {
  id: string;
  email: string;
  send_status: string;
  sent_at: string | null;
  first_opened_at: string | null;
  open_count: number;
  first_clicked_at: string | null;
  click_count: number;
  unsubscribed_at: string | null;
  error_message: string | null;
  outreach_prospects: { club_name: string; status: string } | null;
}

export default function SuperAdminOutreachCampaignEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [c, setC] = useState<any>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [allProspects, setAllProspects] = useState<any[]>([]);
  const [associations, setAssociations] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testProspectId, setTestProspectId] = useState("sample");
  const [clubSearch, setClubSearch] = useState("");

  const load = async () => {
    if (!id) return;
    const [{ data: camp, error }, { data: recs }, { data: prospects }] = await Promise.all([
      supabase.from("outreach_campaigns").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("outreach_recipients")
        .select("*, outreach_prospects(club_name,status)")
        .eq("campaign_id", id)
        .order("sent_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("outreach_prospects")
        .select("id,club_name,association,country,city,is_nsa,status,tags")
        .order("club_name"),
    ]);
    if (error || !camp) {
      toast({ title: "Campaign not found", variant: "destructive" });
      navigate("/admin/outreach/campaigns");
      return;
    }
    setC(camp);
    setRecipients((recs ?? []) as any);
    setAllProspects(prospects ?? []);
    setAssociations([...new Set((prospects ?? []).map((p: any) => p.association).filter(Boolean))].sort());
    setCountries([...new Set((prospects ?? []).map((p: any) => p.country).filter(Boolean))].sort());
    setTags([...new Set((prospects ?? []).flatMap((p: any) => p.tags ?? []))].sort());
  };

  useEffect(() => { load(); }, [id]);


  const filter = c?.audience_filter ?? {};
  const setFilter = (patch: Record<string, unknown>) =>
    setC((p: any) => ({ ...p, audience_filter: { ...(p.audience_filter ?? {}), ...patch } }));

  const stats = useMemo(() => ({
    total: recipients.length,
    queued: recipients.filter((r) => r.send_status === "queued").length,
    sent: recipients.filter((r) => r.send_status === "sent").length,
    failed: recipients.filter((r) => r.send_status === "failed").length,
    opened: recipients.filter((r) => r.first_opened_at).length,
    clicked: recipients.filter((r) => r.first_clicked_at).length,
    unsub: recipients.filter((r) => r.unsubscribed_at).length,
  }), [recipients]);

  const save = async () => {
    if (!c) return;
    setBusy("save");
    const { error } = await supabase
      .from("outreach_campaigns")
      .update({
        name: c.name,
        subject: c.subject,
        preheader: c.preheader,
        body_html: c.body_html,
        video_desktop_url: c.video_desktop_url || null,
        video_mobile_url: c.video_mobile_url || null,
        video_thumb_url: c.video_thumb_url || null,
        audience_filter: c.audience_filter ?? {},
        daily_cap: Number(c.daily_cap) || 30,
        send_delay_ms: Number(c.send_delay_ms) || 4000,
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    setBusy(null);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Campaign saved" });
  };

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("outreach-send", {
        body: { action, campaign_id: id, ...extra },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    } catch (err) {
      toast({
        title: "Action failed",
        description: (err as Error)?.message ?? "Unknown error",
        variant: "destructive",
      });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const prepare = async () => {
    await save();
    const res = await call("prepare");
    if (res) {
      toast({ title: `${res.added} recipients queued`, description: res.skipped ? `${res.skipped} skipped (opted out or bounced)` : undefined });
      load();
    }
  };

  const sendTest = async () => {
    await save();
    const res = await call("test", {
      to: testTo.trim(),
      prospect_id: testProspectId === "sample" ? undefined : testProspectId,
    });
    if (res) toast({ title: `Test sent to ${res.sent_to}` });
  };

  const run = async () => {
    if (!confirm(`Send this campaign now? Up to ${c.daily_cap} emails will go out in this batch.`)) return;
    const res = await call("run");
    if (res) {
      toast({
        title: res.capped ? "Daily cap already reached" : `${res.sent ?? 0} emails sent`,
        description: res.failed ? `${res.failed} failed` : undefined,
      });
      load();
    }
  };

  const insertField = (f: string) =>
    setC((p: any) => ({ ...p, body_html: `${p.body_html ?? ""}{{${f}}}` }));

  const previewProspect = useMemo(
    () => allProspects.find((p) => p.id === testProspectId),
    [allProspects, testProspectId],
  );

  const previewHtml = useMemo(() => {
    if (!c) return "";
    const vb = buildVideoBlock({
      desktopUrl: c.video_desktop_url,
      mobileUrl: c.video_mobile_url,
      thumbUrl: c.video_thumb_url,
    });
    const p = previewProspect;
    return String(c.body_html ?? "")
      .replace(/{{\s*video_block\s*}}/g, vb)
      .replace(/{{\s*club_name\s*}}/g, p?.club_name ?? "Pretoria Squash Club")
      .replace(/{{\s*contact_name\s*}}/g, "Test Chairman")
      .replace(/{{\s*first_name\s*}}/g, "Test")
      .replace(/{{\s*association\s*}}/g, p?.association ?? "Squash Northerns")
      .replace(/{{\s*city\s*}}/g, p?.city ?? "Pretoria")
      .replace(/{{\s*country\s*}}/g, p?.country ?? "South Africa")
      .replace(/{{\s*role\s*}}/g, "Chairman");
  }, [c, previewProspect]);


  if (!c) return <p className="text-sm text-white/60">Loading…</p>;

  return (
    <div className="space-y-4 max-w-[1200px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => navigate("/admin/outreach/campaigns")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{c.name}</h2>
            <p className="text-xs text-white/60">Status: {c.status}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={save} disabled={busy === "save"}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
          <Button size="sm" variant="outline" onClick={prepare} disabled={!!busy}>
            <Users className="h-4 w-4 mr-1" /> Build audience
          </Button>
          <Button size="sm" onClick={run} disabled={!!busy || !stats.queued}>
            <Play className="h-4 w-4 mr-1" /> Send batch ({stats.queued})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { label: "Recipients", value: stats.total },
          { label: "Queued", value: stats.queued },
          { label: "Sent", value: stats.sent },
          { label: "Opened", value: stats.opened },
          { label: "Clicked", value: stats.clicked },
          { label: "Unsub / failed", value: stats.unsub + stats.failed },
        ].map((s) => (
          <Card key={s.label} className="p-2.5 bg-white/5 border-white/10">
            <p className="text-[10px] uppercase tracking-wide text-white/50">{s.label}</p>
            <p className="text-xl font-semibold">{s.value}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="audience">Audience & sending</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-3">
          <Card className="p-3 bg-white/5 border-white/10 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Campaign name</Label>
                <Input value={c.name ?? ""} onChange={(e) => setC({ ...c, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Subject line</Label>
                <Input value={c.subject ?? ""} onChange={(e) => setC({ ...c, subject: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Preheader (inbox preview text)</Label>
                <Input value={c.preheader ?? ""} onChange={(e) => setC({ ...c, preheader: e.target.value })} />
              </div>
            </div>

            <div className="rounded-lg border border-white/10 p-3 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1">
                <Video className="h-3.5 w-3.5" /> Video block
              </p>
              <p className="text-[11px] text-white/50">
                Links a clickable YouTube thumbnail — never attach the MP4, it gets stripped and flags spam.
                Insert <code>{VIDEO_BLOCK_PLACEHOLDER}</code> in the body where it should appear.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input placeholder="YouTube desktop HD URL" value={c.video_desktop_url ?? ""}
                  onChange={(e) => setC({ ...c, video_desktop_url: e.target.value })} />
                <Input placeholder="YouTube mobile URL" value={c.video_mobile_url ?? ""}
                  onChange={(e) => setC({ ...c, video_mobile_url: e.target.value })} />
                <Input placeholder="Thumbnail image URL" value={c.video_thumb_url ?? ""}
                  onChange={(e) => setC({ ...c, video_thumb_url: e.target.value })} />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <Label className="text-xs mr-1">Body (HTML)</Label>
                {[...MERGE_FIELDS, "video_block"].map((f) => (
                  <Button key={f} size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                    onClick={() => insertField(f)}>
                    {`{{${f}}}`}
                  </Button>
                ))}
              </div>
              <Textarea
                className="font-mono text-[12px]" rows={16}
                value={c.body_html ?? ""} onChange={(e) => setC({ ...c, body_html: e.target.value })}
              />
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[220px]">
                <Label className="text-xs">Send a test to</Label>
                <Input placeholder="you@squashhub.co.za" value={testTo}
                  onChange={(e) => setTestTo(e.target.value)} />
              </div>
              <div className="flex-1 min-w-[220px]">
                <Label className="text-xs">Personalise the test as</Label>
                <Select value={testProspectId} onValueChange={setTestProspectId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="sample">Sample club (Pretoria Squash Club)</SelectItem>
                    {allProspects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.club_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={sendTest} disabled={!!busy || !testTo.includes("@")}>
                <Send className="h-4 w-4 mr-1" /> Send test
              </Button>
            </div>
            <p className="text-[11px] text-white/50">
              The test always goes to the address above — the club is only used to fill in the merge fields.
            </p>

          </Card>

          <Card className="p-3 bg-white/5 border-white/10">
            <p className="text-xs font-semibold mb-2">Preview</p>
            <div className="rounded-lg bg-white p-4 overflow-auto max-h-[520px]">
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="audience">
          <Card className="p-3 bg-white/5 border-white/10 space-y-3">
            <p className="text-xs text-white/60">
              Pick who receives this campaign, then press <strong>Build audience</strong>. Contacts that
              opted out or bounced are always excluded.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Association</Label>
                <Select
                  value={filter.association ?? "all"}
                  onValueChange={(v) => setFilter({ association: v === "all" ? undefined : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All associations</SelectItem>
                    {associations.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Country</Label>
                <Select
                  value={filter.country ?? "all"}
                  onValueChange={(v) => setFilter({ country: v === "all" ? undefined : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All countries</SelectItem>
                    {countries.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">NSA affiliation</Label>
                <Select
                  value={filter.is_nsa === true ? "yes" : filter.is_nsa === false ? "no" : "all"}
                  onValueChange={(v) => setFilter({ is_nsa: v === "all" ? undefined : v === "yes" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    <SelectItem value="yes">NSA clubs only</SelectItem>
                    <SelectItem value="no">Non-NSA clubs only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Current status</Label>
                <Select
                  value={filter.status ?? "all"}
                  onValueChange={(v) => setFilter({ status: v === "all" ? undefined : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any status</SelectItem>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tag</Label>
                <Select
                  value={(filter.tags ?? [])[0] ?? "all"}
                  onValueChange={(v) => setFilter({ tags: v === "all" ? undefined : [v] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any tag</SelectItem>
                    {tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
              <div>
                <Label className="text-xs">Daily cap (emails per day)</Label>
                <Input type="number" value={c.daily_cap ?? 30}
                  onChange={(e) => setC({ ...c, daily_cap: Number(e.target.value) })} />
                <p className="text-[11px] text-white/50 mt-1">
                  Keep it low (20–40) while the sending domain warms up.
                </p>
              </div>
              <div>
                <Label className="text-xs">Delay between emails (ms)</Label>
                <Input type="number" value={c.send_delay_ms ?? 4000}
                  onChange={(e) => setC({ ...c, send_delay_ms: Number(e.target.value) })} />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tracking">
          <Card className="bg-white/5 border-white/10 overflow-x-auto">
            <div className="flex items-center justify-between p-2.5">
              <p className="text-xs text-white/60">Per-recipient delivery and engagement.</p>
              <Button size="sm" variant="ghost" onClick={load}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
              </Button>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-white/50 border-b border-white/10">
                  <th className="p-2.5">Club</th>
                  <th className="p-2.5">Email</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5"><MailOpen className="h-3.5 w-3.5" /></th>
                  <th className="p-2.5"><MousePointerClick className="h-3.5 w-3.5" /></th>
                  <th className="p-2.5">Sent</th>
                </tr>
              </thead>
              <tbody>
                {!recipients.length && (
                  <tr><td colSpan={6} className="p-6 text-center text-white/50">
                    No recipients yet — set the audience and press Build audience.
                  </td></tr>
                )}
                {recipients.map((r) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="p-2.5">{r.outreach_prospects?.club_name ?? "—"}</td>
                    <td className="p-2.5 break-all">{r.email}</td>
                    <td className="p-2.5">
                      <Badge variant="outline" className="text-[10px]">
                        {r.unsubscribed_at ? "unsubscribed" : r.send_status}
                      </Badge>
                      {r.error_message && (
                        <div className="text-[10px] text-red-300 break-words">{r.error_message}</div>
                      )}
                    </td>
                    <td className="p-2.5">{r.open_count || "—"}</td>
                    <td className="p-2.5">{r.click_count || "—"}</td>
                    <td className="p-2.5 text-white/60 text-[11px]">
                      {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

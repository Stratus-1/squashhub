import { useState, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Mail, Plus, Trash2, Send, Users, Edit, Copy, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const MERGE_FIELDS = [
  { key: "title", label: "Title" },
  { key: "first_name", label: "First name" },
  { key: "surname", label: "Surname" },
  { key: "name", label: "Full name" },
  { key: "member_number", label: "Member #" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "id_number", label: "ID number" },
  { key: "league_name", label: "League name" },
  { key: "league_number", label: "League #" },
  { key: "club_name", label: "Club name" },
  { key: "club_email", label: "Club email" },
  { key: "club_phone", label: "Club phone" },
];

interface Template { id: string; name: string; subject: string; body_html: string; }
interface Campaign { id: string; name: string; subject: string; status: string; sent_count: number; failed_count: number; total_recipients: number; sent_at: string | null; created_at: string; audience_type: string; }

export function CommunicationsTab({ clubId }: { clubId: string }) {
  const [tab, setTab] = useState("templates");
  const [editing, setEditing] = useState<Template | null>(null);
  const [campaignFromTemplate, setCampaignFromTemplate] = useState<Template | null>(null);

  return (
    <div className="space-y-3">
      <Card className="p-3 bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mail className="w-4 h-4 text-primary" />
          Build branded email templates with merge fields, then send campaigns to all members, selected members, or a league. Emails go via your club SMTP and include your saved signature automatically.
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-3">
          <TemplatesPanel
            clubId={clubId}
            onEdit={(t) => setEditing(t)}
            onNew={() => setEditing({ id: "", name: "", subject: "", body_html: "" })}
            onSend={(t) => setCampaignFromTemplate(t)}
          />
        </TabsContent>
        <TabsContent value="campaigns" className="mt-3">
          <CampaignsPanel clubId={clubId} onNew={() => setCampaignFromTemplate({ id: "", name: "New campaign", subject: "", body_html: "" })} />
        </TabsContent>
      </Tabs>

      {editing && <TemplateEditorDialog clubId={clubId} template={editing} onClose={() => setEditing(null)} />}
      {campaignFromTemplate && <CampaignDialog clubId={clubId} template={campaignFromTemplate} onClose={() => setCampaignFromTemplate(null)} />}
    </div>
  );
}

function TemplatesPanel({ clubId, onEdit, onNew, onSend }: { clubId: string; onEdit: (t: Template) => void; onNew: () => void; onSend: (t: Template) => void; }) {
  const qc = useQueryClient();
  const { data: templates = [] } = useQuery({
    queryKey: ["email-templates", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("club_email_templates").select("*").eq("club_id", clubId).order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Template[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("club_email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates", clubId] }); toast({ title: "Template deleted" }); },
  });

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Email templates ({templates.length})</p>
        <Button size="sm" onClick={onNew}><Plus className="w-3.5 h-3.5 mr-1" />New template</Button>
      </div>
      {templates.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No templates yet. Create your first one.</p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 p-2 rounded border border-border hover:bg-accent/30">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.name}</p>
                <p className="text-xs text-muted-foreground truncate">{t.subject || <span className="italic">(no subject)</span>}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onSend(t)} title="Send as campaign"><Send className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(t)}><Edit className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete "${t.name}"?`)) del.mutate(t.id); }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function MergeFieldChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {MERGE_FIELDS.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onInsert(`{{${f.key}}}`)}
          className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
          title={`Insert {{${f.key}}}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function TemplateEditorDialog({ clubId, template, onClose }: { clubId: string; template: Template; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body_html);
  const [activeField, setActiveField] = useState<"subject" | "body">("subject");
  const [bodyEditor, setBodyEditor] = useState<any>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const isNew = !template.id;

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      const payload = { club_id: clubId, name: name.trim(), subject, body_html: body };
      if (isNew) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("club_email_templates").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("club_email_templates").update(payload).eq("id", template.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates", clubId] }); toast({ title: isNew ? "Template created" : "Template saved" }); onClose(); },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const insertToken = (token: string) => {
    if (activeField === "body" && bodyEditor) {
      bodyEditor.chain().focus().insertContent(token).run();
      return;
    }
    const el = subjectRef.current;
    if (el) {
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + token + subject.slice(end);
      setSubject(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setSubject((s) => s + token);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New template" : "Edit template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Template name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly Newsletter" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Subject {activeField === "subject" && <span className="text-primary">●</span>}</Label>
            </div>
            <Input ref={subjectRef} value={subject} onChange={(e) => setSubject(e.target.value)} onFocus={() => setActiveField("subject")} placeholder="e.g. Hi {{first_name}}, news from {{club_name}}" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Body {activeField === "body" && <span className="text-primary">●</span>}</Label>
              <span className="text-[10px] text-muted-foreground">Your signature is appended automatically</span>
            </div>
            <RichTextEditor value={body} onChange={setBody} placeholder="Write your email…" onEditorReady={setBodyEditor} onFocus={() => setActiveField("body")} />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">
              Click a merge field to insert into the <strong>{activeField}</strong>. Click inside the subject or body first to switch.
            </p>
            <MergeFieldChips onInsert={insertToken} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save template"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDialog({ clubId, template, onClose }: { clubId: string; template: Template; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(template.name || "Campaign");
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body_html);
  const [audienceType, setAudienceType] = useState<"all" | "selected" | "league">("all");
  const [leagueId, setLeagueId] = useState<string>("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberFilter, setMemberFilter] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [activeField, setActiveField] = useState<"subject" | "body">("subject");
  const [bodyEditor, setBodyEditor] = useState<any>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  const insertToken = (token: string) => {
    if (activeField === "body" && bodyEditor) {
      bodyEditor.chain().focus().insertContent(token).run();
      return;
    }
    const el = subjectRef.current;
    if (el) {
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + token + subject.slice(end);
      setSubject(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setSubject((s) => s + token);
    }
  };

  const { data: leagues = [] } = useQuery({
    queryKey: ["club-leagues", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leagues").select("id,name").eq("club_id", clubId).order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["club-members-email", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("club_members").select("id,name,email,phone,club_member_number,id_number").eq("club_id", clubId).not("email", "is", null).order("name");
      if (error) throw error;
      return data as { id: string; name: string; email: string; phone: string | null; club_member_number: string | null; id_number: string | null }[];
    },
  });

  const { data: club } = useQuery({
    queryKey: ["club-comms-meta", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clubs").select("name,email,phone,email_signature_html,email_disclaimer").eq("id", clubId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: leagueMemberIds = [] } = useQuery({
    queryKey: ["league-member-ids", leagueId],
    enabled: audienceType === "league" && !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase.from("member_league_registrations").select("club_member_id, league_association_number").eq("league_id", leagueId);
      if (error) throw error;
      return (data || []) as { club_member_id: string; league_association_number: string | null }[];
    },
  });

  const filteredMembers = useMemo(() => {
    const q = memberFilter.toLowerCase().trim();
    if (!q) return members;
    return members.filter((m) => (m.name || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q));
  }, [members, memberFilter]);

  const audienceCount = useMemo(() => {
    if (audienceType === "all") return members.length;
    if (audienceType === "selected") return selectedMemberIds.length;
    if (audienceType === "league") return leagueMemberIds.length;
    return 0;
  }, [audienceType, members, selectedMemberIds, leagueMemberIds]);

  const firstRecipient = useMemo(() => {
    let m: any = null;
    let leagueNum = "";
    if (audienceType === "all") m = members[0];
    else if (audienceType === "selected") m = members.find((mm) => mm.id === selectedMemberIds[0]);
    else if (audienceType === "league" && leagueMemberIds.length) {
      const first = leagueMemberIds[0];
      m = members.find((mm) => mm.id === first.club_member_id);
      leagueNum = String(first.league_association_number || "");
    }
    return { member: m, leagueNum };
  }, [audienceType, members, selectedMemberIds, leagueMemberIds]);

  const previewLeagueName = useMemo(() => leagues.find((l) => l.id === leagueId)?.name || "", [leagues, leagueId]);

  const previewVars: Record<string, string> = useMemo(() => {
    const m = firstRecipient.member;
    if (m) {
      const full = String(m.name || "").trim();
      const [first, ...rest] = full.split(/\s+/);
      return {
        title: "", first_name: first || "", surname: rest.join(" "), name: full,
        member_number: String(m.club_member_number || ""),
        email: String(m.email || ""), phone: String(m.phone || ""),
        id_number: String(m.id_number || ""),
        league_name: previewLeagueName, league_number: firstRecipient.leagueNum,
        club_name: String(club?.name || ""), club_email: String(club?.email || ""), club_phone: String(club?.phone || ""),
      };
    }
    return {
      title: "Mr", first_name: "Jane", surname: "Doe", name: "Jane Doe",
      member_number: "M001", email: "jane@example.com", phone: "0821234567",
      id_number: "8001015009087", league_name: previewLeagueName || "Men's League 1", league_number: "12345",
      club_name: String(club?.name || "Your Club"), club_email: String(club?.email || "info@yourclub.co.za"), club_phone: String(club?.phone || "0110001111"),
    };
  }, [firstRecipient, previewLeagueName, club]);
  const renderPreview = (s: string) => String(s ?? "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, k) => previewVars[k] ?? "");

  const escapeHtml = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sigBlock = club?.email_signature_html
    ? `<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:14px">${club.email_signature_html}</div>`
    : "";
  const disclaimerBlock = club?.email_disclaimer
    ? `<p style="margin:14px 0 0;font-size:11px;color:#94a3b8;line-height:1.4">${escapeHtml(club.email_disclaimer)}</p>`
    : "";

  const send = useMutation({
    mutationFn: async () => {
      if (!subject.trim()) throw new Error("Subject required");
      if (!body.trim()) throw new Error("Body required");
      if (audienceType === "league" && !leagueId) throw new Error("Pick a league");
      if (audienceType === "selected" && !selectedMemberIds.length) throw new Error("Select at least one member");

      const { data: { user } } = await supabase.auth.getUser();
      const { data: campaign, error } = await supabase.from("club_email_campaigns").insert({
        club_id: clubId, template_id: template.id || null, name, subject, body_html: body,
        audience_type: audienceType,
        audience_member_ids: audienceType === "selected" ? selectedMemberIds : [],
        audience_league_id: audienceType === "league" ? leagueId : null,
        status: "draft", created_by: user?.id,
      }).select("id").single();
      if (error) throw error;

      const { data: result, error: fnErr } = await supabase.functions.invoke("send-club-campaign", { body: { campaign_id: campaign.id } });
      if (fnErr) throw fnErr;
      if ((result as any)?.error) throw new Error((result as any).error);
      return result;
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["email-campaigns", clubId] });
      toast({ title: "Campaign sent", description: `Sent ${r?.sent || 0} • Failed ${r?.failed || 0} • Total ${r?.total || 0}` });
      onClose();
    },
    onError: (e: any) => toast({ title: "Send failed", description: e?.message || String(e), variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send campaign</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Campaign name (internal)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Audience</Label>
              <Select value={audienceType} onValueChange={(v: any) => setAudienceType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All members ({members.length})</SelectItem>
                  <SelectItem value="selected">Selected members</SelectItem>
                  <SelectItem value="league">League players</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {audienceType === "league" && (
              <div>
                <Label className="text-xs">League</Label>
                <Select value={leagueId} onValueChange={setLeagueId}>
                  <SelectTrigger><SelectValue placeholder="Choose a league…" /></SelectTrigger>
                  <SelectContent>
                    {leagues.map((l) => (<SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {audienceType === "selected" && (
              <div>
                <Label className="text-xs">Members ({selectedMemberIds.length} selected)</Label>
                <Input placeholder="Filter…" value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="mb-2" />
                <ScrollArea className="h-48 border border-border rounded p-2">
                  <div className="space-y-1">
                    {filteredMembers.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/40 rounded p-1">
                        <Checkbox
                          checked={selectedMemberIds.includes(m.id)}
                          onCheckedChange={(c) => setSelectedMemberIds((prev) => c ? [...prev, m.id] : prev.filter((id) => id !== m.id))}
                        />
                        <span className="flex-1">{m.name}</span>
                        <span className="text-muted-foreground">{m.email}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex gap-2 mt-1">
                  <Button size="sm" variant="ghost" onClick={() => setSelectedMemberIds(filteredMembers.map((m) => m.id))}>Select visible</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedMemberIds([])}>Clear</Button>
                </div>
              </div>
            )}

            <Badge variant="outline" className="gap-1"><Users className="w-3 h-3" />{audienceType === "league" ? "League members will be resolved on send" : `${audienceCount} recipient${audienceCount === 1 ? "" : "s"}`}</Badge>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Subject {activeField === "subject" && <span className="text-primary">●</span>}</Label>
              <Input ref={subjectRef} value={subject} onChange={(e) => setSubject(e.target.value)} onFocus={() => setActiveField("subject")} />
            </div>
            <div>
              <Label className="text-xs">Body {activeField === "body" && <span className="text-primary">●</span>}</Label>
              <RichTextEditor value={body} onChange={setBody} onEditorReady={setBodyEditor} onFocus={() => setActiveField("body")} />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Click a merge field to insert into the <strong>{activeField}</strong>:</p>
              <MergeFieldChips onInsert={insertToken} />
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowPreview((s) => !s)} className="gap-1"><Eye className="w-3 h-3" />{showPreview ? "Hide" : "Show"} preview {firstRecipient.member ? "(first recipient)" : "(sample data)"}</Button>
            {showPreview && (
              <div className="border border-border rounded p-3 bg-background space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  {firstRecipient.member
                    ? <>Previewing as <strong>{previewVars.name}</strong> &lt;{previewVars.email}&gt; — the first recipient in this audience.</>
                    : <>No recipients resolved yet — showing sample data.</>}
                </p>
                <div>
                  <p className="text-[11px] text-muted-foreground">Subject preview:</p>
                  <p className="text-sm font-medium">{renderPreview(subject)}</p>
                </div>
                <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderPreview(body) + sigBlock + disclaimerBlock) }} />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (confirm("Send this campaign now? Emails will be delivered immediately.")) send.mutate(); }} disabled={send.isPending} className="gap-1">
            <Send className="w-3.5 h-3.5" />{send.isPending ? "Sending…" : "Send campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignsPanel({ clubId, onNew }: { clubId: string; onNew: () => void }) {
  const { data: campaigns = [] } = useQuery({
    queryKey: ["email-campaigns", clubId],
    queryFn: async () => {
      const { data, error } = await supabase.from("club_email_campaigns").select("*").eq("club_id", clubId).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as Campaign[];
    },
  });

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Campaign history ({campaigns.length})</p>
        <Button size="sm" onClick={onNew}><Plus className="w-3.5 h-3.5 mr-1" />New campaign</Button>
      </div>
      {campaigns.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No campaigns sent yet.</p>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => {
            const color = c.status === "sent" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : c.status === "failed" ? "bg-destructive/15 text-destructive"
              : c.status === "sending" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              : "bg-muted text-muted-foreground";
            return (
              <div key={c.id} className="flex items-center gap-2 p-2 rounded border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.subject}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.name} • {c.audience_type} • {c.sent_at ? new Date(c.sent_at).toLocaleString() : new Date(c.created_at).toLocaleString()}
                  </p>
                </div>
                <Badge className={color}>{c.status}</Badge>
                <div className="text-[11px] text-muted-foreground tabular-nums w-28 text-right">
                  Sent {c.sent_count}/{c.total_recipients}{c.failed_count > 0 && <span className="text-destructive"> • {c.failed_count} failed</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

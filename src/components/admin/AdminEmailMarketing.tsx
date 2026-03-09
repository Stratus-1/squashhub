import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarClock, FileText, Mail, Pencil, Plus, Send, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type EmailTemplateRow = {
  id: string;
  name: string;
  subject: string;
  html: string;
  text: string | null;
  created_at: string;
  updated_at: string;
};

type EmailCampaignRow = {
  id: string;
  name: string;
  audience: string;
  template_id: string;
  status: "draft" | "scheduled" | "queued" | "cancelled";
  send_at: string | null;
  subject_override: string | null;
  preview_text: string | null;
  url: string | null;
  queued_at: string | null;
  last_queued_count: number;
  created_at: string;
  updated_at: string;
};

function toLocalDateTimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fromLocalDateTimeInput(value: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function AdminEmailMarketing({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();

  const { data: templatesResult, isLoading: templatesLoading } = useQuery({
    queryKey: ["admin", "email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) {
        if ((error as any).code === "42P01") return { available: false as const, rows: [] as EmailTemplateRow[] };
        throw error;
      }
      return { available: true as const, rows: (data || []) as EmailTemplateRow[] };
    },
    enabled,
  });

  const { data: campaignsResult, isLoading: campaignsLoading } = useQuery({
    queryKey: ["admin", "email-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        if ((error as any).code === "42P01") return { available: false as const, rows: [] as EmailCampaignRow[] };
        throw error;
      }
      return { available: true as const, rows: (data || []) as EmailCampaignRow[] };
    },
    enabled,
  });

  const templates = templatesResult?.rows || [];
  const campaigns = campaignsResult?.rows || [];
  const available = templatesResult?.available !== false && campaignsResult?.available !== false;

  const templateMap = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  const [templateEditor, setTemplateEditor] = useState<{
    open: boolean;
    editing: EmailTemplateRow | null;
    name: string;
    subject: string;
    html: string;
    text: string;
  }>({ open: false, editing: null, name: "", subject: "", html: "", text: "" });

  const [campaignEditor, setCampaignEditor] = useState<{
    open: boolean;
    editing: EmailCampaignRow | null;
    name: string;
    templateId: string;
    status: "draft" | "scheduled";
    sendAtLocal: string;
    subjectOverride: string;
    previewText: string;
    url: string;
  }>({
    open: false,
    editing: null,
    name: "",
    templateId: "",
    status: "draft",
    sendAtLocal: "",
    subjectOverride: "",
    previewText: "",
    url: "/events",
  });

  useEffect(() => {
    if (campaignEditor.open) return;
    setCampaignEditor((s) => ({ ...s, editing: null }));
  }, [campaignEditor.open]);

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const name = templateEditor.name.trim();
      const subject = templateEditor.subject.trim();
      const html = templateEditor.html.trim();
      const text = templateEditor.text.trim();
      if (!name) throw new Error("Template name is required");
      if (!subject) throw new Error("Email subject is required");
      if (!html) throw new Error("HTML is required");

      const payload: any = { name, subject, html, text: text || null };
      if (templateEditor.editing?.id) {
        const { error } = await supabase.from("email_templates").update(payload).eq("id", templateEditor.editing.id);
        if (error) throw error;
        return templateEditor.editing.id;
      }
      const { data, error } = await supabase.from("email_templates").insert(payload).select("id").single();
      if (error) throw error;
      return data?.id as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "email-templates"] });
      toast.success("Template saved");
      setTemplateEditor({ open: false, editing: null, name: "", subject: "", html: "", text: "" });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save template"),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "email-templates"] });
      toast.success("Template deleted");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to delete template"),
  });

  const saveCampaign = useMutation({
    mutationFn: async () => {
      const name = campaignEditor.name.trim();
      const templateId = campaignEditor.templateId;
      if (!name) throw new Error("Campaign name is required");
      if (!templateId) throw new Error("Select a template");
      if (campaignEditor.status === "scheduled" && !campaignEditor.sendAtLocal) throw new Error("Pick a send time");

      const payload: any = {
        name,
        template_id: templateId,
        audience: "marketing_opt_in",
        status: campaignEditor.status,
        send_at: campaignEditor.status === "scheduled" ? fromLocalDateTimeInput(campaignEditor.sendAtLocal) : null,
        subject_override: campaignEditor.subjectOverride.trim() || null,
        preview_text: campaignEditor.previewText.trim() || null,
        url: campaignEditor.url.trim() || "/events",
      };

      if (campaignEditor.editing?.id) {
        const { error } = await supabase.from("email_campaigns").update(payload).eq("id", campaignEditor.editing.id);
        if (error) throw error;
        return campaignEditor.editing.id;
      }

      const { data, error } = await supabase.from("email_campaigns").insert(payload).select("id").single();
      if (error) throw error;
      return data?.id as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "email-campaigns"] });
      toast.success("Campaign saved");
      setCampaignEditor({
        open: false,
        editing: null,
        name: "",
        templateId: "",
        status: "draft",
        sendAtLocal: "",
        subjectOverride: "",
        previewText: "",
        url: "/events",
      });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save campaign"),
  });

  const queueCampaign = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await (supabase as any).rpc("queue_marketing_email_campaign", {
        p_campaign_id: campaignId,
        p_internal_secret: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "email-campaigns"] });
      toast.success(`Queued ${data?.queued ?? 0} emails`);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to queue campaign"),
  });

  const processDue = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("process_due_marketing_email_campaigns", {
        p_limit: 10,
        p_internal_secret: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data: any) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "email-campaigns"] });
      const processed = Array.isArray(data?.processed) ? data.processed.length : 0;
      toast.success(processed > 0 ? `Processed ${processed} campaign(s)` : "No due campaigns");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to process due campaigns"),
  });

  const cancelCampaign = useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase.from("email_campaigns").update({ status: "cancelled" }).eq("id", campaignId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "email-campaigns"] });
      toast.success("Campaign cancelled");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to cancel campaign"),
  });

  const dueCount = useMemo(() => {
    const now = Date.now();
    return campaigns.filter((c) => c.status === "scheduled" && c.send_at && new Date(c.send_at).getTime() <= now).length;
  }, [campaigns]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold font-heading">Email marketing</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            disabled={!enabled || processDue.isPending || dueCount === 0}
            onClick={() => processDue.mutate()}
            title="Queues any scheduled campaigns that are due"
          >
            <CalendarClock className="w-3 h-3" />
            Run due ({dueCount})
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        Build templates, create campaigns, and queue marketing emails (opt-in only). Scheduled campaigns need a cron that calls the maintenance function periodically.
      </p>

      {!available ? (
        <div className="mt-3 rounded-lg border border-border p-3 text-xs text-muted-foreground">
          Email marketing tables are not available yet. Apply the latest Supabase migrations, then refresh.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
          {/* Templates */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs font-semibold">Templates</p>
              </div>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={!enabled}
                onClick={() =>
                  setTemplateEditor({
                    open: true,
                    editing: null,
                    name: "",
                    subject: "",
                    html:
                      `<div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height:1.4; color:#0f172a">` +
                      `<h2 style="margin:0 0 10px 0">{{campaign_name}}</h2>` +
                      `<p style="margin:0 0 14px 0; color:#334155">Hi {{name}},</p>` +
                      `<p style="margin:0 0 18px 0; color:#334155">Write your message here…</p>` +
                      `<p style="margin:0 0 18px 0"><a href="{{link_url}}" style="display:inline-block; padding:10px 14px; background:#1a5c3a; color:#fff; text-decoration:none; border-radius:8px">Open</a></p>` +
                      `<p style="margin:0; font-size:12px; color:#64748b">Unsubscribe: manage your email preferences in the app: <a href="{{unsubscribe_url}}">{{unsubscribe_url}}</a></p>` +
                      `</div>`,
                    text: "",
                  })
                }
              >
                <Plus className="w-3 h-3" /> New
              </Button>
            </div>

            {templatesLoading ? (
              <p className="text-xs text-muted-foreground mt-3">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-3">No templates yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {templates.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{t.subject}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() =>
                          setTemplateEditor({
                            open: true,
                            editing: t,
                            name: t.name || "",
                            subject: t.subject || "",
                            html: t.html || "",
                            text: t.text || "",
                          })
                        }
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={deleteTemplate.isPending}
                        onClick={() => {
                          if (!confirm(`Delete template “${t.name}”?`)) return;
                          deleteTemplate.mutate(t.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {templates.length > 8 ? (
                  <p className="text-[11px] text-muted-foreground">Showing 8 of {templates.length}.</p>
                ) : null}
              </div>
            )}

            <div className="mt-3 text-[11px] text-muted-foreground">
              Merge tags: <code className="bg-muted px-1 rounded">{`{{name}}`}</code>{" "}
              <code className="bg-muted px-1 rounded">{`{{email}}`}</code>{" "}
              <code className="bg-muted px-1 rounded">{`{{campaign_name}}`}</code>{" "}
              <code className="bg-muted px-1 rounded">{`{{link_url}}`}</code>{" "}
              <code className="bg-muted px-1 rounded">{`{{site_url}}`}</code>{" "}
              <code className="bg-muted px-1 rounded">{`{{unsubscribe_url}}`}</code>
            </div>
          </div>

          {/* Campaigns */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">Campaigns</p>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={!enabled || templates.length === 0}
                onClick={() =>
                  setCampaignEditor({
                    open: true,
                    editing: null,
                    name: "",
                    templateId: templates[0]?.id || "",
                    status: "draft",
                    sendAtLocal: "",
                    subjectOverride: "",
                    previewText: "",
                    url: "/events",
                  })
                }
              >
                <Plus className="w-3 h-3" /> New
              </Button>
            </div>

            {campaignsLoading ? (
              <p className="text-xs text-muted-foreground mt-3">Loading…</p>
            ) : campaigns.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-3">No campaigns yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {campaigns.slice(0, 8).map((c) => {
                  const templateName = templateMap.get(c.template_id)?.name || "—";
                  const sendAt = c.send_at ? format(new Date(c.send_at), "d MMM yyyy HH:mm") : null;
                  const queuedAt = c.queued_at ? format(new Date(c.queued_at), "d MMM yyyy HH:mm") : null;
                  return (
                    <div key={c.id} className="rounded-md border border-border p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            Template: {templateName}
                            {sendAt ? ` · Send: ${sendAt}` : ""}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {c.status}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-2">
                        <p className="text-[11px] text-muted-foreground">
                          {c.status === "queued" ? `Queued: ${c.last_queued_count}${queuedAt ? ` · ${queuedAt}` : ""}` : "Opt-in only"}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() =>
                              setCampaignEditor({
                                open: true,
                                editing: c,
                                name: c.name || "",
                                templateId: c.template_id || "",
                                status: c.status === "scheduled" ? "scheduled" : "draft",
                                sendAtLocal: c.send_at ? toLocalDateTimeInput(c.send_at) : "",
                                subjectOverride: c.subject_override || "",
                                previewText: c.preview_text || "",
                                url: c.url || "/events",
                              })
                            }
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>

                          {c.status !== "cancelled" && c.status !== "queued" ? (
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1"
                              disabled={queueCampaign.isPending}
                              onClick={() => queueCampaign.mutate(c.id)}
                              title="Queues emails immediately"
                            >
                              <Send className="w-3 h-3" /> Send now
                            </Button>
                          ) : null}

                          {c.status === "scheduled" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={cancelCampaign.isPending}
                              onClick={() => cancelCampaign.mutate(c.id)}
                            >
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {campaigns.length > 8 ? <p className="text-[11px] text-muted-foreground">Showing 8 of {campaigns.length}.</p> : null}
              </div>
            )}

            {templates.length === 0 ? (
              <p className="text-[11px] text-muted-foreground mt-3">Create a template first.</p>
            ) : null}
          </div>
        </div>
      )}

      {/* Template editor */}
      <Dialog open={templateEditor.open} onOpenChange={(open) => setTemplateEditor((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{templateEditor.editing ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={templateEditor.name} onChange={(e) => setTemplateEditor((s) => ({ ...s, name: e.target.value }))} placeholder="Club night template" />
              </div>
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input value={templateEditor.subject} onChange={(e) => setTemplateEditor((s) => ({ ...s, subject: e.target.value }))} placeholder="GB Squash: ..." />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>HTML</Label>
              <Textarea
                className="min-h-[180px] font-mono text-[11px]"
                value={templateEditor.html}
                onChange={(e) => setTemplateEditor((s) => ({ ...s, html: e.target.value }))}
                placeholder="<div>…</div>"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Plain text (optional)</Label>
              <Textarea
                className="min-h-[100px] font-mono text-[11px]"
                value={templateEditor.text}
                onChange={(e) => setTemplateEditor((s) => ({ ...s, text: e.target.value }))}
                placeholder="Fallback text version…"
              />
            </div>

            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium mb-2">Preview</p>
              <div className="rounded-md border border-border bg-background p-3 text-xs overflow-hidden">
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: templateEditor.html || "<em>Nothing to preview</em>" }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateEditor((s) => ({ ...s, open: false }))} disabled={saveTemplate.isPending}>
              Cancel
            </Button>
            <Button onClick={() => saveTemplate.mutate()} disabled={saveTemplate.isPending}>
              {saveTemplate.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign editor */}
      <Dialog open={campaignEditor.open} onOpenChange={(open) => setCampaignEditor((s) => ({ ...s, open }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{campaignEditor.editing ? "Edit campaign" : "New campaign"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={campaignEditor.name} onChange={(e) => setCampaignEditor((s) => ({ ...s, name: e.target.value }))} placeholder="March social night" />
              </div>
              <div className="space-y-1.5">
                <Label>Template</Label>
                <Select value={campaignEditor.templateId} onValueChange={(v) => setCampaignEditor((s) => ({ ...s, templateId: v }))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={campaignEditor.status}
                  onValueChange={(v) => setCampaignEditor((s) => ({ ...s, status: v as any }))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Send at (local)</Label>
                <Input
                  type="datetime-local"
                  value={campaignEditor.sendAtLocal}
                  onChange={(e) => setCampaignEditor((s) => ({ ...s, sendAtLocal: e.target.value }))}
                  disabled={campaignEditor.status !== "scheduled"}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Subject override (optional)</Label>
                <Input value={campaignEditor.subjectOverride} onChange={(e) => setCampaignEditor((s) => ({ ...s, subjectOverride: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Link URL (in-app)</Label>
                <Input value={campaignEditor.url} onChange={(e) => setCampaignEditor((s) => ({ ...s, url: e.target.value }))} placeholder="/events" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Preview text (in-app)</Label>
              <Input value={campaignEditor.previewText} onChange={(e) => setCampaignEditor((s) => ({ ...s, previewText: e.target.value }))} placeholder="Short summary that appears in notifications" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignEditor((s) => ({ ...s, open: false }))} disabled={saveCampaign.isPending}>
              Cancel
            </Button>
            <Button onClick={() => saveCampaign.mutate()} disabled={saveCampaign.isPending}>
              {saveCampaign.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


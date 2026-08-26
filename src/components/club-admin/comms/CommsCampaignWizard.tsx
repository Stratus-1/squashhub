import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { COMMS_CHANNELS, resolveAction, type CommsAction, type CommsChannel } from "@/lib/comms/actions";
import { buildMergeVars } from "@/lib/comms/merge-fields";
import { renderChannel } from "@/lib/comms/render";
import { validateCampaign, CHANNEL_LABEL } from "@/lib/comms/validation";
import { dispatchCampaign, upsertCampaign } from "@/lib/comms/send";
import { CommsActionPicker } from "./CommsActionPicker";
import type { TemplateRecord } from "./CommsTemplateEditor";

type AudienceType = "all" | "selected" | "league" | "skills";

const STEPS = ["Template", "Recipients", "Channels", "Preview", "Send"];

export function CommsCampaignWizard({
  clubId,
  club,
  templates,
  initialTemplate,
  onClose,
}: {
  clubId: string;
  club: { name?: string | null; email?: string | null; phone?: string | null; subdomain?: string | null } | null;
  templates: TemplateRecord[];
  initialTemplate?: TemplateRecord | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? templates[0]?.id ?? "");
  const template = templates.find((t) => t.id === templateId) ?? null;

  const [name, setName] = useState(initialTemplate?.name ?? "");
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [leagueId, setLeagueId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [memberFilter, setMemberFilter] = useState("");
  const [volunteersOnly, setVolunteersOnly] = useState(false);
  const [skillText, setSkillText] = useState("");
  const [channels, setChannels] = useState<CommsChannel[]>([]);
  const [actionOverride, setActionOverride] = useState<CommsAction | null>(null);
  const [scheduleFor, setScheduleFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewChannel, setPreviewChannel] = useState<CommsChannel>("email");

  const action = actionOverride ?? template?.action ?? { key: "none" };

  const { data: members = [] } = useQuery({
    queryKey: ["comms-members", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("id,name,email,phone,user_id,club_member_number,id_number,skills,volunteer_willing")
        .eq("club_id", clubId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clubId,
  });

  const { data: leagues = [] } = useQuery({
    queryKey: ["comms-leagues", clubId],
    queryFn: async () => {
      const { data } = await supabase.from("leagues").select("id,name").eq("club_id", clubId).order("name");
      return data ?? [];
    },
    enabled: !!clubId,
  });

  const { data: leagueMemberIds = [] } = useQuery({
    queryKey: ["comms-league-members", leagueId],
    queryFn: async () => {
      const { data } = await supabase.from("member_league_registrations").select("club_member_id").eq("league_id", leagueId);
      return (data ?? []).map((r: any) => r.club_member_id).filter(Boolean) as string[];
    },
    enabled: audienceType === "league" && !!leagueId,
  });

  const wantedSkills = useMemo(
    () => skillText.split(",").map((s) => s.trim()).filter(Boolean),
    [skillText],
  );

  const recipients = useMemo(() => {
    if (audienceType === "selected") return members.filter((m: any) => selectedIds.includes(m.id));
    if (audienceType === "league") return members.filter((m: any) => leagueMemberIds.includes(m.id));
    if (audienceType === "skills") {
      return members.filter((m: any) => {
        if (volunteersOnly && !m.volunteer_willing) return false;
        if (wantedSkills.length) {
          const own: string[] = Array.isArray(m.skills) ? m.skills : [];
          if (!wantedSkills.some((s) => own.some((o) => o.toLowerCase().includes(s.toLowerCase())))) return false;
        }
        return true;
      });
    }
    return members;
  }, [audienceType, members, selectedIds, leagueMemberIds, volunteersOnly, wantedSkills]);

  const warnings = useMemo(
    () =>
      validateCampaign({
        channels,
        versions: template?.versions ?? {},
        recipients: recipients as any,
        action,
      }),
    [channels, template, recipients, action],
  );
  const errors = warnings.filter((w) => w.level === "error");

  const resolved = resolveAction(action, { clubSubdomain: club?.subdomain, origin: window.location.origin });
  const sample = (recipients[0] ?? members[0]) as any;
  const previewVars = buildMergeVars({
    member: sample,
    club,
    actionLabel: resolved.label,
    actionUrl: resolved.webUrl,
  });

  const submit = async (mode: "now" | "schedule" | "draft") => {
    if (!template) return;
    setBusy(true);
    try {
      const campaignId = await upsertCampaign({
        clubId,
        name: name.trim() || template.name,
        templateId: template.id,
        channels,
        content: Object.fromEntries(
          channels.map((ch) => [ch, template.versions[ch] ?? { subject: "", body: "" }]),
        ),
        action,
        audience:
          audienceType === "selected"
            ? { type: "selected", memberIds: recipients.map((m: any) => m.id) }
            : audienceType === "league"
              ? { type: "league", leagueId }
              : audienceType === "skills"
                ? { type: "skills", filter: { skills: wantedSkills, volunteer_willing: volunteersOnly } }
                : { type: "all" },
        scheduledFor: mode === "schedule" ? new Date(scheduleFor).toISOString() : null,
        draft: mode === "draft",
      });

      if (mode === "now") {
        const res = await dispatchCampaign(campaignId);
        toast({
          title: "Campaign sent",
          description: `${res.sent} delivered · ${res.failed} failed · ${res.skipped} skipped`,
        });
      } else {
        toast({ title: mode === "schedule" ? "Campaign scheduled" : "Draft saved" });
      }
      qc.invalidateQueries({ queryKey: ["comms-campaigns", clubId] });
      qc.invalidateQueries({ queryKey: ["comms-deliveries", clubId] });
      onClose();
    } catch (e: any) {
      toast({ title: "Could not send", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const canNext =
    (step === 0 && !!template) ||
    (step === 1 && recipients.length > 0) ||
    (step === 2 && channels.length > 0) ||
    step === 3;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send a campaign</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 text-[11px] mb-1">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`px-2 py-0.5 rounded-full border ${
                i === step ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border"
              }`}
            >
              {i + 1}. {s}
            </span>
          ))}
        </div>

        {/* 1 — template */}
        {step === 0 && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pick a template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({Object.keys(t.versions).length} channel version{Object.keys(t.versions).length === 1 ? "" : "s"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Campaign name</Label>
              <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder={template?.name ?? "Campaign"} />
            </div>
            <div className="rounded border border-border p-3">
              <CommsActionPicker value={action} onChange={setActionOverride} clubSubdomain={club?.subdomain} />
            </div>
          </div>
        )}

        {/* 2 — recipients */}
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Audience</Label>
              <Select value={audienceType} onValueChange={(v) => setAudienceType(v as AudienceType)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All members</SelectItem>
                  <SelectItem value="selected">Selected members</SelectItem>
                  <SelectItem value="league">A league</SelectItem>
                  <SelectItem value="skills">Skills / volunteers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {audienceType === "league" && (
              <Select value={leagueId} onValueChange={setLeagueId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pick a league" /></SelectTrigger>
                <SelectContent>
                  {leagues.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {audienceType === "skills" && (
              <div className="space-y-2">
                <Input
                  className="h-9"
                  value={skillText}
                  onChange={(e) => setSkillText(e.target.value)}
                  placeholder="Skills, comma separated (e.g. accounting, coaching)"
                />
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={volunteersOnly} onCheckedChange={(v) => setVolunteersOnly(!!v)} />
                  Willing to volunteer only
                </label>
              </div>
            )}

            {audienceType === "selected" && (
              <div className="space-y-2">
                <Input className="h-9" value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} placeholder="Search members…" />
                <ScrollArea className="h-56 rounded border border-border p-2">
                  {members
                    .filter((m: any) => m.name?.toLowerCase().includes(memberFilter.toLowerCase()))
                    .map((m: any) => (
                      <label key={m.id} className="flex items-center gap-2 py-1 text-xs">
                        <Checkbox
                          checked={selectedIds.includes(m.id)}
                          onCheckedChange={(v) =>
                            setSelectedIds((ids) => (v ? [...ids, m.id] : ids.filter((i) => i !== m.id)))
                          }
                        />
                        <span className="flex-1 truncate">{m.name}</span>
                        <span className="text-muted-foreground truncate">{m.email}</span>
                      </label>
                    ))}
                </ScrollArea>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{recipients.length} recipient(s) match.</p>
          </div>
        )}

        {/* 3 — channels */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Only the channels ticked here are used for this send.
            </p>
            {COMMS_CHANNELS.map((c) => {
              const hasVersion = !!String(template?.versions[c.key]?.body || "").replace(/<[^>]*>/g, "").trim();
              return (
                <label key={c.key} className="flex items-start gap-2 rounded border border-border p-2.5">
                  <Checkbox
                    checked={channels.includes(c.key)}
                    onCheckedChange={(v) =>
                      setChannels((chs) => (v ? [...chs, c.key] : chs.filter((x) => x !== c.key)))
                    }
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.label}</p>
                    {hasVersion ? (
                      <p className="text-[11px] text-muted-foreground">Version ready in this template.</p>
                    ) : (
                      <p className="text-[11px] text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> No {c.label} version in this template.
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {/* 4 — preview */}
        {step === 3 && (
          <Tabs value={previewChannel} onValueChange={(v) => setPreviewChannel(v as CommsChannel)}>
            <TabsList>
              {channels.map((c) => <TabsTrigger key={c} value={c}>{CHANNEL_LABEL[c]}</TabsTrigger>)}
            </TabsList>
            {channels.map((c) => {
              const rendered = renderChannel(c, template?.versions[c] ?? {}, previewVars, resolved);
              return (
                <TabsContent key={c} value={c} className="mt-3">
                  <div className="rounded border border-border p-3 space-y-2">
                    {c !== "whatsapp" && <p className="text-sm font-semibold">{rendered.subject}</p>}
                    {c === "email" ? (
                      <div
                        className="prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rendered.body) }}
                      />
                    ) : (
                      <pre className="text-xs whitespace-pre-wrap font-sans">{rendered.body}</pre>
                    )}
                    {c === "in_app" && resolved.hasAction && (
                      <Badge variant="secondary" className="text-[10px]">Opens {resolved.appPath}</Badge>
                    )}
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        )}

        {/* 5 — send */}
        {step === 4 && (
          <div className="space-y-3">
            <div className="rounded border border-border p-3 text-xs space-y-1">
              <p><strong>{recipients.length}</strong> recipients</p>
              <p>Channels: {channels.map((c) => CHANNEL_LABEL[c]).join(", ") || "—"}</p>
              <p>Action: {resolved.hasAction ? `${resolved.label} → ${resolved.appPath || resolved.webUrl}` : "None"}</p>
            </div>
            <div>
              <Label className="text-xs">Schedule for later (optional)</Label>
              <Input type="datetime-local" className="h-9" value={scheduleFor} onChange={(e) => setScheduleFor(e.target.value)} />
            </div>
          </div>
        )}

        {!!warnings.length && step >= 2 && (
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <p
                key={i}
                className={`text-[11px] flex items-start gap-1 ${w.level === "error" ? "text-destructive" : "text-amber-600"}`}
              >
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w.message}
              </p>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </Button>
          )}
          {step < 4 ? (
            <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Next <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => submit("draft")}>Save draft</Button>
              <Button
                variant="outline"
                disabled={busy || !scheduleFor || !!errors.length}
                onClick={() => submit("schedule")}
              >
                <CalendarClock className="w-3.5 h-3.5 mr-1" /> Schedule
              </Button>
              <Button disabled={busy || !!errors.length} onClick={() => submit("now")}>
                <Send className="w-3.5 h-3.5 mr-1" /> {busy ? "Sending…" : "Send now"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

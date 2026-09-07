import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { toast } from "@/hooks/use-toast";
import {
  PLATFORM_CHANNELS, dispatchPlatformCampaign, htmlToText, renderMerge,
  type PlatformAudienceType, type PlatformChannel,
} from "@/lib/platform-updates";
import { PlatformMergeChips, type PlatformTemplate } from "./PlatformTemplateEditor";

type Audience = {
  type: PlatformAudienceType;
  clubIds: string[];
  associationId: string | null;
  planId: string | null;
  memberIds: string[];
};

const ADMIN_ROLES = ["admin", "captain"] as const;

function normalisePhone(raw?: string | null) {
  if (!raw) return null;
  let s = String(raw).replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) s = "27" + s.slice(1);
  return s.length >= 8 && s.length <= 15 ? s : null;
}

export function PlatformCampaignWizard({
  initialTemplate,
  duplicateOf,
  onClose,
}: {
  initialTemplate?: PlatformTemplate | null;
  duplicateOf?: any | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(duplicateOf?.name ? `${duplicateOf.name} (copy)` : initialTemplate?.name ?? "");
  const [subject, setSubject] = useState(duplicateOf?.subject ?? initialTemplate?.subject ?? "");
  const [body, setBody] = useState(duplicateOf?.body_html ?? initialTemplate?.body_html ?? "");
  const [actionLabel, setActionLabel] = useState(duplicateOf?.action_label ?? initialTemplate?.action_label ?? "");
  const [actionUrl, setActionUrl] = useState(duplicateOf?.action_url ?? initialTemplate?.action_url ?? "");
  const [editor, setEditor] = useState<any>(null);
  const [channels, setChannels] = useState<PlatformChannel[]>(
    (duplicateOf?.channels as PlatformChannel[]) ?? ["in_app", "email"],
  );
  const [audience, setAudience] = useState<Audience>({
    type: (duplicateOf?.audience_type as PlatformAudienceType) ?? "all",
    clubIds: duplicateOf?.audience_club_ids ?? [],
    associationId: duplicateOf?.audience_association_id ?? null,
    planId: duplicateOf?.audience_plan_id ?? null,
    memberIds: duplicateOf?.audience_member_ids ?? [],
  });
  const [clubSearch, setClubSearch] = useState("");
  const [adminSearch, setAdminSearch] = useState("");

  const { data: clubs = [] } = useQuery({
    queryKey: ["platform-updates-clubs"],
    queryFn: async () => {
      const { data } = await supabase.from("clubs").select("id,name,subdomain").order("name");
      return data ?? [];
    },
  });

  const { data: associations = [] } = useQuery({
    queryKey: ["platform-updates-associations"],
    queryFn: async () => {
      const { data } = await supabase.from("league_associations").select("id,name").order("name");
      return data ?? [];
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["platform-updates-plans"],
    queryFn: async () => {
      const { data } = await supabase.from("subscription_plans").select("id,name").order("name");
      return data ?? [];
    },
  });

  const { data: admins = [], isLoading: adminsLoading } = useQuery({
    queryKey: ["platform-updates-admins"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("club_members")
        .select("id,club_id,user_id,name,email,phone,role,status")
        .in("role", ADMIN_ROLES as unknown as string[])
        .neq("status", "resigned")
        .order("name");
      return data ?? [];
    },
  });

  const clubById = useMemo(() => new Map(clubs.map((c: any) => [c.id, c])), [clubs]);

  /** Clubs matched by the current audience choice. */
  const { data: audienceClubIds = null } = useQuery<string[] | null>({
    queryKey: ["platform-updates-audience", audience.type, audience.associationId, audience.planId],
    queryFn: async () => {
      if (audience.type === "association" && audience.associationId) {
        const { data } = await (supabase as any)
          .from("association_affiliated_clubs").select("club_id").eq("association_id", audience.associationId);
        return (data ?? []).map((r: any) => r.club_id as string);
      }
      if (audience.type === "plan" && audience.planId) {
        const { data } = await (supabase as any)
          .from("club_subscriptions").select("club_id").eq("plan_id", audience.planId);
        return [...new Set((data ?? []).map((r: any) => r.club_id as string))];
      }
      return null;
    },
    enabled: (audience.type === "association" && !!audience.associationId) || (audience.type === "plan" && !!audience.planId),
  });

  /** Recipient summary — mirrors the server's expansion + de-duplication. */
  const summary = useMemo(() => {
    let rows = admins as any[];
    if (audience.type === "clubs") rows = rows.filter((r) => audience.clubIds.includes(r.club_id));
    else if (audience.type === "admins") rows = rows.filter((r) => audience.memberIds.includes(r.id));
    else if (audience.type === "association" || audience.type === "plan") {
      const ids = audienceClubIds ?? [];
      rows = rows.filter((r) => ids.includes(r.club_id));
    }

    const byPerson = new Map<string, any>();
    for (const r of rows) {
      const key = r.user_id || (r.email ? String(r.email).toLowerCase() : r.id);
      const cur = byPerson.get(key);
      if (cur) { if (!cur.clubIds.includes(r.club_id)) cur.clubIds.push(r.club_id); continue; }
      byPerson.set(key, { ...r, clubIds: [r.club_id] });
    }
    const people = [...byPerson.values()];
    const withEmail = people.filter((p) => p.email && String(p.email).includes("@")).length;
    const withPhone = people.filter((p) => normalisePhone(p.phone)).length;
    const noContact = people.filter((p) => !p.email && !normalisePhone(p.phone)).length;
    const clubCount = new Set(rows.map((r) => r.club_id)).size;
    return { people, clubCount, withEmail, withPhone, noContact };
  }, [admins, audience, audienceClubIds]);

  const previewVars = {
    first_name: "Sam", surname: "Nkosi", name: "Sam Nkosi",
    club_name: clubs[0]?.name ?? "Your club", association_name: "Mpumalanga Lowveld",
    club_email: "info@club.co.za", club_phone: "013 000 0000",
    subscription_plan: "Standard", action_url: actionUrl || "https://squashhub.co.za",
  };

  const toggleChannel = (ch: PlatformChannel) =>
    setChannels((cs) => (cs.includes(ch) ? cs.filter((c) => c !== ch) : [...cs, ch]));

  const save = async (send: boolean) => {
    if (!name.trim()) throw new Error("Give the campaign a name");
    if (!htmlToText(body)) throw new Error("Write a message first");
    if (!channels.length) throw new Error("Pick at least one channel");
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("platform_update_campaigns")
      .insert({
        name: name.trim(),
        template_id: initialTemplate?.id || null,
        subject,
        body_html: body,
        action_label: actionLabel.trim() || null,
        action_url: actionUrl.trim() || null,
        channels,
        audience_type: audience.type,
        audience_club_ids: audience.type === "clubs" ? audience.clubIds : [],
        audience_association_id: audience.type === "association" ? audience.associationId : null,
        audience_plan_id: audience.type === "plan" ? audience.planId : null,
        audience_member_ids: audience.type === "admins" ? audience.memberIds : [],
        status: "draft",
        created_by: user?.id ?? null,
      })
      .select("id").single();
    if (error) throw error;
    if (send) await dispatchPlatformCampaign(data.id);
    return data.id as string;
  };

  const run = useMutation({
    mutationFn: (send: boolean) => save(send),
    onSuccess: (_id, send) => {
      qc.invalidateQueries({ queryKey: ["platform-update-campaigns"] });
      toast({ title: send ? "Campaign sent" : "Saved as draft" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Could not send", description: e?.message, variant: "destructive" }),
  });

  const filteredClubs = clubs.filter((c: any) => c.name?.toLowerCase().includes(clubSearch.toLowerCase()));
  const filteredAdmins = (admins as any[]).filter((a) =>
    `${a.name ?? ""} ${a.email ?? ""} ${clubById.get(a.club_id)?.name ?? ""}`.toLowerCase().includes(adminSearch.toLowerCase()),
  );

  const steps = ["Message", "Audience", "Channels", "Review & send"];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Platform update — from SquashHub to club administrators</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 text-[11px] mb-2">
          {steps.map((s, i) => (
            <button key={s} type="button" onClick={() => setStep(i)}
              className={`px-2 py-1 rounded-full border ${i === step ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Campaign name</Label>
                <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="September release notes" />
              </div>
              <div>
                <Label className="text-xs">Subject / title</Label>
                <Input className="h-9" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            </div>
            <PlatformMergeChips onInsert={(t) => editor?.chain().focus().insertContent(t).run()} />
            <RichTextEditor value={body} onChange={setBody} onEditorReady={setEditor} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Call-to-action label</Label>
                <Input className="h-9" value={actionLabel} onChange={(e) => setActionLabel(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Call-to-action link</Label>
                <Input className="h-9" value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {([
                ["all", "All active clubs"], ["clubs", "Selected clubs"], ["association", "Selected association"],
                ["plan", "Subscription plan"], ["admins", "Named administrators"],
              ] as [PlatformAudienceType, string][]).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setAudience((a) => ({ ...a, type: k }))}
                  className={`text-[11px] px-2 py-1 rounded-full border ${audience.type === k ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
                  {label}
                </button>
              ))}
            </div>

            {audience.type === "clubs" && (
              <Card className="p-2">
                <Input className="h-8 mb-2" placeholder="Search clubs…" value={clubSearch} onChange={(e) => setClubSearch(e.target.value)} />
                <ScrollArea className="h-64">
                  <div className="space-y-1 pr-2">
                    {filteredClubs.map((c: any) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs p-1 rounded hover:bg-muted">
                        <Checkbox
                          checked={audience.clubIds.includes(c.id)}
                          onCheckedChange={(v) => setAudience((a) => ({
                            ...a,
                            clubIds: v ? [...a.clubIds, c.id] : a.clubIds.filter((x) => x !== c.id),
                          }))}
                        />
                        <span>{c.name}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            )}

            {audience.type === "association" && (
              <Select value={audience.associationId ?? ""} onValueChange={(v) => setAudience((a) => ({ ...a, associationId: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choose an association" /></SelectTrigger>
                <SelectContent>
                  {associations.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {audience.type === "plan" && (
              <Select value={audience.planId ?? ""} onValueChange={(v) => setAudience((a) => ({ ...a, planId: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choose a subscription plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {audience.type === "admins" && (
              <Card className="p-2">
                <Input className="h-8 mb-2" placeholder="Search administrators…" value={adminSearch} onChange={(e) => setAdminSearch(e.target.value)} />
                <ScrollArea className="h-64">
                  <div className="space-y-1 pr-2">
                    {adminsLoading && <p className="text-xs text-muted-foreground p-2">Loading…</p>}
                    {filteredAdmins.map((m: any) => (
                      <label key={m.id} className="flex items-center gap-2 text-xs p-1 rounded hover:bg-muted">
                        <Checkbox
                          checked={audience.memberIds.includes(m.id)}
                          onCheckedChange={(v) => setAudience((a) => ({
                            ...a,
                            memberIds: v ? [...a.memberIds, m.id] : a.memberIds.filter((x) => x !== m.id),
                          }))}
                        />
                        <span className="flex-1">{m.name}</span>
                        <span className="text-muted-foreground">{clubById.get(m.club_id)?.name}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            )}

            <p className="text-xs text-muted-foreground">
              Only club administrators and captains receive platform updates — ordinary members never do.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            {PLATFORM_CHANNELS.map((ch) => (
              <label key={ch.key} className="flex items-center gap-2 text-sm p-2 rounded border border-border">
                <Checkbox checked={channels.includes(ch.key)} onCheckedChange={() => toggleChannel(ch.key)} />
                <span className="flex-1">{ch.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {ch.key === "in_app" && `${summary.people.length} administrators`}
                  {ch.key === "email" && `${summary.withEmail} with email`}
                  {(ch.key === "whatsapp" || ch.key === "sms") && `${summary.withPhone} with a mobile number`}
                </span>
              </label>
            ))}
            <p className="text-[11px] text-muted-foreground">
              In-app leaves a permanent “Updates from SquashHub” item. Email is sent from the SquashHub platform sender,
              never a club’s own mail settings. WhatsApp uses the approved notice template; SMS uses the platform gateway.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Card className="p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              {[
                ["Clubs", summary.clubCount], ["Administrators", summary.people.length],
                ["Email", summary.withEmail], ["Mobile", summary.withPhone], ["No contact", summary.noContact],
              ].map(([l, v]) => (
                <div key={l as string}>
                  <p className="text-lg font-semibold">{v as number}</p>
                  <p className="text-[11px] text-muted-foreground">{l as string}</p>
                </div>
              ))}
            </Card>

            <div className="flex flex-wrap gap-1">
              {channels.map((c) => (
                <Badge key={c} variant="secondary" className="text-[10px]">
                  {PLATFORM_CHANNELS.find((x) => x.key === c)?.label}
                </Badge>
              ))}
            </div>

            <Card className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">Preview</p>
              <p className="text-sm font-semibold">{renderMerge(subject, previewVars)}</p>
              <div className="prose prose-sm max-w-none text-sm mt-1"
                dangerouslySetInnerHTML={{ __html: renderMerge(body, previewVars) }} />
              {actionLabel && actionUrl && (
                <Button size="sm" className="mt-2" disabled>{actionLabel}</Button>
              )}
            </Card>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
          {step < 3 && <Button onClick={() => setStep(step + 1)}>Next</Button>}
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => run.mutate(false)} disabled={run.isPending}>Save draft</Button>
              <Button
                onClick={() => {
                  if (!summary.people.length) {
                    toast({ title: "No administrators matched", variant: "destructive" });
                    return;
                  }
                  if (confirm(`Send "${name}" to ${summary.people.length} administrators across ${summary.clubCount} clubs?`)) {
                    run.mutate(true);
                  }
                }}
                disabled={run.isPending}
              >
                Send campaign
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

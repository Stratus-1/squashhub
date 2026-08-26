import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { toast } from "@/hooks/use-toast";
import { COMMS_CHANNELS, type CommsAction, type CommsChannel } from "@/lib/comms/actions";
import { CommsActionPicker } from "./CommsActionPicker";
import { CommsMergeFieldChips } from "./CommsMergeFieldChips";

export type TemplateVersion = { subject: string; body: string };
export type TemplateRecord = {
  id: string;
  name: string;
  category: string | null;
  action: CommsAction;
  versions: Partial<Record<CommsChannel, TemplateVersion>>;
};

export const EMPTY_TEMPLATE: TemplateRecord = {
  id: "",
  name: "",
  category: "general",
  action: { key: "none" },
  versions: {},
};

export function CommsTemplateEditor({
  clubId,
  clubSubdomain,
  template,
  onClose,
}: {
  clubId: string;
  clubSubdomain?: string | null;
  template: TemplateRecord;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isNew = !template.id;
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState(template.category ?? "general");
  const [action, setAction] = useState<CommsAction>(template.action ?? { key: "none" });
  const [versions, setVersions] = useState<Partial<Record<CommsChannel, TemplateVersion>>>(template.versions ?? {});
  const [channel, setChannel] = useState<CommsChannel>("email");
  const [bodyEditor, setBodyEditor] = useState<any>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const whatsappRef = useRef<HTMLTextAreaElement>(null);
  const inAppRef = useRef<HTMLTextAreaElement>(null);
  const [focusField, setFocusField] = useState<"subject" | "body">("body");

  const current = versions[channel] ?? { subject: "", body: "" };
  const setCurrent = (patch: Partial<TemplateVersion>) =>
    setVersions((v) => ({ ...v, [channel]: { subject: "", body: "", ...(v[channel] ?? {}), ...patch } }));

  const insertToken = (token: string) => {
    if (focusField === "subject") {
      const el = subjectRef.current;
      const s = current.subject ?? "";
      const start = el?.selectionStart ?? s.length;
      const end = el?.selectionEnd ?? s.length;
      setCurrent({ subject: s.slice(0, start) + token + s.slice(end) });
      return;
    }
    if (channel === "email") {
      bodyEditor?.chain().focus().insertContent(token).run();
      return;
    }
    const el = channel === "whatsapp" ? whatsappRef.current : inAppRef.current;
    const s = current.body ?? "";
    const start = el?.selectionStart ?? s.length;
    const end = el?.selectionEnd ?? s.length;
    setCurrent({ body: s.slice(0, start) + token + s.slice(end) });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Give the template a name");
      const { data: { user } } = await supabase.auth.getUser();
      let templateId = template.id;
      if (isNew) {
        const { data, error } = await supabase
          .from("comms_templates")
          .insert({ club_id: clubId, name: name.trim(), category, action: action as any, created_by: user?.id ?? null })
          .select("id").single();
        if (error) throw error;
        templateId = data.id;
      } else {
        const { error } = await supabase
          .from("comms_templates")
          .update({ name: name.trim(), category, action: action as any })
          .eq("id", templateId);
        if (error) throw error;
      }

      for (const ch of COMMS_CHANNELS.map((c) => c.key)) {
        const v = versions[ch];
        const hasBody = !!String(v?.body || "").replace(/<[^>]*>/g, "").trim();
        if (!hasBody) {
          await supabase.from("comms_template_versions").delete().eq("template_id", templateId).eq("channel", ch);
          continue;
        }
        const { error } = await supabase.from("comms_template_versions").upsert(
          { template_id: templateId, channel: ch, subject: v?.subject ?? "", body: v?.body ?? "" },
          { onConflict: "template_id,channel" },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comms-templates", clubId] });
      toast({ title: isNew ? "Template created" : "Template saved" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New template" : "Edit template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Template name</Label>
              <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Skills & expertise drive" />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Input className="h-9" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="general, fees, league…" />
            </div>
          </div>

          <div className="rounded border border-border p-3">
            <CommsActionPicker value={action} onChange={setAction} clubSubdomain={clubSubdomain} />
          </div>

          <Tabs value={channel} onValueChange={(v) => setChannel(v as CommsChannel)}>
            <TabsList>
              {COMMS_CHANNELS.map((c) => (
                <TabsTrigger key={c.key} value={c.key} className="gap-1.5">
                  {c.label}
                  {!!String(versions[c.key]?.body || "").replace(/<[^>]*>/g, "").trim() && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">✓</Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="email" className="mt-3 space-y-2">
              <div>
                <Label className="text-xs">Subject</Label>
                <Input
                  ref={subjectRef}
                  className="h-9"
                  value={current.subject ?? ""}
                  onFocus={() => setFocusField("subject")}
                  onChange={(e) => setCurrent({ subject: e.target.value })}
                  placeholder="Hi {{first_name}}, a quick ask from {{club_name}}"
                />
              </div>
              <div>
                <Label className="text-xs">Email body</Label>
                <RichTextEditor
                  value={current.body ?? ""}
                  onChange={(html) => setCurrent({ body: html })}
                  onEditorReady={setBodyEditor}
                  onFocus={() => setFocusField("body")}
                  placeholder="Write the email…"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  The action button and your club signature are added automatically.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="whatsapp" className="mt-3 space-y-2">
              <Label className="text-xs">WhatsApp message</Label>
              <Textarea
                ref={whatsappRef}
                rows={7}
                value={current.body ?? ""}
                onFocus={() => setFocusField("body")}
                onChange={(e) => setCurrent({ body: e.target.value })}
                placeholder="Hi {{first_name}} — short, plain-text message."
              />
              <p className="text-[11px] text-muted-foreground">
                The action link is appended on its own line. Keep it short.
              </p>
            </TabsContent>

            <TabsContent value="in_app" className="mt-3 space-y-2">
              <div>
                <Label className="text-xs">Notification title</Label>
                <Input
                  ref={subjectRef}
                  className="h-9"
                  value={current.subject ?? ""}
                  onFocus={() => setFocusField("subject")}
                  onChange={(e) => setCurrent({ subject: e.target.value })}
                  placeholder="Tell us about your skills"
                />
              </div>
              <div>
                <Label className="text-xs">Notification message</Label>
                <Textarea
                  ref={inAppRef}
                  rows={5}
                  value={current.body ?? ""}
                  onFocus={() => setFocusField("body")}
                  onChange={(e) => setCurrent({ body: e.target.value })}
                  placeholder="Tap to open your profile and add your skills."
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                No links needed — tapping the notification opens the action screen in the app.
              </p>
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-[11px] text-muted-foreground mb-1">
              Merge fields are shared across all channels — click to insert into the {focusField}.
            </p>
            <CommsMergeFieldChips onInsert={insertToken} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Load a full template (with all channel versions) for editing / sending. */
export function useCommsTemplates(clubId: string) {
  return useQuery({
    queryKey: ["comms-templates", clubId],
    queryFn: async (): Promise<TemplateRecord[]> => {
      const [{ data: templates, error }, { data: versions }] = await Promise.all([
        supabase.from("comms_templates").select("*").eq("club_id", clubId).order("updated_at", { ascending: false }),
        supabase.from("comms_template_versions").select("*"),
      ]);
      if (error) throw error;
      const byTemplate = new Map<string, Partial<Record<CommsChannel, TemplateVersion>>>();
      for (const v of versions ?? []) {
        const bucket = byTemplate.get((v as any).template_id) ?? {};
        bucket[(v as any).channel as CommsChannel] = { subject: (v as any).subject ?? "", body: (v as any).body ?? "" };
        byTemplate.set((v as any).template_id, bucket);
      }
      return (templates ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        action: (t.action ?? { key: "none" }) as CommsAction,
        versions: byTemplate.get(t.id) ?? {},
      }));
    },
    enabled: !!clubId,
  });
}

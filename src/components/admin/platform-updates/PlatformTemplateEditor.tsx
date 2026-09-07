import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { toast } from "@/hooks/use-toast";
import { PLATFORM_MERGE_FIELDS } from "@/lib/platform-updates";

export type PlatformTemplate = {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  action_label: string | null;
  action_url: string | null;
};

export const EMPTY_PLATFORM_TEMPLATE: PlatformTemplate = {
  id: "", name: "", subject: "", body_html: "", action_label: "", action_url: "",
};

export function PlatformMergeChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {PLATFORM_MERGE_FIELDS.map((f) => (
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

export function PlatformTemplateEditor({
  template,
  onClose,
}: {
  template: PlatformTemplate;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isNew = !template.id;
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body_html);
  const [actionLabel, setActionLabel] = useState(template.action_label ?? "");
  const [actionUrl, setActionUrl] = useState(template.action_url ?? "");
  const [editor, setEditor] = useState<any>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Give the template a name");
      const { data: { user } } = await supabase.auth.getUser();
      const row = {
        name: name.trim(),
        subject,
        body_html: body,
        action_label: actionLabel.trim() || null,
        action_url: actionUrl.trim() || null,
      };
      if (isNew) {
        const { error } = await supabase
          .from("platform_update_templates")
          .insert({ ...row, created_by: user?.id ?? null });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("platform_update_templates").update(row).eq("id", template.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-update-templates"] });
      toast({ title: isNew ? "Template created" : "Template saved" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New platform template" : "Edit platform template"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Template name</Label>
              <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New feature announcement" />
            </div>
            <div>
              <Label className="text-xs">Subject / title</Label>
              <Input className="h-9" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="New in SquashHub…" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Merge fields</Label>
            <PlatformMergeChips onInsert={(t) => editor?.chain().focus().insertContent(t).run()} />
          </div>

          <div>
            <Label className="text-xs">Message</Label>
            <RichTextEditor value={body} onChange={setBody} onEditorReady={setEditor} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Call-to-action label</Label>
              <Input className="h-9" value={actionLabel} onChange={(e) => setActionLabel(e.target.value)} placeholder="Open Club Admin" />
            </div>
            <div>
              <Label className="text-xs">Call-to-action link</Label>
              <Input className="h-9" value={actionUrl} onChange={(e) => setActionUrl(e.target.value)} placeholder="https://squashhub.co.za/club-admin" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

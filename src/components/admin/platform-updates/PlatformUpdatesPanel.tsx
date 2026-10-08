import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Loader2, Plus, Send, Trash2, Wand2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { dispatchPlatformCampaign, htmlToText } from "@/lib/platform-updates";

type Aud = "all" | "members";
const AUD_LABEL: Record<string, string> = { all: "Club admins", members: "All members" };

type Draft = { id?: string; title: string; body: string; audience: Aud; status?: string };

export function PlatformUpdatesPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Draft | null>(null);

  const { data: updates = [], isLoading } = useQuery({
    queryKey: ["platform-update-campaigns", "updates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("platform_update_campaigns").select("*").eq("kind", "update")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("platform_update_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["platform-update-campaigns"] }); toast({ title: "Update deleted" }); },
  });

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Updates ({updates.length})</p>
        <Button size="sm" onClick={() => setOpen({ title: "", body: "", audience: "members" })}>
          <Plus className="w-3.5 h-3.5 mr-1" />New update
        </Button>
      </div>
      {isLoading && <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>}
      {!isLoading && !updates.length && <p className="text-xs text-muted-foreground py-6 text-center">No updates yet.</p>}
      <div className="space-y-2">
        {updates.map((u: any) => (
          <div key={u.id} className="flex items-start gap-2 p-2 rounded border border-border">
            <button className="flex-1 min-w-0 text-left"
              onClick={() => setOpen({ id: u.id, title: u.subject || u.name, body: u.body_html, audience: u.audience_type === "members" ? "members" : "all", status: u.status })}>
              <p className="text-sm font-medium truncate">{u.subject || u.name}</p>
              <p className="text-[11px] text-muted-foreground line-clamp-2">{htmlToText(u.body_html)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {AUD_LABEL[u.audience_type] ?? u.audience_type}
                {u.sent_at ? ` · posted ${new Date(u.sent_at).toLocaleString()} · ${u.sent_count}/${u.total_recipients}` : ""}
              </p>
            </button>
            <Badge variant="secondary" className="text-[10px]">{u.status === "sent" ? "posted" : u.status}</Badge>
            <Button size="sm" variant="ghost" aria-label="Delete"
              onClick={() => { if (confirm(`Delete "${u.subject || u.name}"?`)) remove.mutate(u.id); }}>
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
      {open && <UpdateEditor draft={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function UpdateEditor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const locked = !!draft.status && draft.status !== "draft";
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [audience, setAudience] = useState<Aud>(draft.audience);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const writeWithAi = async () => {
    if (!topic.trim()) { toast({ title: "Say what the update is about", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("draft-platform-update", {
        body: { topic: topic.trim(), audience: audience === "members" ? "members" : "admins" },
      });
      if (error) {
        let msg = error.message;
        try { msg = (await (error as any).context.json())?.error ?? msg; } catch { /* keep */ }
        throw new Error(msg);
      }
      const d = data?.draft;
      if (!d) throw new Error(data?.error || "No draft returned");
      setTitle(d.subject || d.campaign_name || "");
      setBody(d.body_html || "");
      setEditorKey((k) => k + 1);
      toast({ title: "Draft ready", description: "Read it and edit before posting." });
    } catch (e: any) {
      toast({ title: "Could not write a draft", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const save = useMutation({
    mutationFn: async (post: boolean) => {
      if (!title.trim()) throw new Error("Add a title");
      if (!htmlToText(body)) throw new Error("Write the message");
      const row = {
        name: title.trim(), subject: title.trim(), body_html: body,
        channels: ["in_app"], audience_type: audience, kind: "update",
      };
      let id = draft.id;
      if (id) {
        const { error } = await (supabase as any).from("platform_update_campaigns").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await (supabase as any).from("platform_update_campaigns")
          .insert({ ...row, status: "draft", created_by: user?.id ?? null }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (post) await dispatchPlatformCampaign(id!);
      return post;
    },
    onSuccess: (post) => {
      qc.invalidateQueries({ queryKey: ["platform-update-campaigns"] });
      toast({ title: post ? "Update posted" : "Draft saved" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Could not save", description: e?.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{locked ? "Posted update" : draft.id ? "Edit update" : "New update"}</DialogTitle></DialogHeader>

        {!locked && (
          <div className="rounded border border-border p-2 space-y-2">
            <Label className="text-xs flex items-center gap-1"><Wand2 className="w-3.5 h-3.5" />Write it with AI</Label>
            <Textarea rows={2} value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="What is this update about? e.g. the tournament improvements" />
            <Button size="sm" variant="outline" onClick={writeWithAi} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1" />}Write draft
            </Button>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Who sees it</Label>
          <Select value={audience} onValueChange={(v) => setAudience(v as Aud)} disabled={locked}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="members">All members</SelectItem>
              <SelectItem value="all">Club admins only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Message</Label>
          {locked
            ? <div className="prose prose-sm dark:prose-invert max-w-none rounded border border-border p-2" dangerouslySetInnerHTML={{ __html: body }} />
            : <RichTextEditor key={editorKey} value={body} onChange={setBody} />}
        </div>
        <p className="text-[11px] text-muted-foreground">Posted in the app only — no emails or text messages.</p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{locked ? "Close" : "Cancel"}</Button>
          {!locked && <>
            <Button variant="secondary" onClick={() => save.mutate(false)} disabled={save.isPending}>Save draft</Button>
            <Button onClick={() => { if (confirm(`Post this to ${AUD_LABEL[audience].toLowerCase()} now?`)) save.mutate(true); }} disabled={save.isPending}>
              <Send className="w-3.5 h-3.5 mr-1" />Post now
            </Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

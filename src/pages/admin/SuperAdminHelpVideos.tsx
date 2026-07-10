import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, ROLE_TAGS } from "@/pages/Help";

type HelpVideo = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  role_tag: string;
  provider: string;
  video_id: string;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  sort_order: number;
  is_active: boolean;
};

const empty: Partial<HelpVideo> = {
  title: "",
  description: "",
  category: "Getting Started",
  role_tag: "member",
  provider: "youtube",
  video_id: "",
  duration_seconds: null,
  thumbnail_url: "",
  sort_order: 0,
  is_active: true,
};

// Accept full URLs or bare IDs
function extractVideoId(input: string, provider: string): string {
  const raw = input.trim();
  if (!raw) return "";
  try {
    if (provider === "youtube") {
      const m1 = raw.match(/[?&]v=([^&]+)/);
      if (m1) return m1[1];
      const m2 = raw.match(/youtu\.be\/([^?&/]+)/);
      if (m2) return m2[1];
      const m3 = raw.match(/youtube\.com\/embed\/([^?&/]+)/);
      if (m3) return m3[1];
      const m4 = raw.match(/youtube\.com\/shorts\/([^?&/]+)/);
      if (m4) return m4[1];
    }
    if (provider === "loom") {
      const m = raw.match(/loom\.com\/share\/([^?&/]+)/) || raw.match(/loom\.com\/embed\/([^?&/]+)/);
      if (m) return m[1];
    }
    if (provider === "vimeo") {
      const m = raw.match(/vimeo\.com\/(\d+)/);
      if (m) return m[1];
    }
  } catch {}
  return raw;
}

export default function SuperAdminHelpVideos() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<HelpVideo> | null>(null);

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["admin-help-videos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("help_videos")
        .select("*")
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return (data || []) as HelpVideo[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (v: Partial<HelpVideo>) => {
      const payload = {
        title: v.title?.trim(),
        description: v.description?.trim() || null,
        category: v.category,
        role_tag: v.role_tag,
        provider: v.provider,
        video_id: extractVideoId(v.video_id || "", v.provider || "youtube"),
        duration_seconds: v.duration_seconds ? Number(v.duration_seconds) : null,
        thumbnail_url: v.thumbnail_url?.trim() || null,
        sort_order: Number(v.sort_order) || 0,
        is_active: !!v.is_active,
      };
      if (!payload.title || !payload.video_id) throw new Error("Title and video ID are required.");
      if (v.id) {
        const { error } = await (supabase as any).from("help_videos").update(payload).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("help_videos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-help-videos"] });
      qc.invalidateQueries({ queryKey: ["help-videos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("help_videos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-help-videos"] });
      qc.invalidateQueries({ queryKey: ["help-videos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Help Videos</h1>
          <p className="text-sm text-white/60 mt-1">Tutorials shown to every SquashHub user under /help.</p>
        </div>
        <Button onClick={() => setEditing({ ...empty })}>
          <Plus className="w-4 h-4 mr-1.5" /> Add video
        </Button>
      </div>

      <Card className="bg-white/[0.04] border-white/10">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-white/60 text-sm"><Loader2 className="w-4 h-4 mx-auto animate-spin" /></div>
          ) : videos.length === 0 ? (
            <div className="p-8 text-center text-white/60 text-sm">No videos yet — click "Add video" to publish your first tutorial.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {videos.map((v) => (
                <div key={v.id} className="flex items-center gap-3 p-3">
                  <div className="w-24 h-14 rounded bg-black overflow-hidden shrink-0">
                    {v.provider === "youtube" && (
                      <img src={`https://i.ytimg.com/vi/${v.video_id}/default.jpg`} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-white truncate">{v.title}</div>
                      {!v.is_active && <Badge variant="outline" className="text-[10px]">Hidden</Badge>}
                    </div>
                    <div className="text-xs text-white/50 truncate">
                      {v.category} · {v.role_tag} · {v.provider} · {v.video_id}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (confirm(`Delete "${v.title}"?`)) delMut.mutate(v.id);
                  }}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit video" : "Add video"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Title</Label>
                <Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea rows={2} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={editing.category} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Audience</Label>
                  <Select value={editing.role_tag} onValueChange={(v) => setEditing({ ...editing, role_tag: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_TAGS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Provider</Label>
                  <Select value={editing.provider} onValueChange={(v) => setEditing({ ...editing, provider: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="loom">Loom</SelectItem>
                      <SelectItem value="vimeo">Vimeo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Video URL or ID</Label>
                  <Input
                    placeholder="Paste full URL or ID"
                    value={editing.video_id || ""}
                    onChange={(e) => setEditing({ ...editing, video_id: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Duration (seconds)</Label>
                  <Input
                    type="number"
                    value={editing.duration_seconds ?? ""}
                    onChange={(e) => setEditing({ ...editing, duration_seconds: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Sort order</Label>
                  <Input
                    type="number"
                    value={editing.sort_order ?? 0}
                    onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Thumbnail URL (optional — YouTube auto-fills)</Label>
                <Input value={editing.thumbnail_url || ""} onChange={(e) => setEditing({ ...editing, thumbnail_url: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={!!editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <Label className="text-xs">Visible to users</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && saveMut.mutate(editing)} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

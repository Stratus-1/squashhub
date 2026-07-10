import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayCircle, Search, Clock, GraduationCap } from "lucide-react";
import { SEO } from "@/components/SEO";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useIsSuperAdmin } from "@/hooks/use-club";
import { useNavigate } from "react-router-dom";
import { HelpFaq } from "@/components/help/HelpFaq";

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

export const CATEGORIES = [
  "Getting Started",
  "Club Setup",
  "Courts & Lights",
  "Members & Billing",
  "Leagues",
  "Tournaments",
  "Honesty Bar",
  "Communications",
  "Admin & Reporting",
] as const;

export const ROLE_TAGS = ["member", "captain", "admin"] as const;

const roleLabel: Record<string, string> = {
  member: "Member",
  captain: "Captain",
  admin: "Admin",
};

const roleColor: Record<string, string> = {
  member: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  captain: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  admin: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

function embedUrl(v: HelpVideo) {
  if (v.provider === "youtube") return `https://www.youtube.com/embed/${v.video_id}?rel=0&modestbranding=1&autoplay=1`;
  if (v.provider === "loom") return `https://www.loom.com/embed/${v.video_id}?autoplay=1`;
  if (v.provider === "vimeo") return `https://player.vimeo.com/video/${v.video_id}?autoplay=1`;
  return v.video_id;
}

function defaultThumb(v: HelpVideo) {
  if (v.thumbnail_url) return v.thumbnail_url;
  if (v.provider === "youtube") return `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`;
  return null;
}

function fmtDuration(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Help() {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [playing, setPlaying] = useState<HelpVideo | null>(null);
  const isSuperAdmin = useIsSuperAdmin();
  const navigate = useNavigate();

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["help-videos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("help_videos")
        .select("*")
        .eq("is_active", true)
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return (data || []) as HelpVideo[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter((v) => {
      if (roleFilter !== "all" && v.role_tag !== roleFilter) return false;
      if (!q) return true;
      return (
        v.title.toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q)
      );
    });
  }, [videos, query, roleFilter]);

  const grouped = useMemo(() => {
    const g: Record<string, HelpVideo[]> = {};
    for (const v of filtered) (g[v.category] ||= []).push(v);
    return g;
  }, [filtered]);

  const categoriesInOrder = useMemo(() => {
    const known = CATEGORIES.filter((c) => grouped[c]?.length);
    const extras = Object.keys(grouped).filter((c) => !CATEGORIES.includes(c as any));
    return [...known, ...extras];
  }, [grouped]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <SEO title="Help & Tutorials" description="Short, focused how-to videos for running your squash club on SquashHub." path="/help" noIndex />
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-primary" />
              Help &amp; Tutorials
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Short, focused videos covering setup, day-to-day admin, and everything in between.
            </p>
          </div>
          {isSuperAdmin && (
            <Button size="sm" variant="outline" onClick={() => navigate("/admin/help")}>
              Manage videos
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search topics — courts, leagues, billing..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <Tabs value={roleFilter} onValueChange={setRoleFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="member">Members</TabsTrigger>
              <TabsTrigger value="captain">Captains</TabsTrigger>
              <TabsTrigger value="admin">Admins</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-10 text-center">Loading tutorials…</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <PlayCircle className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {videos.length === 0
                  ? "No tutorials have been published yet. Check back soon."
                  : "No videos match that search."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {categoriesInOrder.map((cat) => (
              <section key={cat}>
                <h2 className="text-lg font-semibold mb-3">{cat}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grouped[cat].map((v) => {
                    const thumb = defaultThumb(v);
                    const duration = fmtDuration(v.duration_seconds);
                    return (
                      <Card
                        key={v.id}
                        className="overflow-hidden cursor-pointer group hover:border-primary/40 transition-colors"
                        onClick={() => setPlaying(v)}
                      >
                        <div className="relative aspect-video bg-muted">
                          {thumb ? (
                            <img src={thumb} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <PlayCircle className="w-12 h-12 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                            <PlayCircle className="w-14 h-14 text-white drop-shadow-lg" />
                          </div>
                          {duration && (
                            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {duration}
                            </div>
                          )}
                        </div>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="text-sm font-semibold leading-snug line-clamp-2">{v.title}</h3>
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${roleColor[v.role_tag] || ""}`}>
                              {roleLabel[v.role_tag] || v.role_tag}
                            </Badge>
                          </div>
                          {v.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{v.description}</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <HelpFaq roleFilter={roleFilter} />
      </div>


      <BackToDashboard />

      <Dialog open={!!playing} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          {playing && (
            <>
              <DialogHeader className="p-4 pb-2">
                <DialogTitle className="text-base pr-6">{playing.title}</DialogTitle>
              </DialogHeader>
              <div className="aspect-video w-full bg-black">
                <iframe
                  src={embedUrl(playing)}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              {playing.description && (
                <div className="p-4 pt-3 text-sm text-muted-foreground">{playing.description}</div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

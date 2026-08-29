import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Search, TrendingUp } from "lucide-react";

interface ClubRow {
  id: string;
  name: string;
  ranking_points_enabled: boolean | null;
  points_from_challenges: boolean | null;
  points_from_leagues: boolean | null;
  points_from_tournaments: boolean | null;
}

/**
 * Platform rollout controls for the club ranking-points engine.
 * Lets us switch the engine on club-by-club and see who has awards waiting.
 */
export function RankingRolloutPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: clubs = [], isLoading } = useQuery({
    queryKey: ["ranking-rollout-clubs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, ranking_points_enabled, points_from_challenges, points_from_leagues, points_from_tournaments")
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as ClubRow[];
    },
  });

  const { data: pending = [] } = useQuery({
    queryKey: ["ranking-rollout-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ranking_points_pending" as any)
        .select("club_id")
        .eq("status", "pending")
        .limit(5000);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const pendingByClub = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pending) m.set(p.club_id, (m.get(p.club_id) ?? 0) + 1);
    return m;
  }, [pending]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? clubs.filter((c) => c.name?.toLowerCase().includes(q)) : clubs;
  }, [clubs, search]);

  const liveCount = clubs.filter((c) => c.ranking_points_enabled).length;

  const toggle = async (club: ClubRow, value: boolean) => {
    setBusy(club.id);
    try {
      const { error } = await supabase
        .from("clubs")
        .update({ ranking_points_enabled: value } as any)
        .eq("id", club.id);
      if (error) throw error;
      toast.success(`${club.name}: ranking points ${value ? "enabled" : "disabled"}`);
      queryClient.invalidateQueries({ queryKey: ["ranking-rollout-clubs"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update this club");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" /> Ranking engine rollout
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {liveCount} of {clubs.length} clubs are live. Awards always queue for club-admin approval first.
          </p>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a club…"
            className="h-8 pl-7 w-56 text-xs"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="rounded-md border divide-y max-h-[60vh] overflow-y-auto">
          {filtered.map((c) => {
            const waiting = pendingByClub.get(c.id) ?? 0;
            const sources = [
              c.points_from_challenges !== false && "Challenges",
              c.points_from_leagues !== false && "Leagues",
              c.points_from_tournaments !== false && "Tournaments",
            ].filter(Boolean) as string[];
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 p-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{c.name}</p>
                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                    {sources.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                    ))}
                    {waiting > 0 && (
                      <Badge variant="destructive" className="text-[10px]">{waiting} awaiting approval</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {busy === c.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <Switch
                    checked={!!c.ranking_points_enabled}
                    disabled={busy === c.id}
                    onCheckedChange={(v) => toggle(c, v)}
                  />
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="p-6 text-center text-xs text-muted-foreground">No clubs match that search.</p>
          )}
        </div>
      )}
    </Card>
  );
}

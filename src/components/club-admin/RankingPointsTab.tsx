import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, RefreshCw, Sparkles, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";

interface Props {
  clubId: string;
}

export function RankingPointsTab({ clubId }: Props) {
  const queryClient = useQueryClient();

  // ===== Club settings =====
  const { data: club, isLoading: clubLoading } = useQuery({
    queryKey: ["ranking-points-club", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, ranking_points_enabled, points_base_win, points_upset_bonus_per_rank, points_favourite_win_min, points_loser_deduction")
        .eq("id", clubId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [baseWin, setBaseWin] = useState("0.25");
  const [upset, setUpset] = useState("0.10");
  const [favMin, setFavMin] = useState("0.10");
  const [loserDed, setLoserDed] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!club) return;
    setEnabled(!!(club as any).ranking_points_enabled);
    setBaseWin(String((club as any).points_base_win ?? "0.25"));
    setUpset(String((club as any).points_upset_bonus_per_rank ?? "0.10"));
    setFavMin(String((club as any).points_favourite_win_min ?? "0.10"));
    setLoserDed(String((club as any).points_loser_deduction ?? "0"));
  }, [club]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clubs")
        .update({
          ranking_points_enabled: enabled,
          points_base_win: Number(baseWin) || 0,
          points_upset_bonus_per_rank: Number(upset) || 0,
          points_favourite_win_min: Number(favMin) || 0,
          points_loser_deduction: Number(loserDed) || 0,
        } as any)
        .eq("id", clubId);
      if (error) throw error;
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["ranking-points-club", clubId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ===== Seed from ladder =====
  const [seeding, setSeeding] = useState(false);
  const [topScore, setTopScore] = useState("1000");
  const [step, setStep] = useState("10");
  const [unrankedDefault, setUnrankedDefault] = useState("500");

  const seed = async () => {
    if (!confirm("Seed every member's ranking points from their current ladder position? This overwrites existing balances.")) return;
    setSeeding(true);
    try {
      const { data, error } = await supabase.rpc("seed_ranking_points_from_ladder" as any, {
        _club_id: clubId,
        _top_score: Number(topScore) || 1000,
        _step: Number(step) || 10,
        _unranked_default: Number(unrankedDefault) || 500,
      });
      if (error) throw error;
      toast.success(`Seeded ${data ?? 0} members`);
      queryClient.invalidateQueries({ queryKey: ["ranking-points-leaderboard", clubId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSeeding(false);
    }
  };

  // ===== Pending queue =====
  const { data: pending = [], isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ["ranking-points-pending", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ranking_points_pending" as any)
        .select("*, winner:club_members!ranking_points_pending_winner_member_id_fkey(id,name,ranking_points), loser:club_members!ranking_points_pending_loser_member_id_fkey(id,name,ranking_points)")
        .eq("club_id", clubId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const approveRow = async (id: string) => {
    try {
      const { error } = await supabase.rpc("approve_ranking_points_pending" as any, { _pending_id: id });
      if (error) throw error;
      toast.success("Approved");
      refetchPending();
      queryClient.invalidateQueries({ queryKey: ["ranking-points-leaderboard", clubId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const rejectRow = async (id: string) => {
    const note = prompt("Reason for rejection (optional):") || null;
    try {
      const { error } = await supabase
        .from("ranking_points_pending" as any)
        .update({ status: "rejected", review_note: note, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Rejected");
      refetchPending();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ===== Leaderboard =====
  const { data: leaderboard = [], refetch: refetchBoard } = useQuery({
    queryKey: ["ranking-points-leaderboard", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("id, name, ranking_points, ladder_position")
        .eq("club_id", clubId)
        .order("ranking_points", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  if (clubLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="pending">
            Pending {pending.length > 0 && <Badge variant="destructive" className="ml-1.5 h-4 px-1.5 text-[10px]">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="board">Leaderboard</TabsTrigger>
        </TabsList>

        {/* SETTINGS */}
        <TabsContent value="settings" className="space-y-4 pt-3">
          <Card className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Ranking Points System</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ATP-style points that run alongside the pyramid ladder. All point movements require admin approval.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Base win points</Label>
                <Input type="number" step="0.05" value={baseWin} onChange={(e) => setBaseWin(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Upset bonus / rank gap</Label>
                <Input type="number" step="0.05" value={upset} onChange={(e) => setUpset(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Favourite win minimum</Label>
                <Input type="number" step="0.05" value={favMin} onChange={(e) => setFavMin(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Loser deduction</Label>
                <Input type="number" step="0.05" value={loserDed} onChange={(e) => setLoserDed(e.target.value)} className="h-8" />
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground bg-muted/40 rounded p-2">
              <p><strong>Formula:</strong> Winner gets <em>base + (upset bonus × rank gap)</em> if they were the underdog,
              or <em>max(base − 0.02 × gap, floor)</em> if they were the favourite.</p>
            </div>

            <Button onClick={saveSettings} disabled={saving} size="sm">
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Save settings
            </Button>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Seed from ladder</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Initialises each member's points from their current ladder position. Linear: top = top score, each rank below subtracts the step.
              Unranked members get the default. <strong>Overwrites existing balances.</strong>
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Top score</Label>
                <Input type="number" value={topScore} onChange={(e) => setTopScore(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Step per rank</Label>
                <Input type="number" value={step} onChange={(e) => setStep(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Unranked default</Label>
                <Input type="number" value={unrankedDefault} onChange={(e) => setUnrankedDefault(e.target.value)} className="h-8" />
              </div>
            </div>
            <Button onClick={seed} disabled={seeding} size="sm" variant="outline">
              {seeding ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
              Seed now
            </Button>
          </Card>
        </TabsContent>

        {/* PENDING */}
        <TabsContent value="pending" className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              <ShieldAlert className="w-3.5 h-3.5 inline mr-1 text-amber-600" />
              Approve or reject each movement. Nothing on the leaderboard moves until approved.
            </p>
            <Button size="sm" variant="ghost" onClick={() => refetchPending()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>

          {pendingLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : pending.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">No pending point movements.</Card>
          ) : (
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Winner</TableHead>
                    <TableHead className="text-center">Δ</TableHead>
                    <TableHead>Loser</TableHead>
                    <TableHead className="text-center">Δ</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">{p.match_source_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{p.winner?.name || p.winner_member_id.slice(0, 8)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          rank #{p.winner_rank_at_match ?? "—"} · {Number(p.winner?.ranking_points ?? 0).toFixed(2)} pts
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                        +{Number(p.winner_delta).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{p.loser?.name || p.loser_member_id.slice(0, 8)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          rank #{p.loser_rank_at_match ?? "—"} · {Number(p.loser?.ranking_points ?? 0).toFixed(2)} pts
                        </div>
                      </TableCell>
                      <TableCell className={`text-center font-semibold text-xs ${Number(p.loser_delta) < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
                        {Number(p.loser_delta) === 0 ? "—" : Number(p.loser_delta).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600" onClick={() => approveRow(p.id)}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-600" onClick={() => rejectRow(p.id)}>
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* LEADERBOARD */}
        <TabsContent value="board" className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Current ranking-points standings (top 200).</p>
            <Button size="sm" variant="ghost" onClick={() => refetchBoard()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right w-24">Points</TableHead>
                  <TableHead className="text-center w-20 text-[10px]">Ladder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((m: any, i: number) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium">{m.name}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{Number(m.ranking_points ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-center text-[11px] text-muted-foreground">{m.ladder_position ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

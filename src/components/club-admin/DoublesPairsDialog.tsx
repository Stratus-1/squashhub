import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Users } from "lucide-react";
import { validatePairComposition, type CompetitionCategory } from "@/lib/leagues/category";
import { pairDisplayName } from "@/lib/leagues/format";

/**
 * Pair management for Doubles / Hybrid leagues.
 *
 * A pair is two REAL club members allocated to a team for a season — never a
 * synthetic member record. Pairs feed fixture selection; historical results
 * keep their own frozen player snapshot, so editing pairs never rewrites past
 * fixtures.
 */
export function DoublesPairsDialog({
  open,
  onOpenChange,
  clubId,
  associationId,
  seasonId,
  category,
  requireMixedPair,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clubId: string;
  associationId: string;
  seasonId?: string | null;
  category: CompetitionCategory | null;
  requireMixedPair: boolean;
}) {
  const qc = useQueryClient();
  const [teamId, setTeamId] = useState<string>("");
  const [p1, setP1] = useState<string>("");
  const [p2, setP2] = useState<string>("");

  const { data: teams = [] } = useQuery({
    queryKey: ["doubles-pairs-teams", associationId, seasonId],
    enabled: open && !!associationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("id, name, code, season_id")
        .eq("association_id", associationId)
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []).filter((t: any) => !seasonId || !t.season_id || t.season_id === seasonId);
    },
  });

  const activeTeam = teamId || teams[0]?.id || "";

  const { data: roster = [] } = useQuery({
    queryKey: ["doubles-pairs-roster", clubId, activeTeam],
    enabled: open && !!clubId,
    queryFn: async () => {
      // Team registrations (if any) are shown first, but pairs can be built
      // from ANY club member — teams are usually filled after pairing.
      const [{ data: regs }, { data: members, error }] = await Promise.all([
        activeTeam
          ? supabase
              .from("member_league_registrations")
              .select("club_member_id")
              .eq("league_id", activeTeam)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase
          .from("club_members")
          .select("id, name, gender, status")
          .eq("club_id", clubId)
          .order("name"),
      ]);
      if (error) throw error;
      const registered = new Set((regs ?? []).map((r: any) => r.club_member_id));
      const list = (members ?? [])
        .filter((m: any) => !m.status || m.status === "active")
        .map((m: any) => ({
          id: m.id as string,
          name: (m.name as string) ?? "Unknown",
          gender: (m.gender as string) ?? null,
          inTeam: registered.has(m.id),
        }));
      list.sort((a, b) =>
        a.inTeam === b.inTeam ? a.name.localeCompare(b.name) : a.inTeam ? -1 : 1,
      );
      return list;
    },
  });


  const { data: pairs = [] } = useQuery({
    queryKey: ["doubles-pairs", activeTeam, seasonId],
    enabled: open && !!activeTeam,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("league_team_pairs")
        .select("*")
        .eq("league_id", activeTeam)
        .order("pair_order", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const nameOf = useMemo(() => {
    const m = new Map(roster.map((r) => [r.id, r.name] as const));
    return (id: string) => m.get(id) ?? "Unknown";
  }, [roster]);

  const create = useMutation({
    mutationFn: async () => {
      if (!p1 || !p2 || p1 === p2) throw new Error("Choose two different players.");
      const genders = [p1, p2].map((id) => roster.find((r) => r.id === id)?.gender);
      const check = validatePairComposition(genders, category, { requireMixedPair });
      if (!check.valid) throw new Error(check.reason!);
      const { error } = await (supabase as any).from("league_team_pairs").insert({
        club_id: clubId,
        league_id: activeTeam,
        season_id: seasonId ?? null,
        player_one_member_id: p1,
        player_two_member_id: p2,
        pair_order: pairs.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pair created");
      setP1("");
      setP2("");
      qc.invalidateQueries({ queryKey: ["doubles-pairs", activeTeam, seasonId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("league_team_pairs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pair removed");
      qc.invalidateQueries({ queryKey: ["doubles-pairs", activeTeam, seasonId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Doubles pairs
          </DialogTitle>
          <DialogDescription>
            Pairs are two real players allocated to a team for this season. Past results keep the
            players who actually played.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Team</Label>
            <Select value={activeTeam} onValueChange={setTeamId}>
              <SelectTrigger><SelectValue placeholder="Select a team" /></SelectTrigger>
              <SelectContent>
                {teams.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{t.code ? ` (${t.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Player 1</Label>
              <Select value={p1} onValueChange={setP1}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {roster.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Player 2</Label>
              <Select value={p2} onValueChange={setP2}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {roster.filter((r) => r.id !== p1).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            size="sm"
            className="w-full"
            disabled={!p1 || !p2 || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Adding..." : "Add pair"}
          </Button>

          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {pairs.map((pair, i) => (
              <div
                key={pair.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2"
              >
                <div className="min-w-0">
                  <Badge variant="outline" className="h-5 text-[10px] mr-2">Pair {i + 1}</Badge>
                  <span className="text-sm">
                    {pairDisplayName(
                      nameOf(pair.player_one_member_id),
                      nameOf(pair.player_two_member_id),
                    )}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove.mutate(pair.id)}
                  aria-label="Remove pair"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {!pairs.length && (
              <p className="text-xs text-muted-foreground">No pairs yet for this team.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

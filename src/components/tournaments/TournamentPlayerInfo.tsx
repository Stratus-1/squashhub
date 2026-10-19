import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const key = (id: string) => ["tournament-player-info", id];

function useInfo(tournamentId?: string | null) {
  return useQuery({
    queryKey: key(tournamentId ?? ""),
    enabled: !!tournamentId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tournaments").select("player_info").eq("id", tournamentId!).maybeSingle();
      if (error) throw error;
      return (data?.player_info ?? "") as string;
    },
  });
}

/** Read-only notice shown to players; hidden when empty. */
export function TournamentPlayerInfoNotice({ tournamentId }: { tournamentId?: string | null }) {
  const { data } = useInfo(tournamentId);
  if (!data?.trim()) return null;
  return (
    <div
      className="rounded-lg border-2 border-success/60 bg-success/10 p-4 flex gap-3"
      data-testid="tournament-player-info"
    >
      <Info className="h-6 w-6 mt-1 shrink-0 text-success" />
      <div className="space-y-1">
        <p className="text-base font-bold text-success-foreground">Additional information</p>
        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">{data}</p>
      </div>
    </div>
  );
}

/** Admin editor; saves straight to the tournament. */
export function TournamentPlayerInfoEditor({ tournamentId }: { tournamentId?: string | null }) {
  const qc = useQueryClient();
  const { data, isLoading } = useInfo(tournamentId);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(data ?? ""); }, [data]);
  if (!tournamentId) {
    return <p className="text-xs text-muted-foreground">Additional information for players can be added once the tournament is saved.</p>;
  }
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("tournaments").update({ player_info: text.trim() || null }).eq("id", tournamentId);
    setSaving(false);
    if (error) { toast.error("Couldn't save the information."); return; }
    qc.invalidateQueries({ queryKey: key(tournamentId) });
    toast.success("Information for players saved");
  };
  return (
    <div className="space-y-1 max-w-2xl">
      <Label htmlFor="tournament-player-info">Additional information for players (optional)</Label>
      <Textarea id="tournament-player-info" rows={3} value={text} disabled={isLoading} onChange={(e) => setText(e.target.value)}
        placeholder="e.g. After the Swiss rounds, players progress to 4 or 5 rounds with play-offs." />
      <p className="text-xs text-muted-foreground">Shown to players on the tournament page, Progress log and Log view.</p>
      <Button type="button" size="sm" onClick={save} disabled={saving || text === (data ?? "")}>{saving ? "Saving…" : "Save information"}</Button>
    </div>
  );
}

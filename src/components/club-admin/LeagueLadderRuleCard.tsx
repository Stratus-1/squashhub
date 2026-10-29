import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  associationId: string;
  seasonYear: number;
  isClub: boolean;
}

type Choice = "inherit" | "match" | "final_standings" | "off";

function toChoice(affects: boolean | null, mode: string | null): Choice {
  if (affects === false) return "off";
  if (mode === "final_standings") return "final_standings";
  if (affects === true) return "match";
  return "inherit";
}

/** Per-league "Affects club ladder" and timing. Club switches still apply first. */
export function LeagueLadderRuleCard({ associationId, seasonYear, isClub }: Props) {
  const qc = useQueryClient();
  const key = ["league-ladder-rules", associationId, seasonYear];
  const { data: rows = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("leagues")
        .select("id,name,ladder_affects,ladder_update_mode")
        .eq("association_id", associationId)
        .eq("season_year", seasonYear)
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; ladder_affects: boolean | null; ladder_update_mode: string | null }[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ id, choice }: { id: string; choice: Choice }) => {
      const { error } = await (supabase as any).rpc("league_set_ladder_rule", {
        p_league_id: id,
        p_affects: choice === "off" ? false : choice === "inherit" ? null : true,
        p_timing: choice === "final_standings" ? "final_standings" : "match",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ladder setting saved");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e?.message || "Could not save the ladder setting"),
  });

  if (rows.length === 0) return null;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div>
        <p className="text-sm font-medium">Affects club ladder</p>
        <p className="text-[11px] text-muted-foreground">
          Only applies when {isClub ? "Club Leagues" : "System Leagues"} are switched on under Ladder settings.
          "Only at the end" leaves the ladder alone during the season; apply final changes from the ladder impact
          preview.
        </p>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate text-xs">{r.name}</span>
          <Select
            value={toChoice(r.ladder_affects, r.ladder_update_mode)}
            onValueChange={(v) => save.mutate({ id: r.id, choice: v as Choice })}
          >
            <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Follow club setting</SelectItem>
              <SelectItem value="match">After each result</SelectItem>
              <SelectItem value="final_standings">Only at the end</SelectItem>
              <SelectItem value="off">Does not affect ladder</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

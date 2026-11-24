import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const db = supabase as any;
type State = "auto" | "playing" | "not_playing" | "removed";

/** Club-admin control on a member's record: is this person playing junior squash? */
export function JuniorPlayerControl({ memberId }: { memberId: string }) {
  const qc = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ["junior-state", memberId],
    queryFn: async () => {
      const { data, error } = await db.rpc("junior_state_for_member", { _member_id: memberId });
      if (error) throw error;
      return (data?.[0] ?? null) as { has_person: boolean; admin_state: string | null; removed: boolean; is_on: boolean; source: string | null } | null;
    },
  });
  const save = useMutation({
    mutationFn: async (state: State) => {
      const { error } = await db.rpc("set_junior_list_state", { _member_id: memberId, _state: state, _org_id: null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["junior-state", memberId] });
      qc.invalidateQueries({ queryKey: ["junior-squads"] });
      toast.success("Junior squash setting saved");
    },
    onError: (e: any) => toast.error(e.message || "Could not save"),
  });
  if (error || !data) return null;
  const current: State = data.removed ? "removed" : data.admin_state === "on" ? "playing" : data.admin_state === "off" ? "not_playing" : "auto";
  const autoLabel = data.admin_state == null ? (data.is_on ? "Automatic (currently playing, from SportyHQ)" : "Automatic (by age / SportyHQ)") : "Automatic (by age / SportyHQ)";
  return (
    <div className="rounded-md border border-border p-2.5 space-y-1">
      <Label htmlFor="junior-player-state" className="text-sm font-medium">Junior squash</Label>
      <select
        id="junior-player-state"
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={current}
        disabled={!data.has_person || save.isPending}
        onChange={(e) => save.mutate(e.target.value as State)}
      >
        <option value="auto">{autoLabel}</option>
        <option value="playing">Playing junior squash</option>
        <option value="not_playing">Not playing junior squash</option>
        <option value="removed">Removed from the juniors list</option>
      </select>
      <p className="text-[10px] text-muted-foreground">
        {data.has_person ? "Saves immediately. Removing only takes them off the juniors list — they stay a club member." : "Not linked to a national player record yet, so this can't be set."}
      </p>
    </div>
  );
}

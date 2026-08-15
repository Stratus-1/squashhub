import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Percent, Save } from "lucide-react";

export const PLATFORM_TOURNAMENT_FEE_KEY = "platform_tournament_fee_pct";

/** Reads the SquashHub admin fee (% of each tournament entry fee). */
export function usePlatformTournamentFeePct() {
  return useQuery({
    queryKey: ["platform-tournament-fee-pct"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", PLATFORM_TOURNAMENT_FEE_KEY)
        .maybeSingle();
      if (error) throw error;
      const raw = String((data as any)?.value ?? "3").replace(/"/g, "");
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : 3;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function PlatformTournamentFeeCard() {
  const qc = useQueryClient();
  const { data: pct } = usePlatformTournamentFeePct();
  const [value, setValue] = useState<string | null>(null);
  const current = value ?? String(pct ?? 3);

  const save = useMutation({
    mutationFn: async () => {
      const n = Math.max(0, Math.min(100, parseFloat(current) || 0));
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: PLATFORM_TOURNAMENT_FEE_KEY, value: String(n) }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("SquashHub tournament admin fee saved");
      qc.invalidateQueries({ queryKey: ["platform-tournament-fee-pct"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const example = ((parseFloat(current) || 0) / 100) * 350;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Percent className="w-4 h-4" /> SquashHub tournament admin fee
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-2xl">
            Charged as a percentage of every tournament entry fee, deducted before the federation, association and host
            shares. Applies to all tournaments on the platform.
          </p>
        </div>
        <Button size="sm" className="h-7 text-xs" disabled={save.isPending} onClick={() => save.mutate()}>
          <Save className="w-3.5 h-3.5 mr-1" />{save.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Admin fee (%)</Label>
          <Input
            className="h-8 text-xs w-32"
            type="number" min={0} max={100} step="0.1"
            value={current}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <p className="text-[11px] text-muted-foreground pb-2">
          Example: R 350 entry → <strong>R {example.toFixed(2)}</strong> per player.
        </p>
      </div>
    </Card>
  );
}

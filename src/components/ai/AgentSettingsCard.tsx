// Phase 2 — maintenance agent dispatch settings + kill switch (Super Admin).
// Dispatch, Lovable instructions and auto-release stay OFF while the database stage lock is on; "Turn off" always works.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Lock, Power } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Settings = {
  dispatch_mode: "off" | "shadow" | "pilot";
  lovable_instructions_enabled: boolean;
  stage_lock: boolean;
  pilot_allowlist: string[];
  max_dispatches_per_day: number;
  max_active_cases: number;
  max_instructions_per_day: number;
  auto_release_enabled: boolean;
  auto_release_circuit_open: boolean;
  auto_release_circuit_reason: string | null;
  max_auto_releases_per_day: number;
  updated_at: string;
};

const MODE_LABEL: Record<Settings["dispatch_mode"], string> = {
  off: "Off", shadow: "Shadow (investigate only)", pilot: "Pilot (allowlisted low-risk)",
};

export function AgentSettingsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-agent-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("maintenance-queue", { body: { op: "get_agent_settings" } });
      if (error) throw error;
      return data as { settings: Settings | null; dispatch_counts: Record<string, number>; agent_secret_configured: boolean };
    },
  });

  const killSwitch = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("maintenance-queue", { body: { op: "set_agent_settings", dispatchMode: "off" } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => { toast.success("Agent dispatch is off"); qc.invalidateQueries({ queryKey: ["maintenance-agent-settings"] }); },
    onError: (e: any) => toast.error(e?.message || "Could not update"),
  });

  const s = data?.settings;
  const on = !!s && s.dispatch_mode !== "off";
  const counts = data?.dispatch_counts ?? {};

  return (
    <Card className="border-border/60">
      <CardContent className="p-3 flex flex-wrap items-center gap-2 text-[12px]">
        <Bot className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium">Maintenance agent</span>
        {isLoading ? <span className="text-muted-foreground">Loading…</span> : (
          <>
            <Badge variant="secondary" className={cn("text-[10px]", on ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25" : "")}>
              Dispatch: {s ? MODE_LABEL[s.dispatch_mode] : "Off"}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">Lovable instructions: {s?.lovable_instructions_enabled ? "On" : "Off"}</Badge>
            <Badge variant="secondary" className="text-[10px]">Low-risk auto-release: {s?.auto_release_enabled ? "On" : "Off"}</Badge>
            {s?.auto_release_circuit_open && (
              <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20">
                Auto-release paused: {s.auto_release_circuit_reason ?? "repeated failures"}
              </Badge>
            )}
            {s?.stage_lock && (
              <Badge variant="secondary" className="text-[10px]"><Lock className="w-3 h-3 mr-1" />Stage 0 lock</Badge>
            )}
            <Badge variant="secondary" className="text-[10px]">Agent key: {data?.agent_secret_configured ? "configured" : "not set"}</Badge>
            <span className="text-[11px] text-muted-foreground">
              Queued {counts.pending ?? 0} · Working {counts.claimed ?? 0} · Unreachable {counts.dead ?? 0} · Limits {s?.max_dispatches_per_day ?? 0}/day, {s?.max_active_cases ?? 0} active, {s?.max_instructions_per_day ?? 0} instructions/day, {s?.max_auto_releases_per_day ?? 0} auto-releases/day
            </span>
            <span className="text-[11px] text-muted-foreground w-full">
              Three separate switches: agent dispatch, Lovable instructions, and low-risk auto-release. Clear, small, low-risk bugs that pass every release check are fixed and published without you; anything protected, uncertain or failing waits for your approval. Two failed automatic releases in 7 days pause auto-release automatically. Normal AI Assistance is not affected.
            </span>
            <Button size="sm" variant={on ? "destructive" : "outline"} className="h-7 text-[11px] ml-auto" disabled={!on || killSwitch.isPending}
              onClick={() => killSwitch.mutate()}>
              <Power className="w-3.5 h-3.5 mr-1" />{on ? "Turn off agent dispatch" : "Dispatch is off"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileSignature, ShieldAlert } from "lucide-react";

/**
 * Reminds the club's billing officers (the same people who receive the
 * trial-ending / SLA-outstanding emails) to sign the service agreement and
 * complete their subscription details.
 *
 * Visibility is decided server-side by get_sla_prompt_state(): it shows only
 * for finance/admin officers or addresses on the club billing profile, starts
 * the configured lead time (default 10 days) before the trial ends, and keeps
 * showing until the SLA is signed.
 */
export function SlaOutstandingPrompt({ clubId }: { clubId?: string | null }) {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["sla-prompt-state", clubId],
    enabled: !!clubId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sla_prompt_state", { _club_id: clubId! });
      if (error) throw error;
      return data as any;
    },
  });

  if (!data?.show) return null;

  const daysLeft = Number(data.days_left ?? 0);
  const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
  const ended = daysLeft < 0;

  return (
    <div className={`rounded-lg border p-3 ${ended ? "border-destructive/50 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5"}`}>
      <div className="flex items-start gap-2">
        <ShieldAlert className={`w-4 h-4 mt-0.5 shrink-0 ${ended ? "text-destructive" : "text-amber-500"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {ended ? "Service agreement outstanding" : "Complete your subscription details"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ended
              ? "Your free trial has ended. Accept the SquashHub service agreement and confirm your billing details to keep the club active."
              : `Your free trial ends ${trialEnd ? trialEnd.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : "soon"}${
                  daysLeft === 0 ? " (today)" : ` — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
                }. Accept the service agreement and confirm your billing details.`}
          </p>
          <div className="mt-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => navigate("/club-admin?tab=subscription")}>
              <FileSignature className="w-3.5 h-3.5 mr-1.5" /> Review &amp; sign
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

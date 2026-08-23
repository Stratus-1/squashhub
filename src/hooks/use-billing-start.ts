import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Platform-wide fallback used only when a club has no trial end recorded. */
const DEFAULT_BILLING_START = "2026-09-01";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * The date a club's paid subscription actually starts — the day after its trial
 * ends, as captured in Super Admin. Falls back to the platform go-live date
 * when no trial end has been set for the club.
 */
export function useClubBillingStart(clubId?: string) {
  const { data } = useQuery({
    queryKey: ["club-trial-end", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_subscriptions")
        .select("trial_ends_at")
        .eq("club_id", clubId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.trial_ends_at as string | null) ?? null;
    },
  });

  const trialEndIso = data ? String(data).slice(0, 10) : null;

  let startIso = DEFAULT_BILLING_START;
  if (trialEndIso) {
    // Add one calendar day in UTC so local timezones (e.g. SAST, UTC+2) can't
    // shift the result back onto the trial end date itself.
    const d = new Date(`${trialEndIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    startIso = d.toISOString().slice(0, 10);
  }

  return {
    trialEndIso,
    trialEndLabel: trialEndIso ? fmt(trialEndIso) : null,
    startIso,
    startLabel: fmt(startIso),
    isDefault: !trialEndIso,
  };
}

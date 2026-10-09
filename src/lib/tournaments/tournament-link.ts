import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";

/**
 * The tournament's permanent player link — the same destination its Match Day QR encodes
 * (`/md/<token>` on the club's address). Falls back to the signed-in tournament page when
 * Match Day Access is not switched on. Mirrors `_shared/match-day-cta.ts` so messages never drift.
 */
export async function tournamentLink(clubId: string, champId: string): Promise<string> {
  const [{ data: club }, { data: access }] = await Promise.all([
    supabase.from("clubs").select("subdomain").eq("id", clubId).maybeSingle(),
    fromExt("match_day_access").select("token").eq("competition_kind", "tournament")
      .eq("competition_id", champId).eq("status", "active").maybeSingle(),
  ]);
  const sub = String((club as any)?.subdomain || "").trim().toLowerCase();
  const base = /^[a-z0-9-]+$/.test(sub) ? `https://${sub}.squashhub.co.za` : "https://squashhub.co.za";
  const token = (access as any)?.token;
  return token ? `${base}/md/${token}` : `${base}/club-champs/${champId}`;
}

/**
 * Dashboard knockout round-up toast.
 *
 * When a member opens the app, a dismissible toast lists the players who won
 * their knockout matches ("Well done with your wins") and those knocked out
 * ("Sorry to see you go"). It fires once per day per club; the very first one
 * covers the whole event so far. The digest day matches DailyDigestCard:
 * today's results from 22:00, otherwise yesterday's round-up.
 */

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { fromExt } from "@/lib/supabase-ext";
import { koResultEvents, hasKnockoutStage, type KoMatchLike } from "@/lib/tournaments/survivors";
import { digestDate } from "@/components/tournaments/DailyDigestCard";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const joinName = (rel: any): string | null => {
  if (!rel) return null;
  const n = rel.name ?? rel.profiles?.name ?? null;
  return n ? String(n) : null;
};

export function useChampDailyToast(clubId?: string | null, enabled: boolean = true) {
  const { data: matches } = useQuery({
    queryKey: ["champ-daily-toast-matches", clubId],
    queryFn: async () => {
      const { data: champs, error: cErr } = await fromExt("club_champs")
        .select("id")
        .eq("club_id", clubId!)
        .in("status", ["in_progress", "active", "published"]);
      if (cErr) throw cErr;
      const ids = (champs || []).map((c: any) => c.id);
      if (!ids.length) return [] as any[];
      const { data, error } = await fromExt("club_champs_matches")
        .select(
          "id, champ_id, group_number, scheduled_date, updated_at, status, stage, is_bye, winner_member_id, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, player_a:player_a_member_id(name), player_b:player_b_member_id(name), partner_a:partner_a_member_id(name), partner_b:partner_b_member_id(name)",
        )
        .in("champ_id", ids)
        .in("status", ["completed", "walkover"]);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!clubId && enabled,
    staleTime: 5 * 60 * 1000,
  });

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of matches || []) {
      for (const k of ["player_a", "player_b", "partner_a", "partner_b"] as const) {
        const id = m[`${k}_member_id`];
        const n = joinName(m[k]);
        if (id && n && !map.has(id)) map.set(id, n);
      }
    }
    return (id: string) => map.get(id) || null;
  }, [matches]);

  useEffect(() => {
    if (!clubId || !matches || !matches.length) return;
    if (!hasKnockoutStage(matches as KoMatchLike[])) return;

    const date = digestDate(new Date());
    const storageKey = `sh.champ.digest.toast.${clubId}.last`;
    let last: string | null = null;
    try {
      last = localStorage.getItem(storageKey);
    } catch {
      /* ignore */
    }
    if (last === date) return;
    const firstRun = last === null;

    const events = koResultEvents(matches as KoMatchLike[]);
    const winners = new Set<string>();
    const losers = new Set<string>();
    for (const e of events) {
      if (firstRun || e.date === date) {
        e.winnerIds.forEach((id) => winners.add(id));
        e.loserIds.forEach((id) => losers.add(id));
      }
    }
    winners.forEach((id) => losers.delete(id));

    const winnerNames = [...winners].map(nameOf).filter(Boolean) as string[];
    const loserNames = [...losers].map(nameOf).filter(Boolean) as string[];
    winnerNames.sort((a, b) => a.localeCompare(b));
    loserNames.sort((a, b) => a.localeCompare(b));
    if (!winnerNames.length && !loserNames.length) return;

    try {
      localStorage.setItem(storageKey, date);
    } catch {
      /* ignore */
    }

    toast.custom(
      (t) => (
        <div className="w-full max-w-sm rounded-lg border border-amber-500/40 bg-card p-3 shadow-lg text-[13px]">
          <p className="font-semibold mb-1">🏆 Championship round-up</p>
          {winnerNames.length > 0 && (
            <p className="mb-1">
              <span className="font-medium">Well done with your wins{firstRun ? " so far" : ""}:</span>{" "}
              {winnerNames.join(", ")}
            </p>
          )}
          {loserNames.length > 0 && (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Sorry to see you go:</span> {loserNames.join(", ")}
            </p>
          )}
          <button
            className="mt-2 text-[11px] font-medium text-primary hover:underline"
            onClick={() => toast.dismiss(t)}
          >
            Close
          </button>
        </div>
      ),
      { duration: Infinity, id: `champ-digest-${clubId}-${date}` },
    );
  }, [clubId, matches, nameOf]);
}

export { ymd as _digestYmd };

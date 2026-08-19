import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tournament marker presence + hand-over.
 *
 * Mirrors `league_marker_locks` (see LeagueGameDetail) but for
 * `club_champs_matches`. A lock row records who is currently marking a
 * tournament game, refreshed by a 20s heartbeat. A second person never
 * silently steals the game: they raise a take-over request, the current
 * marker approves it, and only then does the lock move.
 *
 * Safety valves (so a night of squash is never blocked):
 *  - stale heartbeat (>60s) => the lock is ignored, anyone may mark
 *  - no answer within 60s of a request => the requester may force it
 */

export const CHAMP_LOCK_FRESH_MS = 60_000;
export const CHAMP_TAKEOVER_WAIT_MS = 60_000;
const HEARTBEAT_MS = 20_000;

export type ChampMarkerLock = {
  match_id: string;
  user_id: string;
  user_name: string;
  heartbeat_at: string;
  takeover_requested_by: string | null;
  takeover_requested_name: string | null;
  takeover_requested_at: string | null;
  takeover_declined_at: string | null;
};

const table = () => (supabase as any).from("champ_marker_locks");

export function isLockFresh(lock: ChampMarkerLock | null | undefined): boolean {
  if (!lock) return false;
  return Date.now() - new Date(lock.heartbeat_at).getTime() < CHAMP_LOCK_FRESH_MS;
}

/** Read the current lock for a single match (one-shot, no subscription). */
export async function fetchChampMarkerLock(matchId: string): Promise<ChampMarkerLock | null> {
  const { data } = await table().select("*").eq("match_id", matchId).maybeSingle();
  return (data as ChampMarkerLock) || null;
}

/** Live lock state for one match, with claim/release/request/approve helpers. */
export function useChampMarkerLock(matchId: string | null | undefined, userId?: string | null, userName?: string) {
  const [lock, setLock] = useState<ChampMarkerLock | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    if (!matchId) { setLock(null); return null; }
    const row = await fetchChampMarkerLock(matchId);
    setLock(row);
    return row;
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    const run = async () => { const r = await fetchChampMarkerLock(matchId); if (!cancelled) setLock(r); };
    run();
    const poll = setInterval(run, 15_000);
    const ch = supabase
      .channel(`champ-marker-lock:${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "champ_marker_locks", filter: `match_id=eq.${matchId}` }, () => run())
      .subscribe();
    return () => { cancelled = true; clearInterval(poll); supabase.removeChannel(ch); };
  }, [matchId]);

  // Recompute freshness on a timer so a stale lock fades without a refetch.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const fresh = useMemo(() => isLockFresh(lock), [lock, tick]);
  const heldByMe = !!lock && !!userId && lock.user_id === userId;
  const heldByOther = fresh && !!lock && !heldByMe;

  const claim = useCallback(async () => {
    if (!matchId || !userId) return;
    await table().upsert({
      match_id: matchId,
      user_id: userId,
      user_name: userName || "Marker",
      heartbeat_at: new Date().toISOString(),
      takeover_requested_by: null,
      takeover_requested_name: null,
      takeover_requested_at: null,
      takeover_declined_at: null,
    }, { onConflict: "match_id" });
    await refresh();
  }, [matchId, userId, userName, refresh]);

  const release = useCallback(async () => {
    if (!matchId || !userId) return;
    await table().delete().eq("match_id", matchId).eq("user_id", userId);
    await refresh();
  }, [matchId, userId, refresh]);

  const requestTakeover = useCallback(async () => {
    if (!matchId || !userId) return;
    await table().update({
      takeover_requested_by: userId,
      takeover_requested_name: userName || "Another marker",
      takeover_requested_at: new Date().toISOString(),
      takeover_declined_at: null,
    }).eq("match_id", matchId);
    await refresh();
  }, [matchId, userId, userName, refresh]);

  const declineTakeover = useCallback(async () => {
    if (!matchId || !userId) return;
    await table().update({
      takeover_requested_by: null,
      takeover_requested_name: null,
      takeover_requested_at: null,
      takeover_declined_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
    }).eq("match_id", matchId).eq("user_id", userId);
    await refresh();
  }, [matchId, userId, refresh]);

  /** Current marker approves: simply drop the lock so the requester can claim. */
  const approveTakeover = useCallback(async () => {
    if (!matchId || !userId) return;
    await table().delete().eq("match_id", matchId).eq("user_id", userId);
    await refresh();
  }, [matchId, userId, refresh]);

  return {
    lock, fresh, heldByMe, heldByOther,
    refresh, claim, release, requestTakeover, approveTakeover, declineTakeover,
  };
}

/**
 * Heartbeat helper for whoever is actively marking `matchId`.
 * Claims on mount, refreshes every 20s, releases on unmount.
 */
export function useChampMarkerHeartbeat(
  matchId: string | null | undefined,
  userId: string | null | undefined,
  userName: string,
  active: boolean,
) {
  const nameRef = useRef(userName);
  nameRef.current = userName;

  useEffect(() => {
    if (!active || !matchId || !userId) return;
    let cancelled = false;
    const beat = async () => {
      try {
        await table().upsert({
          match_id: matchId,
          user_id: userId,
          user_name: nameRef.current || "Marker",
          heartbeat_at: new Date().toISOString(),
        }, { onConflict: "match_id" });
      } catch (e) { console.warn("Champ marker heartbeat failed", e); }
    };
    beat();
    const id = setInterval(() => { if (!cancelled) beat(); }, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      table().delete().eq("match_id", matchId).eq("user_id", userId).then(() => {}, () => {});
    };
  }, [active, matchId, userId]);
}

/** Live locks across many matches (fixture list "LIVE"/"being marked" chips). */
export function useChampMarkerLocks(matchIds: string[]) {
  const [locks, setLocks] = useState<Record<string, ChampMarkerLock>>({});
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const idsKey = matchIds.slice().sort().join("|");

  useEffect(() => {
    if (!matchIds.length) { setLocks({}); return; }
    let cancelled = false;
    const ids = idsKey.split("|").filter(Boolean);
    const refresh = async () => {
      const { data } = await table().select("*").in("match_id", ids);
      if (cancelled) return;
      const next: Record<string, ChampMarkerLock> = {};
      for (const row of (data || []) as ChampMarkerLock[]) next[row.match_id] = row;
      setLocks(next);
    };
    refresh();
    const poll = setInterval(refresh, 20_000);
    const ch = supabase
      .channel(`champ-marker-locks:${idsKey.slice(0, 60)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "champ_marker_locks" }, (payload: any) => {
        const id = payload?.new?.match_id || payload?.old?.match_id;
        if (id && ids.includes(id)) refresh();
      })
      .subscribe();
    return () => { cancelled = true; clearInterval(poll); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    const recompute = () => {
      const now = Date.now();
      const s = new Set<string>();
      for (const [id, l] of Object.entries(locks)) {
        if (now - new Date(l.heartbeat_at).getTime() < CHAMP_LOCK_FRESH_MS) s.add(id);
      }
      setFreshIds(s);
    };
    recompute();
    const id = setInterval(recompute, 10_000);
    return () => clearInterval(id);
  }, [locks]);

  return { locks, freshMatchIds: freshIds };
}

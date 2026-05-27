import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type LockRow = {
  fixture_id: string;
  position: number;
  user_id: string;
  user_name: string;
  heartbeat_at: string;
};

/**
 * Subscribes to `league_marker_locks` for the given fixture IDs and returns the
 * subset of fixture IDs that currently have at least one *fresh* (<60s) marker.
 * Used by the fixture list to surface a "👁 View Live" button only while a game
 * is actively being marked.
 */
export function useFixtureLiveMarkers(fixtureIds: string[]) {
  const [locks, setLocks] = useState<LockRow[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  // Stable key for dependency arrays so we don't refetch every render.
  const idsKey = fixtureIds.slice().sort().join("|");

  useEffect(() => {
    if (fixtureIds.length === 0) {
      setLocks([]);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const { data } = await (supabase as any)
        .from("league_marker_locks")
        .select("fixture_id, position, user_id, user_name, heartbeat_at")
        .in("fixture_id", fixtureIds);
      if (cancelled) return;
      setLocks((data || []) as LockRow[]);
    };
    refresh();
    // Realtime is the fast path, but mobile networks routinely drop the WS
    // connection silently. Poll every 20s as a safety net so spectators
    // always see the LIVE button within ~20s of a marker starting, even
    // if no realtime event ever arrived.
    const pollId = setInterval(refresh, 20_000);
    const ch = supabase
      .channel(`fixtures-live-markers:${idsKey.slice(0, 60)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "league_marker_locks" },
        (payload: any) => {
          const fid = payload?.new?.fixture_id || payload?.old?.fixture_id;
          if (fid && fixtureIds.includes(fid)) refresh();
        }
      )
      .subscribe();
    return () => { cancelled = true; clearInterval(pollId); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Recompute "fresh" every 10s so stale locks fade out without a refresh.
  useEffect(() => {
    const recompute = () => {
      const now = Date.now();
      const s = new Set<string>();
      for (const l of locks) {
        if (now - new Date(l.heartbeat_at).getTime() < 60_000) s.add(l.fixture_id);
      }
      setFreshIds(s);
    };
    recompute();
    const id = setInterval(recompute, 10_000);
    return () => clearInterval(id);
  }, [locks]);

  return { freshFixtureIds: freshIds, locks };
}

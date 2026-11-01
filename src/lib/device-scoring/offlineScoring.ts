import { useCallback, useEffect, useRef, useState } from "react";
import { fromExt, rpcExt } from "@/lib/supabase-ext";

/**
 * "Score offline" for one tournament match. Every change is saved on this
 * phone first (localStorage) and sent to the server when a connection exists.
 * The server reservation makes this phone the only scorer of that match;
 * Live scoring of other matches never goes through this file.
 */

export interface OfflineGames { a: number; b: number }
export interface OfflineResult {
  result_id: string;
  winner: "a" | "b";
  games: OfflineGames[];
  duration_s: number;
  forfeit: "" | "a" | "b";
  scoring_format: string;
  best_of: number;
  is_doubles: boolean;
}

export interface OfflineSession {
  matchId: string;
  sessionId: string;
  ids: { a: string | null; b: string | null; pa: string | null; pb: string | null };
  revision: number;
  acked: number;
  pending: { games: OfflineGames[]; current: OfflineGames } | null;
  result: OfflineResult | null;
}

const KEY = (id: string) => `sh.device-scoring.v1:${id}`;

export function loadOfflineSession(matchId: string): OfflineSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY(matchId)) || "null");
    return s?.sessionId && s.matchId === matchId ? s : null;
  } catch {
    return null;
  }
}
export function saveOfflineSession(s: OfflineSession): boolean {
  try {
    localStorage.setItem(KEY(s.matchId), JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
export function clearOfflineSession(matchId: string) {
  try { localStorage.removeItem(KEY(matchId)); } catch {}
}
export function storageWritable(): boolean {
  try {
    localStorage.setItem("sh.device-scoring.probe", "1");
    localStorage.removeItem("sh.device-scoring.probe");
    return true;
  } catch {
    return false;
  }
}

/** Network problems retry quietly; server refusals need the marker's attention. */
export function isNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err);
  if (err.code && /^[0-9A-Z]{5}$/.test(String(err.code))) return false;
  return /fetch|network|timeout|offline|load failed/i.test(msg) || !err.code;
}

export function retryDelayMs(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt));
}

export type OfflineStatus = "idle" | "synced" | "waiting" | "attention";

export function useOfflineScoring(onAccepted: (r: OfflineResult) => void) {
  const [session, setSession] = useState<OfflineSession | null>(null);
  const [status, setStatus] = useState<OfflineStatus>("idle");
  const [attention, setAttention] = useState<string | null>(null);
  const ref = useRef<OfflineSession | null>(null);
  const busy = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptedRef = useRef(onAccepted);
  acceptedRef.current = onAccepted;

  const commit = (s: OfflineSession | null) => {
    ref.current = s;
    setSession(s ? { ...s } : null);
    if (s) saveOfflineSession(s);
  };

  const flush = useCallback(async () => {
    const s = ref.current;
    if (!s || busy.current) return;
    if (!s.pending && !s.result) { setStatus("synced"); return; }
    busy.current = true;
    let failed = false;
    try {
      if (s.pending) {
        const rev = s.revision;
        const { error } = await rpcExt("champ_device_sync", {
          p_match: s.matchId, p_session: s.sessionId, p_revision: rev,
          p_state: { ...s.pending, player_a: s.ids.a, player_b: s.ids.b, partner_a: s.ids.pa, partner_b: s.ids.pb },
        });
        if (error) throw error;
        const cur = ref.current;
        if (cur && cur.sessionId === s.sessionId) {
          cur.acked = Math.max(cur.acked, rev);
          if (cur.revision === rev) cur.pending = null;
          commit(cur);
        }
      }
      const cur = ref.current;
      if (cur?.result && !cur.pending) {
        const { error } = await rpcExt("champ_device_complete", {
          p_match: cur.matchId, p_session: cur.sessionId, p_revision: cur.revision + 1,
          p_result: { ...cur.result, player_a: cur.ids.a, player_b: cur.ids.b },
        });
        if (error) throw error;
        const result = cur.result;
        clearOfflineSession(cur.matchId);
        ref.current = null;
        setSession(null);
        setStatus("idle");
        acceptedRef.current(result);
        return;
      }
      attempt.current = 0;
      setAttention(null);
      setStatus(ref.current?.pending ? "waiting" : "synced");
    } catch (err: any) {
      failed = true;
      if (isNetworkError(err)) {
        setStatus("waiting");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), retryDelayMs(attempt.current++));
      } else {
        setStatus("attention");
        setAttention(err?.message || "The server refused this score.");
      }
    } finally {
      busy.current = false;
      if (ref.current?.pending && ref.current.revision > ref.current.acked && !failed) {
        // A newer change arrived while sending.
        setTimeout(() => void flush(), 50);
      }
    }
  }, []);

  useEffect(() => {
    const on = () => { attempt.current = 0; void flush(); };
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("online", on);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  /** Start (or resume) scoring this match offline. Throws when refused. */
  const start = useCallback(async (matchId: string, ownerLabel: string) => {
    const existing = loadOfflineSession(matchId);
    if (existing) {
      commit(existing);
      // Re-confirm ownership when online; offline we just keep scoring.
      const { error } = await rpcExt("champ_device_reserve", {
        p_match: matchId, p_session: existing.sessionId, p_owner_label: ownerLabel,
      });
      if (error && !isNetworkError(error)) {
        setStatus("attention");
        setAttention(error.message);
      } else {
        void flush();
      }
      return existing;
    }
    const { data: row, error: rowErr } = await fromExt("club_champs_matches")
      .select("player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id")
      .eq("id", matchId).maybeSingle();
    if (rowErr || !row) throw rowErr || new Error("Match not found");
    const sessionId = crypto.randomUUID();
    const { error } = await rpcExt("champ_device_reserve", {
      p_match: matchId, p_session: sessionId, p_owner_label: ownerLabel,
    });
    if (error) throw error;
    const r = row as any;
    const s: OfflineSession = {
      matchId, sessionId,
      ids: { a: r.player_a_member_id, b: r.player_b_member_id, pa: r.partner_a_member_id, pb: r.partner_b_member_id },
      revision: 0, acked: 0, pending: null, result: null,
    };
    if (!saveOfflineSession(s)) throw new Error("This phone cannot save the score offline.");
    commit(s);
    setStatus("synced");
    setAttention(null);
    return s;
  }, [flush]);

  const pushState = useCallback((games: OfflineGames[], current: OfflineGames) => {
    const s = ref.current;
    if (!s || s.result) return;
    s.revision += 1;
    s.pending = { games: games.map((g) => ({ a: g.a, b: g.b })), current: { a: current.a, b: current.b } };
    commit(s);
    setStatus("waiting");
    void flush();
  }, [flush]);

  const complete = useCallback((result: OfflineResult) => {
    const s = ref.current;
    if (!s) return;
    if (!s.result) s.result = result;
    commit(s);
    setStatus("waiting");
    void flush();
  }, [flush]);

  const release = useCallback(async () => {
    const s = ref.current;
    if (!s) return;
    try {
      await rpcExt("champ_device_release", { p_match: s.matchId, p_session: s.sessionId });
    } catch {}
    clearOfflineSession(s.matchId);
    ref.current = null;
    setSession(null);
    setStatus("idle");
  }, []);

  const retry = useCallback(() => { attempt.current = 0; setAttention(null); void flush(); }, [flush]);

  return { session, active: !!session, status, attention, start, pushState, complete, release, retry };
}

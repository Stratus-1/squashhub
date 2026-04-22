import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MarkerCastState {
  playerAName: string;
  playerBName: string;
  playerANumber?: string;
  playerBNumber?: string;
  scoreA: number;
  scoreB: number;
  gamesA: number;
  gamesB: number;
  server: "a" | "b";
  serveSide: "R" | "L";
  completedGames: { a: number; b: number; winnerId: "a" | "b" }[];
  matchOver: boolean;
  matchWinner: "a" | "b" | null;
  scoringFormat: string;
  bestOf: number;
  elapsed: number;
  clubName?: string;
  clubLogoUrl?: string;
}

function generateCode(): string {
  // 6-char alphanumeric, easy to read (no 0/O/1/I)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function useMarkerCast(clubId?: string) {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [casting, setCasting] = useState(false);
  const [paired, setPaired] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastStateRef = useRef<MarkerCastState | null>(null);
  const pendingRef = useRef<NodeJS.Timeout | null>(null);

  const start = useCallback(async () => {
    if (!user) return null;
    const code = generateCode();
    const { data, error } = await supabase
      .from("live_marker_sessions" as any)
      .insert({
        pair_code: code,
        marker_user_id: user.id,
        club_id: clubId ?? null,
        state: {},
      })
      .select("id, pair_code")
      .single();
    if (error || !data) {
      console.error("Failed to start cast session:", error);
      return null;
    }
    const row = data as unknown as { id: string; pair_code: string };
    setSessionId(row.id);
    setPairCode(row.pair_code);
    setCasting(true);

    // Subscribe to row updates so we know when TV pairs (paired_at set)
    const ch = supabase
      .channel(`marker-session-${row.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_marker_sessions", filter: `id=eq.${row.id}` },
        (payload) => {
          const newRow = payload.new as { paired_at: string | null };
          if (newRow.paired_at) setPaired(true);
        }
      )
      .subscribe();
    channelRef.current = ch;

    return row.pair_code;
  }, [user, clubId]);

  const pushState = useCallback(
    (state: MarkerCastState) => {
      if (!sessionId || !casting) return;
      lastStateRef.current = state;
      // Throttle to ~250ms
      if (pendingRef.current) return;
      pendingRef.current = setTimeout(async () => {
        pendingRef.current = null;
        const toSend = lastStateRef.current;
        if (!toSend) return;
        await supabase
          .from("live_marker_sessions" as any)
          .update({ state: toSend as any })
          .eq("id", sessionId);
      }, 250);
    },
    [sessionId, casting]
  );

  const stop = useCallback(async () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (sessionId) {
      await supabase.from("live_marker_sessions" as any).delete().eq("id", sessionId);
    }
    setSessionId(null);
    setPairCode(null);
    setCasting(false);
    setPaired(false);
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, []);

  return { start, stop, pushState, casting, paired, pairCode, sessionId };
}

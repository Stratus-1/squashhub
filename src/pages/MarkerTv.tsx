import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { MarkerCastState } from "@/hooks/use-marker-cast";
import { Tv, WifiOff } from "lucide-react";
import { SEO } from "@/components/SEO";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MarkerTv() {
  const { code: codeParam } = useParams<{ code?: string }>();
  const [code, setCode] = useState(codeParam?.toUpperCase() || "");
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<MarkerCastState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Try to pair on mount or when code changes
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      setConnecting(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("live_marker_sessions" as any)
        .select("id, state, expires_at")
        .eq("pair_code", code)
        .maybeSingle();

      if (cancelled) return;

      if (err || !data) {
        setError("Invalid or expired code. Please check and try again.");
        setConnecting(false);
        return;
      }
      const row = data as unknown as { id: string; state: any; expires_at: string };
      if (new Date(row.expires_at).getTime() < Date.now()) {
        setError("This cast session has expired.");
        setConnecting(false);
        return;
      }

      setSessionId(row.id);
      setState((row.state as MarkerCastState) || null);

      // Mark as paired
      await supabase
        .from("live_marker_sessions" as any)
        .update({ paired_at: new Date().toISOString() })
        .eq("id", row.id);

      // Subscribe to updates
      const ch = supabase
        .channel(`tv-session-${row.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "live_marker_sessions", filter: `id=eq.${row.id}` },
          (payload) => {
            const newRow = payload.new as { state: any };
            if (newRow.state) setState(newRow.state as MarkerCastState);
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "live_marker_sessions", filter: `id=eq.${row.id}` },
          () => {
            setError("The marker has ended this cast session.");
            setSessionId(null);
            setState(null);
          }
        )
        .subscribe();
      channelRef.current = ch;
      setConnecting(false);
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [code]);

  // Keep screen awake while paired
  useEffect(() => {
    if (!sessionId) return;
    let wakeLock: any = null;
    (async () => {
      try {
        // @ts-ignore
        wakeLock = await navigator.wakeLock?.request("screen");
      } catch { /* unsupported */ }
    })();
    return () => {
      try { wakeLock?.release(); } catch { /* noop */ }
    };
  }, [sessionId]);

  // ------ Pair entry view ------
  if (!sessionId || error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <SEO title="TV View | SquashHub" description="Live court scoreboard" />
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Tv className="w-10 h-10 text-primary" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-heading font-bold">Court TV View</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Enter the 6-character code from the marker's phone.
            </p>
          </div>
          {error && (
            <div className="rounded-lg bg-destructive/10 text-destructive p-3 text-sm flex items-center gap-2 justify-center">
              <WifiOff className="w-4 h-4" />
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const cleaned = input.trim().toUpperCase().replace(/\s/g, "");
              if (cleaned.length === 6) {
                setError(null);
                setCode(cleaned);
              } else {
                setError("Code must be 6 characters.");
              }
            }}
            className="space-y-3"
          >
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="w-full text-center text-4xl font-heading font-bold tracking-[0.5em] tabular-nums bg-muted rounded-xl py-5 outline-none focus:ring-2 focus:ring-primary uppercase"
            />
            <button
              type="submit"
              disabled={connecting}
              className="w-full bg-primary text-primary-foreground font-medium rounded-xl py-3 hover:opacity-90 transition disabled:opacity-50"
            >
              {connecting ? "Connecting…" : "Connect to Match"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ------ Live scoreboard view ------
  if (!state) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Waiting for match data…</p>
      </div>
    );
  }

  const winA = state.matchOver && state.matchWinner === "a";
  const winB = state.matchOver && state.matchWinner === "b";

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col p-6 lg:p-10">
      <SEO title={`${state.playerAName} vs ${state.playerBName} | TV`} description="Live court scoreboard" />

      {/* Header */}
      <div className="flex items-center justify-between text-muted-foreground mb-4 lg:mb-6">
        <div className="flex items-center gap-2">
          {state.clubLogoUrl && (
            <img src={state.clubLogoUrl} alt="" className="h-8 lg:h-10 w-auto" />
          )}
          <span className="text-base lg:text-xl font-medium">{state.clubName || "Live Match"}</span>
        </div>
        <div className="text-base lg:text-xl tabular-nums font-medium">
          {formatDuration(state.elapsed)}
        </div>
      </div>

      {/* Format */}
      <div className="text-center text-xs lg:text-sm text-muted-foreground mb-2 lg:mb-4 uppercase tracking-wider">
        {state.scoringFormat === "par11" ? "PAR 11" : state.scoringFormat === "par15" ? "PAR 15" : "English 9"}
        {" · "}Best of {state.bestOf}
      </div>

      {/* Main scoreboard */}
      <div className="flex-1 grid grid-cols-2 gap-4 lg:gap-8 items-stretch">
        {/* Player A */}
        <div className={`rounded-2xl p-6 lg:p-12 flex flex-col items-center justify-center bg-primary text-primary-foreground transition-all ${winA ? "ring-8 ring-[hsl(var(--win))]" : ""}`}>
          <p className="text-2xl lg:text-5xl font-heading font-bold text-center mb-1 lg:mb-3 truncate max-w-full">
            {state.playerAName}
          </p>
          {state.playerANumber && (
            <p className="text-sm lg:text-lg opacity-70 mb-2 lg:mb-4">#{state.playerANumber}</p>
          )}
          <div className="flex items-baseline gap-3 lg:gap-5">
            {state.server === "a" && (
              <span className="text-2xl lg:text-5xl font-bold text-[hsl(var(--accent))] animate-pulse">●</span>
            )}
            <p className="text-[10rem] lg:text-[18rem] font-heading font-black tabular-nums leading-none">
              {state.scoreA}
            </p>
          </div>
          <p className="text-lg lg:text-3xl mt-4 lg:mt-6 opacity-80 font-medium">
            Games: <span className="font-bold">{state.gamesA}</span>
          </p>
          {state.server === "a" && (
            <p className="text-sm lg:text-lg mt-2 lg:mt-3 opacity-80">
              Serving from {state.serveSide === "R" ? "Right" : "Left"}
            </p>
          )}
        </div>

        {/* Player B */}
        <div className={`rounded-2xl p-6 lg:p-12 flex flex-col items-center justify-center bg-secondary text-secondary-foreground transition-all ${winB ? "ring-8 ring-[hsl(var(--win))]" : ""}`}>
          <p className="text-2xl lg:text-5xl font-heading font-bold text-center mb-1 lg:mb-3 truncate max-w-full">
            {state.playerBName}
          </p>
          {state.playerBNumber && (
            <p className="text-sm lg:text-lg opacity-70 mb-2 lg:mb-4">#{state.playerBNumber}</p>
          )}
          <div className="flex items-baseline gap-3 lg:gap-5">
            <p className="text-[10rem] lg:text-[18rem] font-heading font-black tabular-nums leading-none">
              {state.scoreB}
            </p>
            {state.server === "b" && (
              <span className="text-2xl lg:text-5xl font-bold text-[hsl(var(--accent))] animate-pulse">●</span>
            )}
          </div>
          <p className="text-lg lg:text-3xl mt-4 lg:mt-6 opacity-80 font-medium">
            Games: <span className="font-bold">{state.gamesB}</span>
          </p>
          {state.server === "b" && (
            <p className="text-sm lg:text-lg mt-2 lg:mt-3 opacity-80">
              Serving from {state.serveSide === "R" ? "Right" : "Left"}
            </p>
          )}
        </div>
      </div>

      {/* Completed games */}
      {state.completedGames.length > 0 && (
        <div className="flex items-center justify-center gap-2 lg:gap-4 mt-4 lg:mt-6 flex-wrap">
          {state.completedGames.map((g, i) => (
            <div key={i} className="px-3 py-1.5 lg:px-5 lg:py-2 bg-muted rounded-lg text-sm lg:text-xl font-mono tabular-nums">
              <span className="text-muted-foreground mr-2">G{i + 1}</span>
              <span className="font-bold">{g.a}-{g.b}</span>
            </div>
          ))}
        </div>
      )}

      {/* Match over banner */}
      {state.matchOver && state.matchWinner && (
        <div className="mt-4 lg:mt-6 text-center">
          <p className="text-3xl lg:text-6xl font-heading font-bold text-[hsl(var(--win))]">
            {state.matchWinner === "a" ? state.playerAName : state.playerBName} wins!
          </p>
        </div>
      )}
    </div>
  );
}

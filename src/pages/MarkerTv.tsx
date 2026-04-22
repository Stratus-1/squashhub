import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { MarkerCastState } from "@/hooks/use-marker-cast";
import { Tv, WifiOff, Circle } from "lucide-react";
import { SEO } from "@/components/SEO";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ============================================================
// Live scoreboard view (shared by all 3 entry modes)
// ============================================================
function LiveScoreboard({ state }: { state: MarkerCastState }) {
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
          {state.courtNumber && (
            <span className="text-sm lg:text-lg px-2 py-0.5 rounded bg-muted text-foreground/80 ml-2">
              Court {state.courtNumber}
            </span>
          )}
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

// Keep TV awake
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let wakeLock: any = null;
    (async () => {
      try {
        // @ts-ignore
        wakeLock = await navigator.wakeLock?.request("screen");
      } catch { /* unsupported */ }
    })();
    return () => { try { wakeLock?.release(); } catch { /* noop */ } };
  }, [active]);
}

// ============================================================
// Mode 1: Pair-code entry (legacy /tv and /tv/:code)
// ============================================================
function PairCodeMode({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode?.toUpperCase() || "");
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<MarkerCastState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
      await supabase
        .from("live_marker_sessions" as any)
        .update({ paired_at: new Date().toISOString() })
        .eq("id", row.id);
      const ch = supabase
        .channel(`tv-session-${row.id}`)
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "live_marker_sessions", filter: `id=eq.${row.id}` },
          (payload) => {
            const newRow = payload.new as { state: any };
            if (newRow.state) setState(newRow.state as MarkerCastState);
          })
        .on("postgres_changes",
          { event: "DELETE", schema: "public", table: "live_marker_sessions", filter: `id=eq.${row.id}` },
          () => {
            setError("The marker has ended this cast session.");
            setSessionId(null);
            setState(null);
          })
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

  useWakeLock(!!sessionId);

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

  if (!state) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Waiting for match data…</p>
      </div>
    );
  }

  return <LiveScoreboard state={state} />;
}

// ============================================================
// Mode 2: Court picker — /tv/club/:subdomain
// ============================================================
interface SessionRow {
  id: string;
  court_number: string | null;
  state: any;
  expires_at: string;
}

function CourtPickerMode({ subdomain }: { subdomain: string }) {
  const [clubId, setClubId] = useState<string | null>(null);
  const [clubName, setClubName] = useState<string>("");
  const [clubLogo, setClubLogo] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Resolve club
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("clubs")
        .select("id, name, logo_url")
        .eq("subdomain", subdomain.toLowerCase())
        .maybeSingle();
      if (cancelled) return;
      if (err || !data) {
        setError(`Club "${subdomain}" not found.`);
        return;
      }
      setClubId(data.id);
      setClubName(data.name || subdomain);
      setClubLogo(data.logo_url);
    })();
    return () => { cancelled = true; };
  }, [subdomain]);

  // Subscribe to all sessions for this club
  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    const refresh = async () => {
      const { data } = await supabase
        .from("live_marker_sessions" as any)
        .select("id, court_number, state, expires_at")
        .eq("club_id", clubId)
        .gt("expires_at", new Date().toISOString())
        .order("court_number", { ascending: true });
      if (cancelled) return;
      setSessions((data as unknown as SessionRow[]) || []);
    };
    refresh();
    const ch = supabase
      .channel(`tv-picker-${clubId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "live_marker_sessions", filter: `club_id=eq.${clubId}` },
        () => refresh())
      .subscribe();
    channelRef.current = ch;
    const interval = window.setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [clubId]);

  useWakeLock(true);

  // If user picked one, render the live view by piping its state
  if (selectedId) {
    return <SubscribedLiveView sessionId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <SEO title="TV View | SquashHub" description="Live court scoreboard" />
        <div className="text-center text-muted-foreground">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background p-6 lg:p-10">
      <SEO title={`${clubName} — Live Courts | TV`} description="Live courts at the club" />
      <div className="flex items-center gap-3 mb-8">
        {clubLogo && <img src={clubLogo} alt="" className="h-10 lg:h-14 w-auto" />}
        <div>
          <h1 className="text-2xl lg:text-4xl font-heading font-bold">{clubName}</h1>
          <p className="text-sm lg:text-base text-muted-foreground">Live courts</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Tv className="w-16 h-16 text-muted-foreground/40 mb-4" />
          <p className="text-xl lg:text-2xl text-muted-foreground">No live matches right now</p>
          <p className="text-sm text-muted-foreground/70 mt-2">Courts will appear here as soon as a marker starts scoring.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {sessions.map((s) => {
            const st = s.state as MarkerCastState | null;
            const hasMatch = st && (st.playerAName || st.playerBName);
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className="text-left rounded-2xl border-2 border-border hover:border-primary transition-all p-5 lg:p-6 bg-card hover:bg-muted/30 active:scale-[0.98]"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Circle className="w-2.5 h-2.5 fill-[hsl(var(--win))] text-[hsl(var(--win))] animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--win))]">Live</span>
                  <span className="ml-auto text-base lg:text-lg font-heading font-bold">
                    {s.court_number ? `Court ${s.court_number}` : "Unmarked court"}
                  </span>
                </div>
                {hasMatch ? (
                  <>
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                      <p className="text-base lg:text-lg font-medium truncate">{st.playerAName}</p>
                      <p className="text-3xl lg:text-4xl font-heading font-black tabular-nums px-2">
                        {st.scoreA}<span className="text-muted-foreground">-</span>{st.scoreB}
                      </p>
                      <p className="text-base lg:text-lg font-medium truncate text-right">{st.playerBName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Games {st.gamesA}-{st.gamesB} · {formatDuration(st.elapsed)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Setting up…</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Mode 3: Fixed court — /tv/club/:subdomain/court/:court
// Auto-subscribes to whichever live session matches
// ============================================================
function FixedCourtMode({ subdomain, court }: { subdomain: string; court: string }) {
  const [clubId, setClubId] = useState<string | null>(null);
  const [clubName, setClubName] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Resolve club
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("clubs")
        .select("id, name")
        .eq("subdomain", subdomain.toLowerCase())
        .maybeSingle();
      if (cancelled) return;
      if (err || !data) {
        setError(`Club "${subdomain}" not found.`);
        return;
      }
      setClubId(data.id);
      setClubName(data.name || subdomain);
    })();
    return () => { cancelled = true; };
  }, [subdomain]);

  // Find/poll the live session for this court
  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    const findSession = async () => {
      const { data } = await supabase
        .from("live_marker_sessions" as any)
        .select("id")
        .eq("club_id", clubId)
        .eq("court_number", court)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const row = data as unknown as { id: string } | null;
      setSessionId(row?.id ?? null);
    };
    findSession();
    const ch = supabase
      .channel(`tv-court-${clubId}-${court}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "live_marker_sessions", filter: `club_id=eq.${clubId}` },
        () => findSession())
      .subscribe();
    channelRef.current = ch;
    const interval = window.setInterval(findSession, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [clubId, court]);

  useWakeLock(true);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <SEO title="TV View | SquashHub" description="Live court scoreboard" />
        <div className="text-center text-muted-foreground">{error}</div>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center">
        <SEO title={`Court ${court} — ${clubName} | TV`} description="Waiting for the next match" />
        <Tv className="w-24 h-24 text-muted-foreground/30 mb-6" />
        <h1 className="text-4xl lg:text-6xl font-heading font-bold mb-2">Court {court}</h1>
        <p className="text-lg lg:text-2xl text-muted-foreground">{clubName}</p>
        <p className="text-base text-muted-foreground/70 mt-6">Waiting for a marker to start a match…</p>
      </div>
    );
  }

  return <SubscribedLiveView sessionId={sessionId} />;
}

// ============================================================
// Subscribes to a single session and renders the scoreboard
// (used by picker after selection, and by fixed-court view)
// ============================================================
function SubscribedLiveView({ sessionId, onBack }: { sessionId: string; onBack?: () => void }) {
  const [state, setState] = useState<MarkerCastState | null>(null);
  const [ended, setEnded] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("live_marker_sessions" as any)
        .select("state")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as unknown as { state: any } | null;
      setState((row?.state as MarkerCastState) || null);
    })();

    const ch = supabase
      .channel(`tv-live-${sessionId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_marker_sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const newRow = payload.new as { state: any };
          if (newRow.state) setState(newRow.state as MarkerCastState);
        })
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "live_marker_sessions", filter: `id=eq.${sessionId}` },
        () => setEnded(true))
      .subscribe();
    channelRef.current = ch;
    return () => {
      cancelled = true;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [sessionId]);

  if (ended) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
        <SEO title="Match ended | TV" description="" />
        <p className="text-2xl lg:text-4xl font-heading font-bold">Match ended</p>
        {onBack && (
          <button onClick={onBack} className="mt-4 px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">
            Back to courts
          </button>
        )}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Waiting for match data…</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <LiveScoreboard state={state} />
      {onBack && (
        <button
          onClick={onBack}
          className="fixed top-4 right-4 px-3 py-1.5 text-xs bg-background/80 backdrop-blur rounded-lg border hover:bg-muted"
        >
          ← Courts
        </button>
      )}
    </div>
  );
}

// ============================================================
// Main router for /tv/* routes
// ============================================================
export default function MarkerTv() {
  const params = useParams<{ code?: string; subdomain?: string; court?: string }>();

  if (params.subdomain && params.court) {
    return <FixedCourtMode subdomain={params.subdomain} court={params.court} />;
  }
  if (params.subdomain) {
    return <CourtPickerMode subdomain={params.subdomain} />;
  }
  return <PairCodeMode initialCode={params.code} />;
}

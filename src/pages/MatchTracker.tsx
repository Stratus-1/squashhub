import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useIntegrations } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Play, Square, ExternalLink, Link2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

type BookingRow = {
  id: string;
  user_id: string;
  court_id: number;
  date: string;
  start_time: string;
  end_time: string;
};

type GameSessionRow = {
  id: string;
  user_id: string;
  booking_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  strava_activity_id: number | null;
  strava_name: string | null;
  strava_sport_type: string | null;
  strava_start_date: string | null;
  strava_distance_m: number | null;
  strava_moving_time_s: number | null;
  strava_elevation_m: number | null;
};

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type: string | null;
  start_date: string;
  start_date_local: string | null;
  distance: number;
  moving_time: number;
  elapsed_time: number | null;
  total_elevation_gain: number;
};

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}h ${mm}m ${ss}s`;
  if (mm > 0) return `${mm}m ${ss}s`;
  return `${ss}s`;
}

export default function MatchTracker() {
  const navigate = useNavigate();
  const { bookingId } = useParams();
  const { user } = useAuth();
  const { data: integrations } = useIntegrations();
  const stravaConnected = useMemo(
    () => !!integrations?.find((i) => i.provider === "strava"),
    [integrations]
  );

  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [session, setSession] = useState<GameSessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tickingSeconds, setTickingSeconds] = useState<number>(0);
  const [finding, setFinding] = useState(false);
  const [recent, setRecent] = useState<StravaActivity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);

  const tickInterval = useRef<number | null>(null);

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()?.replace(/\/+$/, "");
  const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

  useEffect(() => {
    const run = async () => {
      try {
        if (!bookingId) throw new Error("Missing booking id");
        if (!user) throw new Error("You must be logged in");

        const { data: bookingRow, error: bookingError } = await supabase
          .from("bookings")
          .select("id,user_id,court_id,date,start_time,end_time")
          .eq("id", bookingId)
          .single();
        if (bookingError) throw bookingError;
        const b = bookingRow as unknown as BookingRow;
        if (b.user_id !== user.id) throw new Error("You can only track your own booking");
        setBooking(b);

        const { data: sessionRows, error: sessionError } = await supabase
          .from("game_sessions")
          .select("*")
          .eq("booking_id", bookingId)
          .eq("user_id", user.id)
          .order("started_at", { ascending: false })
          .limit(1);
        if (sessionError) throw sessionError;
        const s = (sessionRows?.[0] as unknown as GameSessionRow) || null;
        setSession(s);
      } catch (e: any) {
        toast.error(e.message || "Failed to load match tracker");
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [bookingId, navigate, user]);

  useEffect(() => {
    if (tickInterval.current) {
      window.clearInterval(tickInterval.current);
      tickInterval.current = null;
    }

    if (!session || session.ended_at) return;
    const startedAtMs = new Date(session.started_at).getTime();
    const tick = () => setTickingSeconds(Math.floor((Date.now() - startedAtMs) / 1000));
    tick();
    tickInterval.current = window.setInterval(tick, 1000);
    return () => {
      if (tickInterval.current) window.clearInterval(tickInterval.current);
      tickInterval.current = null;
    };
  }, [session?.id, session?.ended_at, session?.started_at]);

  const durationSeconds = useMemo(() => {
    if (!session) return 0;
    if (!session.ended_at) return tickingSeconds;
    if (typeof session.duration_s === "number") return session.duration_s;
    const start = new Date(session.started_at).getTime();
    const end = new Date(session.ended_at).getTime();
    return Math.max(0, Math.floor((end - start) / 1000));
  }, [session, tickingSeconds]);

  const canStart = !session || !!session.ended_at;
  const canStop = !!session && !session.ended_at;

  const attachable = useMemo(() => {
    if (!session?.ended_at) return false;
    return stravaConnected;
  }, [session?.ended_at, stravaConnected]);

  const bestSuggestedActivityId = useMemo(() => {
    if (!session?.ended_at || recent.length === 0) return null;
    const startMs = new Date(session.started_at).getTime();
    const maxWindowMs = 6 * 60 * 60 * 1000;
    let best: { id: number; score: number } | null = null;
    for (const a of recent) {
      const aStart = new Date(a.start_date).getTime();
      const dt = Math.abs(aStart - startMs);
      if (!Number.isFinite(dt) || dt > maxWindowMs) continue;
      const durationDt = session.duration_s ? Math.abs(a.moving_time - session.duration_s) : 0;
      const score = dt + durationDt * 1000;
      if (!best || score < best.score) best = { id: a.id, score };
    }
    return best?.id ?? null;
  }, [recent, session?.duration_s, session?.ended_at, session?.started_at]);

  useEffect(() => {
    if (!selectedActivityId && bestSuggestedActivityId) {
      setSelectedActivityId(bestSuggestedActivityId);
    }
  }, [bestSuggestedActivityId, selectedActivityId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) return null;

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Match Tracker" subtitle={`Court ${booking.court_id} · ${booking.date}`} />

      <div className="px-4 mt-3 space-y-3 mb-4">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold font-heading">Session</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Start & stop a timer here. If you want it in Strava, record it in the Strava app/device and attach it after.
              </p>
            </div>
            <Badge variant="secondary" className="text-xs shrink-0">
              {booking.start_time?.slice(0, 5)} - {booking.end_time?.slice(0, 5)}
            </Badge>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Elapsed</p>
              <p className="text-2xl font-bold font-heading tabular-nums">{formatDuration(durationSeconds)}</p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <Button
                disabled={!canStart}
                onClick={async () => {
                  try {
                    if (!user) throw new Error("You must be logged in");
                    const startedAt = new Date().toISOString();
                    const { data, error } = await supabase
                      .from("game_sessions")
                      .insert({
                        user_id: user.id,
                        booking_id: booking.id,
                        started_at: startedAt,
                      })
                      .select("*")
                      .single();
                    if (error) throw error;
                    setSession(data as unknown as GameSessionRow);
                    setRecent([]);
                    setSelectedActivityId(null);
                    toast.success("Tracking started");
                  } catch (e: any) {
                    toast.error(e.message || "Failed to start tracking");
                  }
                }}
              >
                <Play className="w-4 h-4 mr-2" />
                Start
              </Button>
              <Button
                variant="outline"
                disabled={!canStop}
                onClick={async () => {
                  try {
                    if (!session) return;
                    const endedAt = new Date().toISOString();
                    const startedAtMs = new Date(session.started_at).getTime();
                    const duration = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
                    const { data, error } = await supabase
                      .from("game_sessions")
                      .update({ ended_at: endedAt, duration_s: duration })
                      .eq("id", session.id)
                      .select("*")
                      .single();
                    if (error) throw error;
                    setSession(data as unknown as GameSessionRow);
                    toast.success("Tracking stopped");
                  } catch (e: any) {
                    toast.error(e.message || "Failed to stop tracking");
                  }
                }}
              >
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
            </div>
          </div>

          {stravaConnected && (
            <div className="mt-3">
              <Button
                variant="secondary"
                className="w-full"
                onClick={async () => {
                  try {
                    window.open("https://www.strava.com/", "_blank", "noopener,noreferrer");
                  } catch {
                    // ignore
                  }
                }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Strava
              </Button>
            </div>
          )}
        </Card>

        {session?.ended_at && (
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold font-heading">Post-match</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Attach the matching Strava activity to this match.
                </p>
              </div>
              <Badge variant="secondary" className="text-xs shrink-0">
                Done
              </Badge>
            </div>

            {!attachable ? (
              <p className="text-sm text-muted-foreground mt-3">
                Connect Strava in your Profile to attach activity stats to this match.
              </p>
            ) : (
              <>
                <div className="mt-3">
                  <Button
                    className="w-full"
                    disabled={finding || !supabaseUrl || !supabaseKey}
                    onClick={async () => {
                      try {
                        if (!session) return;
                        setFinding(true);
                        const { data: sessionData } = await supabase.auth.getSession();
                        const accessToken = sessionData.session?.access_token;
                        if (!accessToken) throw new Error("You must be logged in");
                        if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL");
                        if (!supabaseKey) throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY");

                        const res = await fetch(`${supabaseUrl}/functions/v1/strava`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            apikey: supabaseKey,
                            Authorization: `Bearer ${accessToken}`,
                          },
                          body: JSON.stringify({ action: "recent" }),
                        });

                        const payload = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(payload?.error || "Failed to fetch recent activities");
                        setRecent((payload.activities || []) as StravaActivity[]);
                        toast.success("Fetched recent Strava activities");
                      } catch (e: any) {
                        toast.error(e.message || "Failed to fetch Strava activities");
                      } finally {
                        setFinding(false);
                      }
                    }}
                  >
                    {finding ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Finding activities…
                      </>
                    ) : (
                      <>
                        <Link2 className="w-4 h-4 mr-2" />
                        Find & attach activity
                      </>
                    )}
                  </Button>
                </div>

                {recent.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      {recent.slice(0, 5).map((a) => {
                        const isSelected = selectedActivityId === a.id;
                        const km = Math.round((a.distance / 1000) * 10) / 10;
                        const minutes = Math.round(a.moving_time / 60);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setSelectedActivityId(a.id)}
                            className={[
                              "w-full text-left rounded-md border p-3 transition-colors",
                              isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{a.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(a.start_date).toLocaleString()} · {a.sport_type || a.type}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold tabular-nums">{km} km</p>
                                <p className="text-xs text-muted-foreground tabular-nums">{minutes} min</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3">
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={!selectedActivityId || !session}
                        onClick={async () => {
                          try {
                            if (!session || !selectedActivityId) return;
                            const picked = recent.find((a) => a.id === selectedActivityId);
                            if (!picked) throw new Error("Please select an activity");
                            const { data, error } = await supabase
                              .from("game_sessions")
                              .update({
                                strava_activity_id: picked.id,
                                strava_name: picked.name,
                                strava_sport_type: picked.sport_type || picked.type,
                                strava_start_date: picked.start_date,
                                strava_distance_m: Math.round(picked.distance),
                                strava_moving_time_s: Math.round(picked.moving_time),
                                strava_elevation_m: Math.round(picked.total_elevation_gain),
                              })
                              .eq("id", session.id)
                              .select("*")
                              .single();
                            if (error) throw error;
                            setSession(data as unknown as GameSessionRow);
                            toast.success("Activity attached");
                          } catch (e: any) {
                            toast.error(e.message || "Failed to attach activity");
                          }
                        }}
                      >
                        Attach selected activity
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </Card>
        )}

        {session?.ended_at && (
          <Card className="p-4">
            <p className="text-sm font-semibold font-heading">Summary</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Match time</p>
                <p className="text-sm font-semibold">{formatDuration(durationSeconds)}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Strava</p>
                <p className="text-sm font-semibold">{session.strava_activity_id ? "Attached" : "—"}</p>
              </div>
              {session.strava_activity_id && (
                <>
                  <div className="rounded-md border p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Distance</p>
                    <p className="text-sm font-semibold">
                      {session.strava_distance_m != null ? `${Math.round((session.strava_distance_m / 1000) * 10) / 10} km` : "—"}
                    </p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Moving time</p>
                    <p className="text-sm font-semibold">
                      {session.strava_moving_time_s != null ? `${Math.round(session.strava_moving_time_s / 60)} min` : "—"}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/dashboard")}>
                Back to Dashboard
              </Button>
              <Button className="flex-1" onClick={() => navigate("/profile")}>
                View Profile
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}


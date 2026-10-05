/**
 * Public Match Day page (no login). Everything comes from the token-checked
 * `md_context` function; scores are saved through `md_save_*`, which re-check
 * the token, competition, court and lock state server-side. No admin actions.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  courtNowNext, upcoming, results, tournamentStandings, leagueStandings, type MatchDayMatch,
} from "@/lib/match-day/access";
import { validateQuickResult, buildQuickResultPayload } from "@/lib/tournaments/quick-result";

const rpc = (fn: string, args: any) => (supabase as any).rpc(fn, args);
const todayIso = () => new Date().toLocaleDateString("en-CA");

export default function MatchDay() {
  const { token = "", court: courtParam } = useParams();
  const [sp] = useSearchParams();
  const court = courtParam ? Number(courtParam) : null;
  const deepMatch = sp.get("match");
  const [ctx, setCtx] = useState<any>(null);
  const [scoring, setScoring] = useState<MatchDayMatch | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await rpc("md_context", { _token: token });
    if (error) { setCtx({ ok: false, reason: "error" }); return; }
    setCtx(data);
  }, [token]);

  useEffect(() => { void load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const matches: MatchDayMatch[] = ctx?.matches ?? [];
  const courtName = (id: number | null) => ctx?.courts?.find((c: any) => c.id === id)?.name || (id != null ? `Court ${id}` : "Court TBC");
  const today = todayIso();
  const open = !!ctx?.scoring_open;

  useEffect(() => {
    if (deepMatch && matches.length && !scoring) {
      const hit = matches.find((m) => m.id === deepMatch);
      if (hit?.scorable && open) setScoring(hit);
    }
  }, [deepMatch, matches, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => (court == null ? matches : matches.filter((m) => m.court_id === court)), [matches, court]);

  if (!ctx) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!ctx.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-foreground">This link is no longer active</h1>
          <p className="text-sm text-muted-foreground mt-1">Ask the organiser for the current Match Day QR code.</p>
        </div>
      </div>
    );
  }

  const nowNext = court != null ? courtNowNext(matches, court, today) : null;
  const standings = ctx.kind === "tournament" ? tournamentStandings(matches) : leagueStandings(matches);

  const Row = ({ m }: { m: MatchDayMatch }) => (
    <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted-foreground">
          {m.date ?? "Date TBC"}{m.time ? ` · ${String(m.time).slice(0, 5)}` : ""} · {courtName(m.court_id)}{m.stage ? ` · ${m.stage}` : m.division ? ` · ${m.division}` : ""}
        </div>
        <div className="text-sm font-medium text-foreground truncate">{m.side_a || "TBC"} <span className="text-muted-foreground">vs</span> {m.side_b || "TBC"}</div>
        {(m.score || m.totals) && (
          <div className="text-xs text-primary">{m.score || `${m.totals.home_games}–${m.totals.away_games} games`}</div>
        )}
      </div>
      {open && m.scorable && <Button size="sm" onClick={() => setScoring(m)}>Score</Button>}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{ctx.club_name} · Match Day</div>
          <h1 className="text-lg font-semibold text-foreground">{ctx.name}{court != null ? ` — ${courtName(court)}` : " — All courts"}</h1>
          {!open && <p className="text-xs text-muted-foreground">This competition has finished or not started yet — scoring is closed. Results and standings remain visible.</p>}
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4">
        <Tabs defaultValue={court != null ? "now" : "fixtures"}>
          <TabsList className="w-full flex-wrap h-auto">
            {court != null && <TabsTrigger value="now">Now / Next</TabsTrigger>}
            <TabsTrigger value="fixtures">Fixtures</TabsTrigger>
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
            <TabsTrigger value="standings">Standings</TabsTrigger>
          </TabsList>
          {nowNext && (
            <TabsContent value="now" className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">On court now</h2>
              {nowNext.current ? <Row m={nowNext.current} /> : <p className="text-sm text-muted-foreground">No match on this court right now.</p>}
              <h2 className="text-sm font-semibold text-foreground pt-2">Next</h2>
              {nowNext.next ? <Row m={nowNext.next} /> : <p className="text-sm text-muted-foreground">Nothing else scheduled.</p>}
            </TabsContent>
          )}
          <TabsContent value="fixtures" className="space-y-2">
            {upcoming(visible, today).map((m) => <Row key={m.id} m={m} />)}
            {!upcoming(visible, today).length && <p className="text-sm text-muted-foreground">No upcoming fixtures.</p>}
          </TabsContent>
          <TabsContent value="live" className="space-y-2">
            {visible.filter((m) => m.date === today && !["completed", "submitted"].includes(String(m.status))).map((m) => <Row key={m.id} m={m} />)}
            <p className="text-[11px] text-muted-foreground">Updates automatically every 20 seconds.</p>
          </TabsContent>
          <TabsContent value="results" className="space-y-2">
            {results(visible).map((m) => <Row key={m.id} m={m} />)}
            {!results(visible).length && <p className="text-sm text-muted-foreground">No results yet.</p>}
          </TabsContent>
          <TabsContent value="standings">
            {standings.length ? (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] text-muted-foreground"><th>Group</th><th>Name</th><th>P</th><th>W</th><th>L</th><th>Pts</th></tr></thead>
                <tbody>{standings.map((r) => (
                  <tr key={r.group + r.name} className="border-t border-border text-foreground"><td>{r.group}</td><td>{r.name}</td><td>{r.played}</td><td>{r.won}</td><td>{r.lost}</td><td>{r.points}</td></tr>
                ))}</tbody>
              </table>
            ) : <p className="text-sm text-muted-foreground">Standings appear once results are in.</p>}
          </TabsContent>
        </Tabs>
      </main>
      {scoring && (
        <ScoreDialog
          kind={ctx.kind}
          match={scoring}
          bestOf={ctx.settings?.best_of ?? 5}
          token={token}
          court={court}
          onClose={() => setScoring(null)}
          onSaved={() => { setScoring(null); void load(); }}
        />
      )}
    </div>
  );
}

function GameRows({ games, setGames, labels }: { games: Array<{ a: string; b: string }>; setGames: (g: any) => void; labels: [string, string] }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[11px] text-muted-foreground"><span className="truncate">{labels[0]}</span><span className="truncate">{labels[1]}</span><span /></div>
      {games.map((g, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input inputMode="numeric" value={g.a} onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
          <Input inputMode="numeric" value={g.b} onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))} />
          <Button size="icon" variant="ghost" onClick={() => setGames(games.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={() => setGames([...games, { a: "", b: "" }])}><Plus className="w-4 h-4 mr-1" />Add game</Button>
    </div>
  );
}

function ScoreDialog({ kind, match, bestOf, token, court, onClose, onSaved }: any) {
  const [games, setGames] = useState<Array<{ a: string; b: string }>>([{ a: "", b: "" }]);
  const [rubber, setRubber] = useState<number | null>(match.rubbers?.[0]?.position ?? null);
  const [busy, setBusy] = useState(false);
  const device = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const parsed = games.map((g) => ({ a: Number(g.a), b: Number(g.b) }));

  const save = async () => {
    setBusy(true);
    try {
      if (kind === "tournament") {
        const v = validateQuickResult(parsed, bestOf);
        if (!v.valid) throw new Error(v.error);
        const p = buildQuickResultPayload(parsed, bestOf);
        const { error } = await rpc("md_save_tournament_result", {
          _token: token, _court: court, _match_id: match.id, _score: p.score, _game_scores: p.gameScores, _winner_side: p.winner, _device: device,
        });
        if (error) throw error;
      } else {
        if (rubber == null) throw new Error("Choose a game");
        const { error } = await rpc("md_save_league_rubber", {
          _token: token, _court: court, _fixture_id: match.id, _position: rubber,
          _game_scores: parsed.map((g) => ({ home: g.a, away: g.b })), _device: device,
        });
        if (error) throw error;
      }
      toast.success("Score saved");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Could not save the score");
    } finally {
      setBusy(false);
    }
  };

  const sel = match.rubbers?.find((r: any) => r.position === rubber);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{match.side_a} vs {match.side_b}</DialogTitle></DialogHeader>
        {kind === "league_season" && (
          match.rubbers?.length ? (
            <div className="flex flex-wrap gap-1">
              {match.rubbers.map((r: any) => (
                <Button key={r.position} size="sm" variant={r.position === rubber ? "default" : "secondary"} onClick={() => setRubber(r.position)}>
                  Game {r.position}{r.winner ? " ✓" : ""}
                </Button>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">The captains must set the line-up in the app before games can be scored.</p>
        )}
        <GameRows
          games={games}
          setGames={setGames}
          labels={kind === "tournament" ? [match.side_a, match.side_b] : [sel?.home || "Home", sel?.away || "Away"]}
        />
        <p className="text-[11px] text-muted-foreground">Saved as “Match Day Access{court != null ? ` (Court ${court})` : ""}”.</p>
        <Button onClick={save} disabled={busy || (kind === "league_season" && !match.rubbers?.length)}>
          {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save score
        </Button>
      </DialogContent>
    </Dialog>
  );
}

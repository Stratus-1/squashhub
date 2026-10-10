import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fromExt } from "@/lib/supabase-ext";
import { structuredMatchups } from "@/lib/tournaments/structured-matchups";
import {
  decidingByCategory, defaultStandingsAwards, OUTCOME_LABEL, type CategoryDeciding, readStandingsAwards, type ChampionshipOutcome, type StandingsAwards,
} from "@/lib/tournaments/standings-outcome";

/**
 * Standings & awards — what the Standings page declares at the end. Saved on the tournament
 * (`beta_lifecycle.standings_awards`); nothing changes for tournaments that never save it.
 * The winner source stays the tournament's own progression (final / playoffs / last-stage table).
 */
export function StandingsAwardsSection({ tournamentId, onSaved }: { tournamentId: string; onSaved?: () => void }) {
  const [cfg, setCfg] = useState<StandingsAwards | null>(null);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<"completed" | "running" | null>(null);
  const [deciding, setDeciding] = useState<CategoryDeciding[]>([]);

  useEffect(() => {
    void (async () => {
      const { data } = await fromExt("tournaments").select("beta_lifecycle, builder_spec, builder_architecture, match_type, status").eq("id", tournamentId).maybeSingle();
      const t: any = data ?? {};
      const existing = readStandingsAwards(t.beta_lifecycle);
      setSaved(!!existing);
      const doubles = (t.builder_spec?.divisions ?? []).some((d: any) => d?.unit === "pairs") || t.match_type === "doubles";
      const { count } = await fromExt("club_champs_matches").select("id", { count: "exact", head: true })
        .eq("champ_id", tournamentId).eq("status", "completed");
      const st = String(t.status ?? "").toLowerCase();
      setLive(st === "completed" ? "completed" : (count ?? 0) > 0 ? "running" : null);
      const dec = t.builder_architecture === "structured" ? decidingByCategory(t.builder_spec, t.beta_lifecycle?.format_plan?.stages) : [];
      setDeciding(dec);
      const swissOnly = dec.length > 0 && dec.every((d) => d.kind === "swiss");
      const betweenGroups = structuredMatchups(t.builder_spec).length > 0;
      const def = defaultStandingsAwards({ doubles, betweenGroups, swissOnly });
      setCfg(existing ?? def);
      // Smart default for Swiss-only events that never saved awards (never overwrites a saved choice).
      if (!existing && swissOnly && !betweenGroups) {
        const { error } = await fromExt("tournaments").update({ beta_lifecycle: { ...(t.beta_lifecycle ?? {}), standings_awards: def } } as any).eq("id", tournamentId);
        if (!error) setSaved(true);
      }
    })();
  }, [tournamentId]);

  const save = async (next: StandingsAwards) => {
    if (live && !window.confirm(standingsChangeWarning(live))) return;
    setCfg(next);
    const { data } = await fromExt("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle();
    const bl: any = (data as any)?.beta_lifecycle ?? {};
    const { error } = await fromExt("tournaments").update({ beta_lifecycle: { ...bl, standings_awards: next } } as any).eq("id", tournamentId);
    if (error) toast.error(`Standings & awards not saved: ${error.message}`); else { setSaved(true); onSaved?.(); }
  };

  if (!cfg) return null;
  const set = (patch: Partial<StandingsAwards>) => void save({ ...cfg, ...patch });
  const opts: Array<[keyof StandingsAwards, string, boolean]> = [
    ["champion", cfg.outcome === "team" ? "Team winner" : "Champion / Winner", cfg.outcome !== "none"],
    ["runnerUp", "Runner-up", cfg.outcome !== "none"],
    ["topScorer", "Top points scorer", true],
    ["woodenSpoon", "Wooden Spoon", true],
    ["finalPositions", "Final positions / ranking", true],
  ];
  return (
    <div className="rounded border border-border p-2 text-xs space-y-2" data-testid="standings-awards">
      <button type="button" className="flex w-full items-center justify-between font-medium" onClick={() => setOpen((v) => !v)}>
        <span>Standings &amp; awards</span>
        <span className="text-muted-foreground font-normal">{saved ? `${OUTCOME_LABEL[cfg.outcome]}` : "Not set — current behaviour"} · {open ? "Hide" : "Edit"}</span>
      </button>
      {open && <>
        <label className="flex flex-wrap items-center gap-2">Championship outcome
          <select className="rounded border border-border bg-background px-1 py-0.5" value={cfg.outcome}
            onChange={(e) => set({ outcome: e.target.value as ChampionshipOutcome })}>
            {(Object.keys(OUTCOME_LABEL) as ChampionshipOutcome[]).map((k) => <option key={k} value={k}>{OUTCOME_LABEL[k]}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          {opts.filter(([, , show]) => show).map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-1">
              <input type="checkbox" checked={!!cfg[k]} onChange={(e) => set({ [k]: e.target.checked } as any)} />{label}
            </label>
          ))}
        </div>
        {deciding.some((d) => d.kind !== "other") && (
          <ul className="space-y-0.5 rounded bg-muted/40 p-1.5" data-testid="awards-deciding">
            {deciding.filter((d) => d.kind !== "other").map((d) => (
              <li key={d.label}><b>{d.label}:</b> {d.kind === "swiss"
                ? `winner, runner-up and positions 1–N come from the final Swiss standings (match points, then tie-breaks) after all ${d.swissRounds ?? ""} rounds — shown as "Current leader" until then.`
                : "winner and runner-up come from the play-off final; Swiss standings only decide who qualifies."}</li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground">Who wins comes from how this tournament is decided (final match, play-offs or final standings). Wooden Spoon and Top scorer are only awarded once all games are complete; before that the top scorer shows as current leader.</p>
      </>}
    </div>
  );
}

/** Confirmation text when awards change on a tournament with results already in. */
export function standingsChangeWarning(live: "completed" | "running"): string {
  return live === "completed"
    ? "This tournament is completed. Changing Standings & awards changes which winners and awards are shown on its results. Continue?"
    : "Results have already been entered. Changing Standings & awards changes the winners and awards shown on the standings. Continue?";
}

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fromExt } from "@/lib/supabase-ext";
import {
  findStep, loadPlanSteps, loadTimedContext, planTimedSchedule, prefsApplicable, scheduleTimedRounds, timedGameFromRow, type TimedContext, type TimedGame,
} from "@/lib/tournaments/formal-stage-schedule";
import {
  COURT_LABEL, DEFAULT_SCHEDULING_PREFS, prefsActive, prefUnitKey, REST_LABEL, weekdayOf, type CategoryCourtRule, type CourtPref, type RestPref, type SchedulingPrefs,
} from "@/lib/tournaments/scheduling-prefs";

const TERMINAL = ["completed", "forfeited", "walkover", "cancelled", "in_progress", "live", "confirmed"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtShort = (iso: string) => { const t = new Date(`${iso}T00:00:00`); return isNaN(+t) ? iso : t.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" }); };

/**
 * Scheduling preferences (Generate Draw & Fixtures). Controls HOW centrally allocated games use the
 * dates/windows/courts configured earlier. The feasibility line runs the SAME planner the allocation
 * uses (`planTimedSchedule`) and never writes fixtures.
 */
export function SchedulingPreferencesSection({ tournamentId, categories, previewGames, useSaved, onFeasible }: {
  tournamentId: string;
  categories: Array<{ group: number; label: string }>;
  /** Games Generate would create (dry run); used when no saved draw is being kept. */
  previewGames: TimedGame[];
  /** A saved, unplayed draw is being kept: plan its unplayed games instead. */
  useSaved: boolean;
  onFeasible?: (ok: boolean) => void;
}) {
  const [ctx, setCtx] = useState<TimedContext | null | undefined>(undefined);
  const [prefs, setPrefs] = useState<SchedulingPrefs>(DEFAULT_SCHEDULING_PREFS);
  const [saved, setSaved] = useState<TimedGame[]>([]);
  const [courtNames, setCourtNames] = useState<Map<number, string>>(new Map());
  const [applying, setApplying] = useState(false);

  const load = async () => {
    const c = await loadTimedContext(tournamentId).catch(() => null);
    setCtx(c);
    if (!c) return;
    setPrefs(c.prefs);
    const ids = [...new Set(c.days.flatMap((d) => d.courtIds))];
    if (ids.length) {
      const { data } = await fromExt("courts").select("id, name").in("id", ids);
      setCourtNames(new Map(((data ?? []) as any[]).map((r) => [Number(r.id), String(r.name ?? `Court ${r.id}`)])));
    }
    const steps = await loadPlanSteps(tournamentId).catch(() => []);
    const { data: rows } = await fromExt("club_champs_matches").select("id, round_number, group_number, bracket_position, status, winner_member_id, booking_id, stage_label, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id").eq("champ_id", tournamentId);
    setSaved(((rows ?? []) as any[]).filter((m) => !m.winner_member_id && !m.booking_id && !TERMINAL.includes(String(m.status ?? "").toLowerCase()) && m.player_a_member_id && m.player_b_member_id && !findStep(steps, String(m.stage_label ?? ""))).map((m) => timedGameFromRow(m, c.entryGroup)));
  };
  useEffect(() => { void load(); }, [tournamentId]);

  const save = async (next: SchedulingPrefs) => {
    setPrefs(next);
    try {
      const { data: t } = await fromExt("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle();
      const bl: any = (t as any)?.beta_lifecycle ?? {};
      const { error } = await fromExt("tournaments").update({ beta_lifecycle: { ...bl, scheduling_prefs: next } } as any).eq("id", tournamentId);
      if (error) throw error;
    } catch (e: any) { toast.error(`Scheduling preference not saved: ${e?.message ?? e}`); }
  };

  const games = useSaved ? saved : previewGames;
  const plan = useMemo(() => (ctx && ctx.days.length && games.length ? planTimedSchedule({ ...ctx, prefs }, games) : null), [ctx, prefs, games]);
  useEffect(() => { onFeasible?.(!plan || plan.issues.length === 0 || !prefsActive(prefs)); }, [plan, prefs]);

  if (ctx === undefined) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Checking scheduling…</div>;
  if (!ctx || !ctx.days.length) return (
    <div className="rounded border border-border p-2 text-xs text-muted-foreground" data-testid="scheduling-preferences">
      No scheduled sessions yet — set dates, times and courts for each round in Stages & scheduling (setup). Until then players book their own games by the play-by date.
    </div>
  );
  const applicable = prefsApplicable(ctx);
  const allCourts = [...new Set(ctx.days.flatMap((d) => d.courtIds))];
  const step = ctx.minutes;
  const own = (key: string) => prefs.categoryCourts.find((r) => r.key === key);
  const rule = (key: string): CategoryCourtRule => own(key) ?? { key, courtIds: [], rule: "preferred", weekdays: [] };
  const setRule = (key: string, patch: Partial<CategoryCourtRule>) => {
    const rest = prefs.categoryCourts.filter((r) => r.key !== key);
    void save({ ...prefs, categoryCourts: [...rest, { ...rule(key), ...patch }] });
  };
  const clearRule = (key: string) => void save({ ...prefs, categoryCourts: prefs.categoryCourts.filter((r) => r.key !== key) });
  const weekdays = [...new Set(ctx.days.map((d) => weekdayOf(d.date)))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  // Category rows, each followed by its subcategories (which inherit unless overridden).
  const rows: Array<{ key: string; label: string; sub: boolean }> = [];
  for (const c of categories) {
    const k = prefUnitKey(c.label); const parent = k.split("::")[0];
    if (!rows.some((r) => r.key === parent)) rows.push({ key: parent, label: parent, sub: false });
    if (k !== parent && !rows.some((r) => r.key === k)) rows.push({ key: k, label: k.split("::").slice(1).join(" › "), sub: true });
  }
  rows.sort((a, b) => a.key.split("::")[0].localeCompare(b.key.split("::")[0]) || Number(a.sub) - Number(b.sub) || a.key.localeCompare(b.key));
  const window = ctx.days.map((d) => `${fmtShort(d.date)} ${d.from}–${d.to}`).join("; ");

  return (
    <div className="space-y-2 rounded border border-border p-2" aria-label="Scheduling preferences" data-testid="scheduling-preferences">
      <div className="font-medium">Scheduling preferences</div>
      <p className="text-muted-foreground">How SquashHub places games on the dates, times and courts you set earlier. {ctx.bells ? `A bell slot here is ${step} minutes (from the Bells match format).` : `Standard format: about ${step} minutes per game.`} No player is ever on two courts at once.</p>
      {!applicable ? (
        <p className="text-muted-foreground">Not applicable: each round starts together at its bell, so rest and court rotation can't be adjusted here.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-0.5"><span className="text-muted-foreground">Rest between games</span>
            <select aria-label="Rest between games" className="w-full rounded border border-input bg-background p-1" value={prefs.rest} onChange={(e) => void save({ ...prefs, rest: e.target.value as RestPref })}>
              {(Object.keys(REST_LABEL) as RestPref[]).map((k) => <option key={k} value={k}>{REST_LABEL[k]}</option>)}
            </select></label>
          <label className="space-y-0.5"><span className="text-muted-foreground">Court allocation</span>
            <select aria-label="Court allocation" className="w-full rounded border border-input bg-background p-1" value={prefs.courts} onChange={(e) => void save({ ...prefs, courts: e.target.value as CourtPref })}>
              {(Object.keys(COURT_LABEL) as CourtPref[]).map((k) => <option key={k} value={k}>{COURT_LABEL[k]}</option>)}
            </select></label>
          {prefs.courts === "category" && (
            <div className="sm:col-span-2 space-y-1" aria-label="Courts by category">
              <div className="space-y-1">
                {rows.map((row) => {
                  const r = rule(row.key);
                  const inherit = row.sub && !own(row.key);
                  return (
                    <div key={row.key} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border p-1.5 ${row.sub ? "ml-4" : ""}`} data-testid={`pref-row-${row.key}`}>
                      <span className="min-w-[6rem] font-medium">{row.label}</span>
                      {inherit ? (
                        <>
                          <span className="text-muted-foreground">Same as {row.key.split("::")[0]}</span>
                          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { const p = own(row.key.split("::")[0]); setRule(row.key, { courtIds: p?.courtIds ?? [], weekdays: p?.weekdays ?? [], rule: p?.rule ?? "preferred" }); }}>Set own</Button>
                        </>
                      ) : (
                        <>
                          <span className="flex flex-wrap gap-1" aria-label={`${row.label} courts`}>{allCourts.map((id) => (
                            <label key={id} className="flex items-center gap-0.5"><input type="checkbox" aria-label={`${row.key} ${courtNames.get(id) ?? `Court ${id}`}`} checked={r.courtIds.includes(id)} onChange={(e) => setRule(row.key, { courtIds: e.target.checked ? [...r.courtIds, id] : r.courtIds.filter((x) => x !== id) })} />{courtNames.get(id) ?? `Court ${id}`}</label>
                          ))}</span>
                          <span className="flex flex-wrap gap-1" aria-label={`${row.label} evenings`}>{weekdays.map((d) => {
                            const on = (r.weekdays ?? []).includes(d);
                            return <button key={d} type="button" aria-pressed={on} aria-label={`${row.key} ${WD[d]}`} onClick={() => setRule(row.key, { weekdays: on ? (r.weekdays ?? []).filter((x) => x !== d) : [...(r.weekdays ?? []), d] })} className={`rounded border px-1.5 py-0.5 ${on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}>{WD[d]}</button>;
                          })}</span>
                          <select aria-label={`${row.key} court rule`} className="rounded border border-input bg-background p-0.5" value={r.rule} onChange={(e) => setRule(row.key, { rule: e.target.value as "preferred" | "only" })}>
                            <option value="preferred">Preferred</option><option value="only">Required</option>
                          </select>
                          {row.sub && <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => clearRule(row.key)}>Use category</Button>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-muted-foreground">Tick courts and/or evenings (weekdays of the planned dates, applied to every round). Preferred = used first, spills over when full; Required = never elsewhere. Leave blank for any court or evening. A court is only used on dates where it was selected.</p>
            </div>
          )}
        </div>
      )}
      {plan && (plan.issues.length === 0 ? (
        <p className="rounded bg-primary/10 p-1.5" data-testid="schedule-feasibility">
          <span className="font-medium">Schedule fits</span> — {plan.required} matches · {allCourts.length} court{allCourts.length === 1 ? "" : "s"} · {step}-minute slots · {window}. {plan.notes.join(" ")}
        </p>
      ) : (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-1.5" data-testid="schedule-feasibility">
          <span className="font-medium">Schedule needs attention</span> — {plan.issues.join(" ")}
        </div>
      ))}
      {useSaved && saved.length > 0 && plan && plan.issues.length === 0 && (
        <Button size="sm" variant="outline" disabled={applying} onClick={async () => {
          setApplying(true);
          try { const r = await scheduleTimedRounds(tournamentId); toast.success(`${r?.scheduled ?? 0} unplayed games re-timed with these preferences. Players were not messaged.`); }
          catch (e: any) { toast.error(String(e?.message ?? e)); } finally { setApplying(false); }
        }}>{applying && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Apply to unplayed games</Button>
      )}
    </div>
  );
}

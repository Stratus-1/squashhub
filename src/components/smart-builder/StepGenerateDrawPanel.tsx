import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { commitStructured, supabaseDb } from "@/lib/tournaments/structured-db";
import { atomically, generateStructuredTournament } from "@/lib/tournaments/structured-persist";
import {
  buildDrawSpec, divisionIssues, orderUnits, previewDraw, proposeFormat, readStepPlan, unitsFor,
  type DivFormat, type DrawDivision, type DrawKind, type DrawSeeding, type RegLite,
} from "@/lib/smart-builder/step-draw";

type Existing = { games: number; played: number };
const KIND_LABEL: Record<DrawKind, string> = { round_robin: "Round robin (everyone plays everyone)", pools: "Pools (round robin in each pool)", knockout: "Knockout", swiss: "Swiss rounds" };
const SEED_LABEL: Record<DrawSeeding, string> = { entry_order: "Entry order", random: "Random draw", ladder: "Club ladder" };

/**
 * Generate draw & fixtures (Step-by-Step Beta). Confirm final format → preview (real engine dry run) →
 * step_prepare_draw (current active entries, pairs intact) → existing structured engine generation.
 */
export function StepGenerateDrawPanel({ clubId, tournamentId, onGenerated, revisiting }: {
  clubId: string; tournamentId: string; revisiting: boolean; onGenerated: (info: { games: number }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ name: string; start: string | null; end: string | null } | null>(null);
  const [divs, setDivs] = useState<DrawDivision[]>([]);
  const [pairErrors, setPairErrors] = useState<string[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [ladder, setLadder] = useState<Map<string, number | null>>(new Map());
  const [baseUnits, setBaseUnits] = useState<DrawDivision["units"][]>([]);
  const [existing, setExisting] = useState<Existing>({ games: 0, played: 0 });
  const [seed] = useState(() => Date.now() % 2147483647);
  const [confirmed, setConfirmed] = useState(false);
  const [rebuildOk, setRebuildOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPairs, setShowPairs] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: regs }, { data: ms }] = await Promise.all([
      fromExt("tournaments").select("name, start_date, end_date, num_groups, group_labels, league_match_types").eq("id", tournamentId).maybeSingle(),
      fromExt("club_champs_registrations").select("club_member_id, partner_member_id, status, division_choices").eq("champ_id", tournamentId),
      fromExt("club_champs_matches").select("id, status, winner_member_id").eq("champ_id", tournamentId),
    ]);
    const tt = t as any;
    const games = (ms ?? []) as any[];
    setExisting({ games: games.length, played: games.filter((m) => m.winner_member_id || ["completed", "confirmed", "in_progress", "live", "walkover", "forfeit"].includes(String(m.status ?? "").toLowerCase())).length });
    setMeta({ name: tt?.name ?? "Tournament", start: tt?.start_date ?? null, end: tt?.end_date ?? null });
    const n = Math.max(1, Number(tt?.num_groups ?? 1));
    const plan = readStepPlan(clubId, tournamentId);
    const errs: string[] = [];
    const list: DrawDivision[] = [];
    const units: DrawDivision["units"][] = [];
    for (let g = 1; g <= n; g++) {
      const label = tt?.group_labels?.[String(g)] ?? `Division ${g}`;
      const doubles = tt?.league_match_types?.[String(g)] === "doubles";
      const r = unitsFor((regs ?? []) as RegLite[], g, n, doubles);
      errs.push(...r.errors.map((e) => `${label}: ${e}`));
      const p = proposeFormat(plan, label);
      units.push(r.units);
      list.push({ group: g, label, doubles, units: r.units, format: p.format, notes: p.notes, playoffs: p.playoffs });
    }
    const ids = [...new Set(((regs ?? []) as any[]).flatMap((r) => [r.club_member_id, r.partner_member_id]).filter(Boolean))];
    const { data: mem } = ids.length ? await supabase.from("club_members").select("id, name, ladder_position").in("id", ids) : { data: [] as any[] };
    setNames(new Map(((mem ?? []) as any[]).map((m) => [m.id, m.name ?? "Unknown"])));
    setLadder(new Map(((mem ?? []) as any[]).map((m) => [m.id, m.ladder_position ?? null])));
    setBaseUnits(units); setDivs(list); setPairErrors(errs); setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tournamentId]);

  // Seeded order follows the chosen seeding; the preview and the saved draw use the same order.
  const seeded = useMemo(() => divs.map((d, i) => ({ ...d, units: orderUnits(baseUnits[i] ?? [], d.format.seeding, { seed: seed + i, ladder }) })), [divs, baseUnits, ladder, seed]);
  const preview = useMemo(() => meta ? previewDraw(meta.name, seeded, { start: meta.start, end: meta.end }) : null, [meta, seeded]);
  const setFmt = (i: number, patch: Partial<DivFormat>) => { setConfirmed(false); setDivs((ds) => ds.map((d, k) => k === i ? { ...d, format: { ...d.format, ...patch } } : d)); };
  const nm = (id: string | null) => (id ? names.get(id) ?? "Unknown" : "");

  const errors = [...pairErrors, ...(preview?.errors ?? [])];
  const hasDraw = existing.games > 0;
  const canGenerate = !busy && confirmed && errors.length === 0 && (!hasDraw || (rebuildOk && existing.played === 0));

  const generate = async () => {
    if (!meta) return;
    setBusy(true);
    try {
      const version = `v${Date.now().toString(36)}`;
      const spec = buildDrawSpec(meta.name, seeded, version);
      const entries = seeded.flatMap((d) => d.units.map((u, k) => ({ member: u.member, partner: u.partner, group: d.group, order: k })));
      const { error } = await (supabase as any).rpc("step_prepare_draw", { p_champ_id: tournamentId, p_spec: spec, p_entries: entries, p_rebuild: hasDraw });
      if (error) throw new Error(error.message);
      const rows = await atomically(supabaseDb, tournamentId, commitStructured, (db) => generateStructuredTournament(db, tournamentId));
      const games = Array.isArray(rows) ? rows.filter((r: any) => r.player_a_member_id && r.player_b_member_id).length : preview?.total ?? 0;
      toast.success(`Draw saved — ${games} games created`);
      setConfirmed(false); setRebuildOk(false);
      await load();
      onGenerated({ games });
    } catch (e: any) {
      toast.error(String(e.message ?? e).replace(/^.*?(draw_exists|results_exist|pair_integrity|stale_entry):\s*/, ""));
      await load();
    } finally { setBusy(false); }
  };

  if (loading) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading current entries…</div>;

  return (
    <div className="space-y-3 text-xs">
      {hasDraw && (
        <div className="rounded border border-primary/50 bg-primary/10 p-2 space-y-1">
          <div className="font-medium">Draw saved · {existing.games} game{existing.games === 1 ? "" : "s"}{existing.played ? ` · ${existing.played} played or started` : " · none played yet"}</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild><Link to={`/club-champs/${tournamentId}`}>Open draw & fixtures<ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
            <Button size="sm" variant="outline" asChild><Link to={`/beta-tournament/${tournamentId}`}>Manage stages / play-offs</Link></Button>
          </div>
          <p className="text-muted-foreground">Results are entered on the draw page as usual. Play-off stages you planned are kept as "Define later" and are set up from Manage stages once the first stage finishes.</p>
        </div>
      )}

      <div className="font-medium">{hasDraw ? "Rebuild the draw (optional)" : "Confirm final format"} — using the {seeded.reduce((s, d) => s + d.units.length, 0)} current entries</div>
      <p className="text-muted-foreground">Only current active entries are used; replaced or withdrawn players are left out. Outstanding fees don't exclude anyone because entries here are confirmed without payment. Doubles pairs are kept exactly as you paired them.</p>

      {seeded.map((d, i) => {
        const issues = divisionIssues(d);
        const f = d.format;
        return (
          <div key={d.group} className="rounded border border-border p-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{d.label}</span>
              <button type="button" className="text-primary underline" onClick={() => setShowPairs(showPairs === i ? null : i)}>{d.units.length} {d.doubles ? "pairs" : "players"} · {showPairs === i ? "hide" : "show seeds"}</button>
            </div>
            {showPairs === i && <ol className="list-decimal pl-5">{d.units.map((u) => <li key={u.member}>{nm(u.member)}{u.partner ? ` & ${nm(u.partner)}` : ""}</li>)}</ol>}
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="space-y-0.5"><span className="text-muted-foreground">Format</span>
                <select className="w-full rounded border border-input bg-background p-1" value={f.kind ?? ""} onChange={(e) => setFmt(i, { kind: (e.target.value || null) as DrawKind | null })}>
                  <option value="">Choose…</option>{(Object.keys(KIND_LABEL) as DrawKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select></label>
              {f.kind === "pools" && <label className="space-y-0.5"><span className="text-muted-foreground">Number of pools</span><Input type="number" min={2} className="h-7" value={f.pools} onChange={(e) => setFmt(i, { pools: Number(e.target.value) || 1 })} /></label>}
              {f.kind === "swiss" && <label className="space-y-0.5"><span className="text-muted-foreground">Swiss rounds</span><Input type="number" min={1} className="h-7" value={f.swissRounds} onChange={(e) => setFmt(i, { swissRounds: Number(e.target.value) || 0 })} /></label>}
              <label className="space-y-0.5"><span className="text-muted-foreground">Seeding</span>
                <select className="w-full rounded border border-input bg-background p-1" value={f.seeding} onChange={(e) => setFmt(i, { seeding: e.target.value as DrawSeeding })}>
                  {(Object.keys(SEED_LABEL) as DrawSeeding[]).map((k) => <option key={k} value={k}>{SEED_LABEL[k]}</option>)}
                </select></label>
              <label className="space-y-0.5"><span className="text-muted-foreground">When games are played</span>
                <select className="w-full rounded border border-input bg-background p-1" value={f.schedule.rule ?? ""} onChange={(e) => setFmt(i, { schedule: { ...f.schedule, rule: (e.target.value || null) as any } })}>
                  <option value="">Choose…</option><option value="play_by">Play by a date (players arrange)</option><option value="fixed">Fixed match date(s)</option>
                </select></label>
              {f.schedule.rule === "play_by" && <label className="space-y-0.5"><span className="text-muted-foreground">Play by</span><Input type="date" className="h-7" value={f.schedule.deadline} onChange={(e) => setFmt(i, { schedule: { ...f.schedule, deadline: e.target.value } })} /></label>}
              {f.schedule.rule === "fixed" && <label className="space-y-0.5"><span className="text-muted-foreground">Round dates (comma-separated)</span><Input className="h-7" placeholder="2026-10-10, 2026-10-17" value={f.schedule.dates.join(", ")} onChange={(e) => setFmt(i, { schedule: { ...f.schedule, dates: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} /></label>}
            </div>
            {d.playoffs.length > 0 && <p className="text-muted-foreground">Planned play-offs: {d.playoffs.join(" → ")} — kept as "Define later", created after this stage finishes.</p>}
            {d.notes.map((n) => <p key={n} className="text-muted-foreground">• {n}</p>)}
            {issues.length > 0 && <p className="text-destructive">Fix: {issues.join(" · ")}</p>}
          </div>
        );
      })}

      {preview && errors.length === 0 && (
        <div className="rounded border border-border bg-muted/40 p-2">
          <div className="font-medium">Preview — {preview.total} games will be created</div>
          <ul className="mt-1 space-y-0.5">{preview.divisions.map((p) => (
            <li key={p.label}>{p.label}: {p.units} entries{p.pools > 1 ? ` in ${p.pools} pools` : ""} · {p.games} games over {p.rounds} round{p.rounds === 1 ? "" : "s"}{p.byes ? ` · ${p.byes} bye${p.byes === 1 ? "" : "s"}` : ""} · {p.schedule}</li>
          ))}</ul>
          <p className="mt-1 text-muted-foreground">No courts are booked and no court times are invented. Players are not messaged by this step.</p>
        </div>
      )}
      {errors.length > 0 && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-2">
          <div className="flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3" />Can't generate yet</div>
          <ul className="list-disc pl-4">{[...new Set(errors)].map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      {hasDraw && existing.played > 0 && <p className="text-destructive">Games have been played or started, so the draw can't be rebuilt here — results are protected. Use "Rebuild unplayed games" under Manage stages to drop withdrawn players' future games.</p>}
      {hasDraw && existing.played === 0 && (
        <label className="flex items-start gap-2"><Checkbox checked={rebuildOk} onCheckedChange={(v) => setRebuildOk(!!v)} />
          <span>Replace the existing draw: all {existing.games} unplayed games are deleted and a new draw is made from the current entries. No results are lost (none exist). Players who already saw their games should be told.</span></label>
      )}
      {!(hasDraw && existing.played > 0) && (
        <>
          <label className="flex items-start gap-2"><Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} /><span>I confirm this is the final format for these entries.</span></label>
          <Button disabled={!canGenerate} onClick={generate}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{hasDraw ? "Rebuild draw & fixtures" : "Generate draw & fixtures"}</Button>
        </>
      )}
      {revisiting && null}
    </div>
  );
}

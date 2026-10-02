import { notifyRoundDraw, roundNotifySummary } from "@/lib/tournaments/round-notify";
import { poolPlanOf, poolQualificationOf, reviewPools, sizesText, balancedSizes } from "@/lib/smart-builder/pool-plan";
import { useEffect, useMemo, useState } from "react";
import { setupConflicts } from "@/lib/smart-builder/consistency";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { commitStructured, supabaseDb } from "@/lib/tournaments/structured-db";
import { distributeIntoPools, moveToPool, normalisePoolAllocation, type PoolAllocationMode } from "@/lib/tournaments/pools";
import { venueBlocker } from "@/lib/tournaments/bookable-courts";
import { atomically, generateStructuredTournament } from "@/lib/tournaments/structured-persist";
import {
  divisionIssues, finalDrawSpec, formatWithPoolRule, unitParentOf, poolsFor, poolWarnings, unitId, orderUnits, previewDraw, proposeFormat, rankingIssue, readStepPlan, unitKeyOf, unitsFor,
  type DivFormat, type DivSchedule, type DrawDivision, type DrawKind, type DrawSeeding, type RegLite,
  crossSets,
} from "@/lib/smart-builder/step-draw";

type Existing = { games: number; played: number };
const KIND_LABEL: Record<DrawKind, string> = { round_robin: "Round robin (everyone plays everyone)", pools: "Pools (round robin in each pool)", knockout: "Knockout", swiss: "Swiss rounds", cross: "Cross-league round robin (groups play each other)" };
const SEED_LABEL: Record<DrawSeeding, string> = { entry_order: "Entry order", random: "Random draw", ladder: "Club ladder", ranking: "Use rankings" };

/**
 * Generate draw & fixtures (Step-by-Step Beta). Confirm final format → preview (real engine dry run) →
 * step_prepare_draw (current active entries, pairs intact) → existing structured engine generation.
 */
const fmtDay = (iso: string) => { const t = new Date(`${iso}T00:00:00`); return isNaN(+t) ? iso : t.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }); };

export function StepGenerateDrawPanel({ clubId, tournamentId, onGenerated, revisiting }: {
  clubId: string; tournamentId: string; revisiting: boolean; onGenerated: (info: { games: number }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [planConflicts, setPlanConflicts] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ name: string; start: string | null; end: string | null } | null>(null);
  const [divs, setDivs] = useState<DrawDivision[]>([]);
  const [pairErrors, setPairErrors] = useState<string[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [ladder, setLadder] = useState<Map<string, number | null>>(new Map());
  const [points, setPoints] = useState<Map<string, number | null>>(new Map());
  const [scope, setScope] = useState<string | null>(null);
  const [baseUnits, setBaseUnits] = useState<DrawDivision["units"][]>([]);
  const [existing, setExisting] = useState<Existing>({ games: 0, played: 0 });
  const [seed] = useState(() => Date.now() % 2147483647);
  const [confirmed, setConfirmed] = useState(false);
  const [notifyDraw, setNotifyDraw] = useState(true);
  const [rebuildOk, setRebuildOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPairs, setShowPairs] = useState<number | null>(null);
  /** Organiser edits per group: seed order and/or pools. These are what Generate saves — never recalculated away. */
  const [manual, setManual] = useState<Record<number, { order?: string[]; pools?: { ids: string[]; sizes: number[] } }>>({});
  const [poolMode, setPoolMode] = useState<PoolAllocationMode>("snake");
  const [dragId, setDragId] = useState<string | null>(null);
  const [venueErr, setVenueErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // Reconcile organiser-entered pairs first so the draw only ever sees current active entries.
    await (supabase as any).rpc("step_reconcile_admin_entrants", { p_champ_id: tournamentId }).then(() => undefined, () => undefined);
    // Regional/national events must name a host venue; owner or admin's club never implies one.
    const [{ data: kind }, { data: hosts }] = await Promise.all([
      (supabase as any).rpc("tournament_event_kind", { _champ: tournamentId }),
      (supabase as any).rpc("tournament_host_club_ids", { _champ: tournamentId }),
    ]);
    setVenueErr(venueBlocker(kind === "regional" ? "regional" : "club", (hosts as string[] | null) ?? []));
    const [{ data: t }, { data: regs }, { data: ms }] = await Promise.all([
      fromExt("tournaments").select("name, start_date, end_date, num_groups, group_labels, league_match_types, pool_allocation, beta_lifecycle").eq("id", tournamentId).maybeSingle(),
      fromExt("club_champs_registrations").select("club_member_id, partner_member_id, status, division_choices").eq("champ_id", tournamentId),
      fromExt("club_champs_matches").select("id, status, winner_member_id").eq("champ_id", tournamentId),
    ]);
    const tt = t as any;
    setPoolMode(normalisePoolAllocation(tt?.pool_allocation));
    const games = (ms ?? []) as any[];
    setExisting({ games: games.length, played: games.filter((m) => m.winner_member_id || ["completed", "confirmed", "in_progress", "live", "walkover", "forfeit"].includes(String(m.status ?? "").toLowerCase())).length });
    setMeta({ name: tt?.name ?? "Tournament", start: tt?.start_date ?? null, end: tt?.end_date ?? null });
    const n = Math.max(1, Number(tt?.num_groups ?? 1));
    // This device's answers when present, else the setup saved on the tournament (works on any device).
    if ((tt as any)?.beta_lifecycle?.draw_notify === false) setNotifyDraw(false);
    const plan = readStepPlan(clubId, tournamentId) ?? ((tt as any)?.beta_lifecycle?.format_plan ?? null);
    const errs: string[] = [];
    const list: DrawDivision[] = [];
    const units: DrawDivision["units"][] = [];
    const labels = Array.from({ length: n }, (_, k) => tt?.group_labels?.[String(k + 1)] ?? `Division ${k + 1}`);
    const groupOfKey = (key: string) => { const i = labels.findIndex((l) => unitKeyOf(l) === key || unitKeyOf(l).split("::")[0] === key); return i < 0 ? null : i + 1; };
    for (let g = 1; g <= n; g++) {
      const label = tt?.group_labels?.[String(g)] ?? `Division ${g}`;
      const doubles = tt?.league_match_types?.[String(g)] === "doubles";
      const r = unitsFor((regs ?? []) as RegLite[], g, n, doubles);
      errs.push(...r.errors.map((e) => `${label}: ${e}`));
      const p = proposeFormat(plan, label);
      units.push(r.units);
      const notes = [...p.notes];
      if (p.format.kind === "cross") {
        const gs = p.crossKeys.map(groupOfKey);
        if (gs.some((x) => x == null)) notes.push("Some cross-league groups in your plan no longer match a category here — check the groups below.");
        p.format.crossGroups = [...new Set(gs.filter((x): x is number => x != null))].sort((a, b) => a - b);
        if (p.crossByParent) {
          // "Between subcategories": only subcategories under the SAME parent category meet — never across parents.
          const me = g, parent = unitParentOf(label);
          const vs = labels.map((l, k) => k + 1).filter((k) => k !== me && unitParentOf(labels[k - 1]) === parent);
          if (!vs.length) notes.push(`"Between subcategories" is set, but ${parent} has no other subcategory here.`);
          p.format.crossVs = vs; p.format.crossGroups = vs.length ? [me, ...vs] : [];
        } else if (p.crossPairKeys) {
          // "Choose which groups play each other": only the organiser's pairings, nothing inferred.
          const me = g;
          const vs = p.crossPairKeys.map(([x, y]) => [groupOfKey(x), groupOfKey(y)]).filter(([x, y]) => x === me || y === me).map(([x, y]) => (x === me ? y : x));
          if (vs.some((x) => x == null)) notes.push("A cross-league pairing in your plan no longer matches a category here — check the pairings below.");
          p.format.crossVs = [...new Set(vs.filter((x): x is number => x != null && x !== me))].sort((a, b) => a - b);
          p.format.crossGroups = [me, ...p.format.crossVs].sort((a, b) => a - b);
        }
      }
      // Pool structure: a rule from setup, resolved here from the ACTUAL entrants (never earlier).
      const rule = poolPlanOf(plan, unitKeyOf(label));
      const review = reviewPools(rule, label.replace(/ · (Singles|Doubles)$/i, ""), r.units.length, doubles ? "pair" : "player");
      p.format = formatWithPoolRule(p.format, rule, r.units.length);
      list.push({ group: g, label, doubles, units: r.units, format: p.format, notes, playoffs: p.playoffs, playoffPlans: p.playoffPlans, poolReview: review.mode === "none" && !review.warnings.length ? null : review, poolAccepted: review.mode === "auto",
        poolQualifiers: (() => { const r = poolPlanOf(plan, unitKeyOf(label)); const q = poolQualificationOf(plan, unitKeyOf(label)); return r && r.mode !== "none" ? { perPool: Number(q.perPool) || null, runnersUp: Number(q.runnersUp) || 0 } : null; })() });
    }
    const ids = [...new Set(((regs ?? []) as any[]).flatMap((r) => [r.club_member_id, r.partner_member_id]).filter(Boolean))];
    const { data: mem } = ids.length ? await supabase.from("club_members").select("id, name, ladder_position, ranking_points").in("id", ids) : { data: [] as any[] };
    setPoints(new Map(((mem ?? []) as any[]).map((m) => [m.id, m.ranking_points ?? null])));
    setScope(plan?.scope ?? null);
    setPlanConflicts(setupConflicts(plan).map((c) => c.message));
    setNames(new Map(((mem ?? []) as any[]).map((m) => [m.id, m.name ?? "Unknown"])));
    setLadder(new Map(((mem ?? []) as any[]).map((m) => [m.id, m.ladder_position ?? null])));
    // Keep organiser edits only while the entries are unchanged; otherwise say so and start from the fresh entries.
    setManual((m) => {
      const kept: typeof m = {};
      let dropped = false;
      for (const [g, v] of Object.entries(m)) {
        const ids = new Set((units[Number(g) - 1] ?? []).map(unitId));
        const same = (xs?: string[]) => !xs || (xs.length === ids.size && xs.every((x) => ids.has(x)));
        if (same(v.order) && same(v.pools?.ids)) kept[Number(g)] = v; else dropped = true;
      }
      if (dropped) toast.warning("Entries changed, so your manual seed/pool changes for that category were reset.");
      return kept;
    });
    setBaseUnits(units); setDivs(list); setPairErrors(errs); setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tournamentId]);

  // Seeded order follows the chosen seeding; the preview and the saved draw use the same order.
  const seeded = useMemo(() => divs.map((d, i) => {
    const base = baseUnits[i] ?? [];
    const rk = d.format.seeding === "ranking" ? rankingIssue(base, scope, points) : null;
    let units = orderUnits(base, d.format.seeding, { seed: seed + i, ladder, points });
    const mo = manual[d.group]?.order;
    if (mo) { const by = new Map(units.map((u) => [unitId(u), u])); units = mo.map((id) => by.get(id)!).filter(Boolean); }
    return { ...d, blockers: [...(rk ? [rk] : []), ...planConflicts.map((m) => `Setup needs reconciling first (open the setup's Stages & scheduling step): ${m}`)], units, manualPools: d.format.kind === "pools" && manual[d.group]?.pools ? distributeIntoPools(manual[d.group]!.pools!.ids, d.format.pools, { manual: true, sizes: manual[d.group]!.pools!.sizes }) : null };
  }), [divs, baseUnits, ladder, points, scope, seed, manual, planConflicts]);
  const preview = useMemo(() => meta ? previewDraw(meta.name, seeded, { start: meta.start, end: meta.end }, "preview", poolMode) : null, [meta, seeded, poolMode]);
  const acceptPools = (is: number[]) => { setConfirmed(false); setDivs((ds) => ds.map((d, k) => is.includes(k) ? { ...d, poolAccepted: true } : d)); };
  const setSch = (i: number, patch: Partial<DivSchedule>) => setFmt(i, { schedule: { ...divs[i].format.schedule, ...patch } });
  const setFmt = (i: number, patch: Partial<DivFormat>) => {
    const g = divs[i]?.group;
    if (g != null && manual[g] && ("kind" in patch || "pools" in patch || "seeding" in patch)) {
      setManual((m) => { const n = { ...m }; delete n[g]; return n; });
      toast.info(`${divs[i].label}: format/seeding changed, so your manual seed and pool changes were reset.`);
    } setConfirmed(false); setDivs((ds) => ds.map((d, k) => k === i ? { ...d, format: { ...d.format, ...patch } } : d)); };
  /** Switch a cross group between "all selected play each other" and explicit pairings (seeded from its current opponents). */
  const setCrossMode = (i: number, mode: "all" | "chosen") => {
    const d = divs[i];
    if (mode === "all") { setFmt(i, { crossVs: null }); return; }
    const vs = d.format.crossGroups.filter((g) => g !== d.group);
    setFmt(i, { crossVs: vs, crossGroups: vs.length ? [d.group, ...vs].sort((a, b) => a - b) : [] });
  };
  /** Explicit pairing: set on both groups together so the pairing stays reciprocal. */
  const togglePairing = (i: number, other: number, on: boolean) => {
    const me = divs[i].group;
    setConfirmed(false);
    setDivs((ds) => ds.map((d) => {
      if (d.group !== me && d.group !== other) return d;
      const peer = d.group === me ? other : me;
      const cur = d.format.crossVs ?? d.format.crossGroups.filter((g) => g !== d.group);
      const vs = (on ? [...new Set([...cur, peer])] : cur.filter((g) => g !== peer)).sort((a, b) => a - b);
      return { ...d, format: { ...d.format, kind: d.format.kind ?? "cross", crossVs: vs, crossGroups: vs.length ? [d.group, ...vs].sort((a, b) => a - b) : [] } };
    }));
  };
  /** Other subcategories under the same parent category as this division. */
  const siblings = (d: DrawDivision) => divs.filter((o) => o.group !== d.group && unitParentOf(o.label) === unitParentOf(d.label)).map((o) => o.group);
  const rrScope = (d: DrawDivision): "within" | "between" | "custom" | null => {
    if (d.format.kind === "round_robin") return "within";
    if (d.format.kind !== "cross") return null;
    const sib = siblings(d), vs = d.format.crossVs;
    return vs && sib.length && vs.length === sib.length && vs.every((g) => sib.includes(g)) ? "between" : "custom";
  };
  /** Within = own round robin; Between = siblings of the same parent (set on every sibling); Custom = explicit pairings. */
  const setRrScope = (i: number, scope: "within" | "between" | "custom") => {
    const d = divs[i];
    if (scope === "within") { setFmt(i, { kind: "round_robin", crossVs: null, crossGroups: [] }); return; }
    if (scope === "custom") { setFmt(i, { kind: "cross", crossVs: d.format.crossVs ?? [], crossGroups: d.format.crossVs?.length ? d.format.crossGroups : [] }); return; }
    const fam = [d.group, ...siblings(d)];
    setConfirmed(false);
    setDivs((ds) => ds.map((x) => {
      if (!fam.includes(x.group)) return x;
      const vs = fam.filter((g) => g !== x.group);
      return { ...x, format: { ...x.format, kind: "cross", crossVs: vs, crossGroups: vs.length ? [...fam].sort((a, b) => a - b) : [] } };
    }));
  };
  const crossPairs = useMemo(() => {
    const { meetings } = crossSets(divs);
    const lab = (g: number) => divs.find((d) => d.group === g)?.label ?? `Group ${g}`;
    return [...meetings.values()].flat().map(([x, y]) => `${lab(x)} v ${lab(y)}`);
  }, [divs]);
  const nm = (id: string | null) => (id ? names.get(id) ?? "Unknown" : "");
  const unitName = (id: string) => id.split("+").map(nm).join(" & ");
  /** The seeding data actually used for this unit, shown next to its seed. */
  const seedData = (d: DrawDivision, id: string, idx: number): string => {
    const ps = id.split("+");
    if (manual[d.group]?.order) return `manual order (#${idx + 1})`;
    if (d.format.seeding === "ranking") { const v = ps.map((x) => points.get(x) ?? 0); return `ranking pts ${v.join(" + ")} = ${v.reduce((a, b) => a + b, 0)}`; }
    if (d.format.seeding === "ladder") { const v = ps.map((x) => ladder.get(x)); return `ladder ${v.map((x) => (x == null ? "—" : `#${x}`)).join(" / ")}`; }
    if (d.format.seeding === "random") return "random draw";
    return `entry #${(baseUnits[d.group - 1] ?? []).findIndex((u) => unitId(u) === id) + 1}`;
  };
  const moveSeed = (d: DrawDivision, id: string, dir: -1 | 1) => {
    const order = d.units.map(unitId); const k = order.indexOf(id), j = k + dir;
    if (j < 0 || j >= order.length) return;
    [order[k], order[j]] = [order[j], order[k]];
    setConfirmed(false);
    setManual((m) => ({ ...m, [d.group]: { ...m[d.group], order } }));
  };
  // Same move-to-pool action as the existing builder (pools.ts moveToPool): sizes follow the move, a pair moves as one.
  const movePool = (d: DrawDivision, id: string, to: number) => {
    const cur = poolsFor(d, poolMode); if (!cur) return;
    const r = moveToPool(cur.flat(), id, to, d.format.pools, { manual: true, sizes: cur.map((p) => p.length) });
    if (!r) return;
    setConfirmed(false);
    setManual((m) => ({ ...m, [d.group]: { ...m[d.group], pools: r } }));
  };
  const resetManual = (g: number) => { setConfirmed(false); setManual((m) => { const n = { ...m }; delete n[g]; return n; }); };
  const poolEditor = (d: DrawDivision) => {
    const pools = poolsFor(d, poolMode);
    const seedOf = new Map(d.units.map((u, k) => [unitId(u), k]));
    const groups = pools ?? [d.units.map(unitId)];
    const isPools = d.format.kind === "pools";
    const title = (pi: number) => isPools ? `Pool ${String.fromCharCode(65 + pi)}` : d.format.kind === "cross" ? (rrScope(d) === "between" ? "Seed order" : `${d.label} (plays the other selected groups)`) : d.format.kind === "round_robin" ? "Round robin (one group)" : "Seed order";
    return (
      <div className="space-y-2" aria-label={`Pools and seeds for ${d.label}`}>
        <div className={isPools ? "grid gap-2 sm:grid-cols-2" : ""}>
          {groups.map((pool, pi) => (
            <div key={pi} className={`rounded border p-1.5 ${dragId && isPools ? "border-dashed border-primary" : "border-border"}`}
              onDragOver={(e) => { if (isPools) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (isPools && dragId) movePool(d, dragId, pi); setDragId(null); }}>
              <div className="mb-1 font-medium">{title(pi)} · {pool.length} {d.doubles ? "pairs" : "players"}</div>
              <ol className="space-y-0.5">
                {pool.map((id) => {
                  const k = seedOf.get(id) ?? 0;
                  return (
                    <li key={id} draggable={isPools} onDragStart={() => setDragId(id)} onDragEnd={() => setDragId(null)}
                      className="flex flex-wrap items-center gap-1 rounded bg-muted/40 px-1 py-0.5">
                      <span className="w-12 font-semibold">Seed {k + 1}</span>
                      <span className="flex-1 min-w-[10rem]">{unitName(id)}</span>
                      <span className="text-muted-foreground">{seedData(d, id, k)}</span>
                      <button type="button" className="px-1 underline disabled:opacity-40" disabled={k === 0} aria-label={`Move ${unitName(id)} up one seed`} onClick={() => moveSeed(d, id, -1)}>↑</button>
                      <button type="button" className="px-1 underline disabled:opacity-40" disabled={k === d.units.length - 1} aria-label={`Move ${unitName(id)} down one seed`} onClick={() => moveSeed(d, id, 1)}>↓</button>
                      {isPools && (
                        <select aria-label={`Move ${unitName(id)} to pool`} className="rounded border border-input bg-background p-0.5" value={pi} onChange={(e) => movePool(d, id, Number(e.target.value))}>
                          {groups.map((_, j) => <option key={j} value={j}>Pool {String.fromCharCode(65 + j)}</option>)}
                        </select>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
        {isPools && <p className="text-muted-foreground">Drag a {d.doubles ? "pair" : "player"} onto another pool, or use "Move to pool". {d.doubles ? "Pairs always move together." : ""}</p>}
        {d.format.kind === "cross" && <p className="text-muted-foreground">Groups are the categories players entered, so pairs can't be moved between them here — change a category in Finalise Entries. You can change the seed order within this group.</p>}
        {poolWarnings(d, poolMode).map((w) => <p key={w} className="text-amber-600 dark:text-amber-400">⚠ {w}</p>)}
        {manual[d.group] && <p>Your changes are used exactly as shown when you generate. <button type="button" className="text-primary underline" onClick={() => resetManual(d.group)}>Reset to the calculated {isPools ? "pools and seeds" : "seeds"}</button></p>}
      </div>
    );
  };

  const errors = [...(venueErr ? [venueErr] : []), ...pairErrors, ...(preview?.errors ?? [])];
  const hasDraw = existing.games > 0;
  const canGenerate = !busy && confirmed && errors.length === 0 && (!hasDraw || (rebuildOk && existing.played === 0));

  const generate = async () => {
    if (!meta) return;
    setBusy(true);
    try {
      const version = `v${Date.now().toString(36)}`;
      // Re-check against the freshest entries right before saving (server re-validates pairs too).
      await (supabase as any).rpc("step_reconcile_admin_entrants", { p_champ_id: tournamentId }).then(() => undefined, () => undefined);
      const { data: fresh } = await fromExt("club_champs_registrations").select("club_member_id, partner_member_id, status, division_choices").eq("champ_id", tournamentId);
      const n = seeded.length;
      const drift = seeded.some((d) => unitsFor((fresh ?? []) as RegLite[], d.group, n, d.doubles).units.length !== d.units.length);
      if (drift) { toast.error("Entries changed since this preview — the preview has been refreshed. Check it and generate again."); await load(); return; }
      const spec = finalDrawSpec(meta.name, seeded, version, poolMode);
      const entries = seeded.flatMap((d) => d.units.map((u, k) => ({ member: u.member, partner: u.partner, group: d.group, order: k })));
      const { error } = await (supabase as any).rpc("step_prepare_draw", { p_champ_id: tournamentId, p_spec: spec, p_entries: entries, p_rebuild: hasDraw });
      if (error) throw new Error(error.message);
      // Cross-league: standings attribute games to each pair's own league (existing Club Champs cross-league view).
      if (seeded.some((d) => d.format.kind === "cross")) await fromExt("tournaments").update({ round_format: "cross_league" }).eq("id", tournamentId);
      const rows = await atomically(supabaseDb, tournamentId, commitStructured, (db) => generateStructuredTournament(db, tournamentId));
      const games = Array.isArray(rows) ? rows.filter((r: any) => r.player_a_member_id && r.player_b_member_id).length : preview?.total ?? 0;
      toast.success(`Draw saved — ${games} games created`);
      if (notifyDraw && !hasDraw) {
        // Reuse the existing round-draw notice (opponent, phone, play-by date) via the tournament's channels.
        try { const r = await notifyRoundDraw({ champId: tournamentId, roundNumber: 1 }); toast.success(roundNotifySummary(r)); }
        catch (e: any) { toast.error(`Draw saved, but players weren't notified: ${e.message ?? e}`); }
      }
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
        const fam = rrScope(d) === "between" ? [d, ...seeded.filter((o) => siblings(d).includes(o.group))] : [d];
        const block = fam.length > 1 && fam.every((o) => rrScope(o) === "between");
        if (block && fam.some((o) => seeded.indexOf(o) < i)) return null; // rendered with the first subcategory
        const targets = fam.map((o) => seeded.indexOf(o));
        const apply = (patch: Partial<DivFormat>) => (block ? targets : [i]).forEach((j) => setFmt(j, patch));
        const applySch = (patch: Partial<DivSchedule>) => apply({ schedule: { ...d.format.schedule, ...patch } });
        const issues = block ? [...new Set(fam.flatMap((o) => divisionIssues(o)))] : divisionIssues(d);
        const f = d.format;
        const pr = d.poolReview;
        const controls = (
          <>
            {pr && (pr.line || pr.warnings.length > 0) && <div className="space-y-1 rounded border border-border bg-muted/30 p-2">
              {pr.line && <p><span className="font-medium">Pools:</span> {pr.line}{f.kind === "pools" && pr.recommended.length > 1 && (f.pools !== pr.recommended.length) ? ` Currently set: ${f.pools} pools — ${sizesText(balancedSizes(d.units.length, f.pools))}.` : ""}</p>}
              {pr.mode !== "none" && f.kind !== "cross" && <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={d.poolAccepted ? "outline" : "default"} onClick={() => { const k = pr.recommended.length; apply({ kind: k > 1 ? "pools" : "round_robin", pools: Math.max(1, k) }); acceptPools(block ? targets : [i]); }}>{d.poolAccepted ? "Use the recommendation again" : "Accept recommended pools"}</Button>
                {d.poolAccepted ? <span className="text-muted-foreground">Accepted — adjust the number of pools or move {d.doubles ? "pairs" : "players"} below if you want.</span> : <span className="text-destructive">Pools must be accepted or adjusted before fixtures can be generated.</span>}
              </div>}
              {pr.mode !== "none" && <p className="text-muted-foreground">Within this group each pool plays its own round robin — pools don't play each other.</p>}
              {pr.warnings.map((w) => <p key={w} className="text-amber-600 dark:text-amber-400">⚠ {w} {f.kind !== "cross" && <button type="button" className="text-primary underline" onClick={() => { const k = Math.max(2, Math.round(d.units.length / 5)); apply({ kind: "pools", pools: k }); acceptPools(block ? targets : [i]); }}>Split into pools of about 5</button>}</p>)}
            </div>}
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="space-y-0.5"><span className="text-muted-foreground">Format</span>
                <select className="w-full rounded border border-input bg-background p-1" value={f.kind ?? ""} onChange={(e) => apply({ kind: (e.target.value || null) as DrawKind | null })}>
                  <option value="">Choose…</option>{(Object.keys(KIND_LABEL) as DrawKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select></label>
              {f.kind === "pools" && <label className="space-y-0.5"><span className="text-muted-foreground">Number of pools</span><Input type="number" min={2} className="h-7" value={f.pools} onChange={(e) => { apply({ pools: Number(e.target.value) || 1 }); acceptPools(block ? targets : [i]); }} /></label>}
              {f.kind === "swiss" && <label className="space-y-0.5"><span className="text-muted-foreground">Swiss rounds</span><Input type="number" min={1} className="h-7" value={f.swissRounds} onChange={(e) => apply({ swissRounds: Number(e.target.value) || 0 })} /></label>}
              <label className="space-y-0.5"><span className="text-muted-foreground">Seeding</span>
                <select className="w-full rounded border border-input bg-background p-1" value={f.seeding} onChange={(e) => apply({ seeding: e.target.value as DrawSeeding })}>
                  {(Object.keys(SEED_LABEL) as DrawSeeding[]).map((k) => <option key={k} value={k}>{SEED_LABEL[k]}</option>)}
                </select></label>
              <label className="space-y-0.5"><span className="text-muted-foreground">When games are played</span>
                <select className="w-full rounded border border-input bg-background p-1" value={f.schedule.rule ?? ""} onChange={(e) => apply({ schedule: { ...f.schedule, rule: (e.target.value || null) as any } })}>
                  <option value="">Choose…</option><option value="play_by">Play by a date (players arrange)</option><option value="fixed">Fixed match date(s)</option>
                </select></label>
              {f.schedule.rule === "play_by" && (
                <div className="space-y-1 sm:col-span-3">
                  <span className="text-muted-foreground">Play-by rounds{f.schedule.deadlines.length > 1 ? " — later dates cover the later rounds" : ""}</span>
                  {(f.schedule.deadlines.length ? f.schedule.deadlines : [""]).map((dl, k, arr) => (
                    <div key={k} className="flex flex-wrap items-center gap-2">
                      <Input type="date" aria-label={`Play-by date ${k + 1}`} className="h-7 w-40" value={dl} onChange={(e) => { const ds = [...arr]; ds[k] = e.target.value; applySch({ deadlines: ds, upto: ds.slice(1).map((_, j) => f.schedule.upto[j] ?? null) }); }} />
                      {(() => { const need = preview?.roundsByGroup[d.group]; const have = arr.filter(Boolean).length;
                        if (need == null || have <= 1) return null;
                        if (have === need) return <span className="font-medium">Round {k + 1} · Play by {fmtDay(dl)}</span>;
                        if (have > need && k >= need) return <span className="font-medium text-destructive">Unused — this structure has only {need} round{need === 1 ? "" : "s"}</span>;
                        return null; })()}
                      {k < arr.length - 1 && f.schedule.share && (preview?.roundsByGroup[d.group] ?? 0) > arr.filter(Boolean).length && <label className="flex items-center gap-1">games up to round <Input type="number" min={1} aria-label={`Last round due by date ${k + 1}`} className="h-7 w-16" placeholder="choose" value={f.schedule.upto[k] ?? ""} onChange={(e) => { const up = [...f.schedule.upto]; up[k] = e.target.value ? Number(e.target.value) : null; applySch({ upto: up }); }} /></label>}
                      {arr.length > 1 && <button type="button" className="text-destructive underline" onClick={() => { const ds = arr.filter((_, j) => j !== k); applySch({ deadlines: ds, upto: ds.slice(1).map(() => null) }); }}>remove</button>}
                    </div>
                  ))}
                  <button type="button" className="text-primary underline" onClick={() => { const ds = [...f.schedule.deadlines, ""]; applySch({ deadlines: ds, upto: ds.slice(1).map((_, j) => f.schedule.upto[j] ?? null) }); }}>+ add a play-by round</button>
                </div>
              )}
              {f.schedule.rule === "play_by" && (() => {
                const need = preview?.roundsByGroup[d.group];
                const have = f.schedule.deadlines.filter(Boolean).length;
                return (
                  <div className="space-y-1 sm:col-span-3">
                    {need != null && <span className={have > 1 && have < need && !f.schedule.share ? "font-medium text-destructive" : "text-muted-foreground"}>This structure needs {need} round{need === 1 ? "" : "s"}; {have} play-by date{have === 1 ? "" : "s"} set{have === 1 ? " (one date for all games)" : ""}.</span>}
                    {have > 1 && need != null && have < need && <label className="flex items-center gap-2"><Checkbox checked={!!f.schedule.share} onCheckedChange={(v) => applySch({ share: !!v })} /><span>Let several rounds share a play-by date (choose "games up to round" for each date)</span></label>}
                  </div>
                );
              })()}
              {f.schedule.rule === "fixed" && <label className="space-y-0.5"><span className="text-muted-foreground">Round dates (comma-separated)</span><Input className="h-7" placeholder="2026-10-10, 2026-10-17" value={f.schedule.dates.join(", ")} onChange={(e) => apply({ schedule: { ...f.schedule, dates: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} /></label>}
            </div>
            {(f.kind === "cross" || f.kind === "round_robin") && (
              <div className="space-y-1" role="radiogroup" aria-label={`${d.label} round robin matchups`}>
                <span className="text-muted-foreground">Round robin — who plays whom ({unitParentOf(d.label)}):</span>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant={f.kind === "round_robin" ? "default" : "outline"} aria-pressed={f.kind === "round_robin"} onClick={() => setRrScope(i, "within")}>Within subcategories</Button>
                  <Button type="button" size="sm" variant={rrScope(d) === "between" ? "default" : "outline"} aria-pressed={rrScope(d) === "between"} onClick={() => setRrScope(i, "between")}>Between subcategories</Button>
                  <Button type="button" size="sm" variant={rrScope(d) === "custom" ? "default" : "outline"} aria-pressed={rrScope(d) === "custom"} onClick={() => setRrScope(i, "custom")}>Custom matchups</Button>
                </div>
                <span className="text-muted-foreground">{f.kind === "round_robin" ? `${d.label} plays only within itself.` : rrScope(d) === "between" ? `${d.label} plays only the other subcategories of ${unitParentOf(d.label)}: ${siblings(d).map((g) => seeded.find((o) => o.group === g)?.label).join(", ") || "none"}.` : ""}</span>
              </div>
            )}
            {f.kind === "cross" && rrScope(d) !== "between" && (
              <div className="space-y-1">
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Cross-league matchups">
                  <Button type="button" size="sm" variant={!f.crossVs ? "default" : "outline"} aria-pressed={!f.crossVs} onClick={() => setCrossMode(i, "all")}>All selected groups play each other</Button>
                  <Button type="button" size="sm" variant={f.crossVs ? "default" : "outline"} aria-pressed={!!f.crossVs} onClick={() => setCrossMode(i, "chosen")}>Choose which groups play each other</Button>
                </div>
                <span className="text-muted-foreground">{f.crossVs ? `${d.label} plays only the groups ticked below (both groups are updated together; never its own group):` : "Plays against (every pair meets every pair of the other selected groups, never its own group):"}</span>
                <div className="flex flex-wrap gap-1">{seeded.filter((o) => o.group !== d.group).map((o) => {
                  const on = f.crossVs ? f.crossVs.includes(o.group) : f.crossGroups.includes(o.group);
                  return <Button key={o.group} type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => {
                    if (f.crossVs) { togglePairing(i, o.group, !on); return; }
                    const next = on ? f.crossGroups.filter((g) => g !== o.group) : [...new Set([...f.crossGroups, d.group, o.group])];
                    apply({ crossGroups: next.length < 2 ? [] : next.sort((a, b) => a - b) });
                  }}>{f.crossVs ? `v ${o.label}` : o.label}</Button>;
                })}</div>
              </div>
            )}
            {d.playoffs.length > 0 && <p className="text-muted-foreground">Planned play-offs: {d.playoffs.join(" → ")} — kept as "Define later", created after this stage finishes.</p>}
            {d.notes.map((n) => <p key={n} className="text-muted-foreground">• {n}</p>)}
            {issues.length > 0 && <p className="text-destructive">Fix: {issues.join(" · ")}</p>}
          </>
        );
        const shared = block ? preview?.divisions.find((p) => p.groups.includes(d.group)) : null;
        if (block) return (
          <div key={d.group} className="rounded border border-primary/40 p-2 space-y-2" aria-label={`${unitParentOf(d.label)} between subcategories`}>
            <div className="font-semibold">{fam.map((o) => o.label).join(" vs ")}</div>
            <div className="text-xs text-muted-foreground">{unitParentOf(d.label)} — Between subcategories</div>
            <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
              {fam.map((o, k) => (
                <div key={o.group} className="contents">
                  {k > 0 && <div className="flex items-center justify-center font-bold text-primary md:px-1" aria-hidden="true">VS</div>}
                  <div className="flex-1 min-w-0 rounded border border-border p-1.5 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold">{o.label}</span>
                      <span className="text-muted-foreground">{o.units.length} {o.doubles ? "pairs" : "players"}{k > 0 ? ` · plays ${fam[0].label}` : ""}</span>
                    </div>
                    {o.units.length > 0 && poolEditor(o)}
                  </div>
                </div>
              ))}
            </div>
            {shared && (
              <div className="rounded bg-muted/40 p-1.5">
                <div className="font-medium">Shared rounds — {shared.games} games over {shared.rounds} round{shared.rounds === 1 ? "" : "s"}</div>
                <ul className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">{shared.perRound.map((r) => <li key={r.round}>Round {r.round} · {r.games} games{r.date ? ` · Play by ${fmtDay(r.date)}` : ""}</li>)}</ul>
              </div>
            )}
            <p className="text-muted-foreground">Settings below apply to {fam.map((o) => o.label).join(" and ")} together.</p>
            {controls}
          </div>
        );
        return (
          <div key={d.group} className="rounded border border-border p-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{d.label}</span>
              <button type="button" className="text-primary underline" onClick={() => setShowPairs(showPairs === i ? null : i)} aria-expanded={showPairs !== i}>{d.units.length} {d.doubles ? "pairs" : "players"} · {showPairs === i ? "show pools & seeds" : "hide pools & seeds"}</button>
            </div>
            {showPairs !== i && d.units.length > 0 && poolEditor(d)}
            {controls}
          </div>
        );
      })}

      {crossPairs.length > 0 && (
        <div className="rounded border border-border p-2" aria-label="Cross-league matchups">
          <div className="font-medium">Cross-league matchups — exactly these groups meet</div>
          <ul className="mt-1 space-y-0.5">{crossPairs.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="text-muted-foreground">No other cross-group games and no games within a group.</p>
        </div>
      )}
      {preview && errors.length === 0 && (
        <div className="rounded border border-border bg-muted/40 p-2">
          <div className="font-medium">Preview — {preview.total} games will be created</div>
          <ul className="mt-1 space-y-0.5">{preview.divisions.map((p) => (
            <li key={p.label}>{p.label}: {p.units} entries{p.pools > 1 ? ` in ${p.pools} ${seeded.some((d) => d.format.kind === "cross" && p.label.includes(" v ")) ? "groups" : "pools"}` : ""} · {p.games} games over {p.rounds} round{p.rounds === 1 ? "" : "s"}{p.byes ? ` · ${p.byes} bye${p.byes === 1 ? "" : "s"}` : ""} · {p.schedule}</li>
          ))}</ul>
          <details className="mt-1"><summary className="cursor-pointer text-primary">Games per round and due dates</summary>
            {preview.divisions.map((p) => <div key={p.label} className="mt-1"><span className="font-medium">{p.label}:</span> {p.perRound.map((r) => `R${r.round} ${r.games}${r.date ? ` (${r.date})` : ""}`).join(" · ")}</div>)}
          </details>
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
          {!hasDraw && <label className="flex items-start gap-2"><Checkbox checked={notifyDraw} onCheckedChange={(v) => setNotifyDraw(!!v)} /><span>Tell players their Round 1 opponent (name and phone number, and in doubles their partner too), the play-by date, and — when every round was drawn upfront — all rounds and their booking dates, so they can book all their courts at once (uses the tournament's message channels).</span></label>}
          <Button disabled={!canGenerate} onClick={generate}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{hasDraw ? "Rebuild draw & fixtures" : "Generate draw & fixtures"}</Button>
        </>
      )}
      {revisiting && null}
    </div>
  );
}

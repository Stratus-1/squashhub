import { patchTournamentPlanFormat } from "@/lib/smart-builder/step-storage";
import { normaliseTieBreaks } from "@/lib/tournaments/tie-breaks";
import { DEFAULT_DRAW_NOTICE, sendDrawNotice, loadDrawNoticeRecipients } from "@/lib/smart-builder/draw-notice";
import { useWhatsAppEnabled } from "@/hooks/use-whatsapp-enabled";
import { DrawNoticeEditor } from "./DrawNoticeEditor";
import { poolPlanOf, poolQualificationOf, reviewPools, sizesText, balancedSizes } from "@/lib/smart-builder/pool-plan";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { setupConflicts } from "@/lib/smart-builder/consistency";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ChevronRight, AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { applySetupSessions } from "@/lib/smart-builder/session-slots";
import { allocateAllFixedStages } from "@/lib/tournaments/formal-stage-schedule";
import { assertNotDiamondTournament } from "@/lib/tournaments/diamond-guard";
import { proposedKnockoutRound1, previewTimedGames } from "@/lib/smart-builder/step-draw";
import { SchedulingPreferencesSection } from "./SchedulingPreferencesSection";
import { syncPlayoffPlaceholders } from "@/lib/smart-builder/playoff-placeholders";
import { commitStructured, supabaseDb } from "@/lib/tournaments/structured-db";
import { distributeIntoPools, moveToPool, normalisePoolAllocation, type PoolAllocationMode } from "@/lib/tournaments/pools";
import { venueBlocker } from "@/lib/tournaments/bookable-courts";
import { atomically, generateStructuredTournament } from "@/lib/tournaments/structured-persist";
import {
  divisionIssues, defaultCrossAll, crossOpponents, crossEdges, crossPlayerMatchesFor, finalDrawSpec, isPooledKnockout, knockoutNeedText, withKnockoutChoice, pooledKnockoutTarget, formatWithPoolRule, unitParentOf, poolsFor, poolWarnings, unitId, orderUnits, previewDraw, proposeFormat, rankingIssue, readStepPlan, unitKeyOf, unitsFor,
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

export function StepGenerateDrawPanel({ clubId, tournamentId, onGenerated, revisiting, onEditSetup }: {
  clubId: string; tournamentId: string; revisiting: boolean; onGenerated: (info: { games: number }) => void; onEditSetup?: () => void;
}) {
  const waEnabled = useWhatsAppEnabled(clubId);
  const [recips, setRecips] = useState<Array<{ id: string; name: string }> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  // Canonical Fixtures/Tournament Games view for this tournament, preserving club context.
  const fixturesUrl = () => {
    const q = new URLSearchParams({ champ: tournamentId });
    const club = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("club") : null;
    if (club) q.set("club", club);
    return `/tournaments?${q.toString()}`;
  };
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
  const [pickDraft, setPickDraft] = useState<Record<number, [string, string]>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [notifyDraw, setNotifyDraw] = useState(true);
  const [askSend, setAskSend] = useState<{ after: boolean } | null>(null);
  const [sendCh, setSendCh] = useState<{ app: boolean; email: boolean; wa: boolean }>({ app: true, email: false, wa: false });
  const [sending, setSending] = useState(false);
  const [drawMessage, setDrawMessage] = useState(DEFAULT_DRAW_NOTICE);
  const [rebuildOk, setRebuildOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPairs, setShowPairs] = useState<number | null>(null);
  /** Organiser edits per group: seed order and/or pools. These are what Generate saves — never recalculated away. */
  const [manual, setManual] = useState<Record<number, { order?: string[]; pools?: { ids: string[]; sizes: number[] }; pairs?: Array<Array<[string, string]>> }>>({});
  const [poolMode, setPoolMode] = useState<PoolAllocationMode>("snake");
  const [dragId, setDragId] = useState<string | null>(null);
  const [venueErr, setVenueErr] = useState<string | null>(null);
  const [schedOk, setSchedOk] = useState(true);
  const [seedFull, setSeedFull] = useState(false);
  /** Seed order the admin set on the Pick / Allocate players board, per group — the one source of truth for seeding. */
  const [boardOrder, setBoardOrder] = useState<Record<number, string[]>>({});
  useEffect(() => {
    if (!seedFull) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSeedFull(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [seedFull]);

  const load = async () => {
    setLoading(true);
    await assertNotDiamondTournament(tournamentId);
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
      fromExt("club_champs_registrations").select("club_member_id, partner_member_id, status, division_choices, division_partners").eq("champ_id", tournamentId),
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
    // The setup saved on the tournament is authoritative (Stages & scheduling syncs it on every change);
    // this device's copy is only a fallback, so edits made in setup always show up here.
    const saved = (tt as any)?.beta_lifecycle?.format_plan ?? null;
    const local = readStepPlan(clubId, tournamentId);
    const plan = saved ? { ...(local ?? {}), ...saved } : local;
    const errs: string[] = [];
    const list: DrawDivision[] = [];
    const unspecifiedCross = new Set<number>();
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
      if (p.format.kind === "cross" && !p.crossKeys.length && !p.crossByParent && !p.crossPairKeys) unspecifiedCross.add(g);
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
      // Knockout never plays a round robin, so round-robin game-count warnings do not apply.
      if (p.format.kind === "knockout") review.warnings = [];
      // Match format comes from the setup scoring answers (tournament-wide, with per-category overrides).
      const ans: any = (tt as any)?.beta_lifecycle?.answers ?? {};
      const uKey = unitKeyOf(label);
      const sc = ans?.scoringOverrides?.[uKey] ?? ans?.scoringOverrides?.[uKey.split("::")[0]] ?? ans?.scoring
        ?? (plan?.divisions ?? []).find((dv: any) => dv?.label === label)?.scoring;
      const scoringText = sc ? `${sc.mode === "time_capped_points" ? "Time-capped points" : `PAR ${sc.pointsPerGame ?? 11}`} · ${sc.playAllGames ? `Play all ${sc.bestOf} games` : `Best of ${sc.bestOf}`}` : null;
      list.push({ group: g, label, doubles, units: r.units, format: p.format, notes, playoffs: p.playoffs, playoffPlans: p.playoffPlans, poolReview: review.mode === "none" && !review.warnings.length ? null : review, poolAccepted: review.mode === "auto", scoringText,
        poolQualifiers: (() => { const r = poolPlanOf(plan, unitKeyOf(label)); const q = poolQualificationOf(plan, unitKeyOf(label)); return r && r.mode !== "none" ? { perPool: Number(q.perPool) || null, runnersUp: Number(q.runnersUp) || 0 } : null; })() });
    }
    const ids = [...new Set(((regs ?? []) as any[]).flatMap((r) => [r.club_member_id, r.partner_member_id, ...Object.values(r.division_partners ?? {})]).filter(Boolean))];
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
    const so = (tt as any)?.beta_lifecycle?.answers?.seedOrder ?? {};
    const bo: Record<number, string[]> = {};
    labels.forEach((l, k) => { const v = so[unitKeyOf(l)]; if (Array.isArray(v) && v.length) bo[k + 1] = v; });
    setBoardOrder(bo);
    setBaseUnits(units); setDivs(defaultCrossAll(list, unspecifiedCross)); setPairErrors(errs); setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tournamentId]);

  // Seeded order follows the chosen seeding; the preview and the saved draw use the same order.
  const seeded = useMemo(() => divs.map((d, i) => {
    const base = baseUnits[i] ?? [];
    const rk = d.format.seeding === "ranking" ? rankingIssue(base, scope, points) : null;
    let units = orderUnits(base, d.format.seeding, { seed: seed + i, ladder, points });
    const bo = boardOrder[d.group];
    if (bo) { const at = (id: string) => { const i = bo.indexOf(id); return i < 0 ? 1e9 : i; }; const r = (u: (typeof units)[number]) => Math.min(at(u.member), u.partner ? at(u.partner) : 1e9); units = units.map((u, k) => ({ u, k })).sort((x, y) => (r(x.u) - r(y.u)) || (x.k - y.k)).map((x) => x.u); }
    const mo = manual[d.group]?.order;
    if (mo) { const by = new Map(units.map((u) => [unitId(u), u])); units = mo.map((id) => by.get(id)!).filter(Boolean); }
    return { ...d, koPairs: manual[d.group]?.pairs ?? null, blockers: [...(rk ? [rk] : []), ...planConflicts.map((m) => `Setup needs reconciling first (open the setup's Stages & scheduling step): ${m}`)], units, manualPools: (d.format.kind === "pools" || isPooledKnockout(d.format)) && manual[d.group]?.pools ? distributeIntoPools(manual[d.group]!.pools!.ids, d.format.pools, { manual: true, sizes: manual[d.group]!.pools!.sizes }) : null };
  }), [divs, baseUnits, ladder, points, scope, seed, manual, planConflicts, boardOrder]);
  /** Round 1 matches the engine proposes for each paced knockout (before organiser edits) — reviewed below before anything is created. */
  const proposals = useMemo(() => meta ? proposedKnockoutRound1(meta.name, seeded, poolMode) : new Map<number, Array<Array<[string, string]>>>(), [meta, seeded, poolMode]);
  const round1Of = (g: number) => manual[g]?.pairs ?? proposals.get(g) ?? null;
  const setRound1 = (g: number, pairs: Array<Array<[string, string]>> | null) => {
    setConfirmed(false);
    setManual((m) => { const cur = { ...m[g] }; if (pairs) cur.pairs = pairs; else delete cur.pairs; const n = { ...m, [g]: cur }; if (!cur.order && !cur.pools && !cur.pairs) delete n[g]; return n; });
  };
  const round1Issues = useMemo(() => seeded.flatMap((d) => {
    const ps = manual[d.group]?.pairs; if (!ps) return [];
    const used = ps.flat().flat();
    if (used.some((x) => !x) || ps.flat().some(([a, b]) => a === b)) return [`${d.label}: a Round 1 match is missing a player.`];
    if (new Set(used).size !== used.length) return [`${d.label}: a player appears in two Round 1 matches.`];
    return [];
  }), [seeded, manual]);
  const timedPreview = useMemo(() => meta && seeded.some((d) => d.format.schedule.rule === "fixed") ? previewTimedGames(meta.name, seeded, poolMode) : [], [meta, seeded, poolMode]);
  const preview = useMemo(() => meta ? previewDraw(meta.name, seeded, { start: meta.start, end: meta.end }, "preview", poolMode) : null, [meta, seeded, poolMode]);
  /** Knockout pace / pairing are real settings: saved on the tournament's plan (and this device's copy) so Generate and Manage use them. */
  const saveKnockoutChoice = async (labels: string[], patch: Record<string, string>) => {
    try {
      const keys = labels.map(unitKeyOf);
      keys.forEach((k) => patchTournamentPlanFormat(clubId, tournamentId, k, patch));
      const { data: t } = await fromExt("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle();
      const bl: any = (t as any)?.beta_lifecycle ?? {};
      const fp: any = bl.format_plan ?? {};
      const fo = { ...(fp.formatOverrides ?? {}) };
      for (const k of keys) fo[k] = { ...(fo[k] ?? fo[k.split("::")[0]] ?? fp.format ?? {}), ...patch };
      const { error } = await fromExt("tournaments").update({ beta_lifecycle: { ...bl, format_plan: { ...fp, formatOverrides: fo } } } as any).eq("id", tournamentId);
      if (error) throw error;
    } catch (e: any) { toast.error(`Knockout setting not saved: ${e?.message ?? e}`); }
  };
  const acceptPools = (is: number[]) => { setConfirmed(false); setDivs((ds) => ds.map((d, k) => is.includes(k) ? { ...d, poolAccepted: true } : d)); };
  const setSch = (i: number, patch: Partial<DivSchedule>) => setFmt(i, { schedule: { ...divs[i].format.schedule, ...patch } });
  const setFmt = (i: number, patch: Partial<DivFormat>) => {
    const g = divs[i]?.group;
    if (g != null && manual[g] && ("kind" in patch || "pools" in patch || "seeding" in patch)) {
      setManual((m) => { const n = { ...m }; delete n[g]; return n; });
      toast.info(`${divs[i].label}: format/seeding changed, so your manual seed and pool changes were reset.`);
    } else if (g != null && manual[g]?.pairs && ("ko" in patch || "paced" in patch)) {
      setManual((m) => { const cur = { ...m[g] }; delete cur.pairs; const n = { ...m, [g]: cur }; if (!cur.order && !cur.pools) delete n[g]; return n; });
      toast.info(`${divs[i].label}: knockout pace/pairing changed, so the Round 1 matches were re-proposed.`);
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
  /** Turn "Against other groups" on for a pairing — always set on BOTH groups (one canonical relationship). */
  const linkGroups = (me: number, other: number, on: boolean) => {
    setConfirmed(false);
    setDivs((ds) => ds.map((d) => {
      if (d.group !== me && d.group !== other) return d;
      const peer = d.group === me ? other : me;
      const cur = crossOpponents(d, ds);
      const vs = (on ? [...new Set([...cur, peer])] : cur.filter((g) => g !== peer)).sort((a, b) => a - b);
      const keepKind = !on && !vs.length && d.group === peer ? d.format.kind : "cross";
      return { ...d, format: { ...d.format, kind: d.group === me ? "cross" : keepKind, crossVs: vs, crossGroups: vs.length ? [d.group, ...vs].sort((a, b) => a - b) : [] } };
    }));
  };
  const setWho = (i: number, who: "within" | "against") => {
    const d = divs[i];
    if (who === "within") {
      for (const g of crossOpponents(d, divs)) linkGroups(d.group, g, false);
      setFmt(i, { kind: "round_robin", crossVs: null, crossGroups: [], crossHow: undefined, crossPlayerMatches: [] });
      return;
    }
    setFmt(i, { kind: "cross", crossHow: d.format.crossHow ?? "full", crossVs: crossOpponents(d, divs), crossGroups: d.format.crossGroups });
  };
  /** Apply "How should they play?" to this group and every group it is related to (same relationship, same rule). */
  const setHow = (i: number, how: "full" | "players") => {
    const d = divs[i]; const rel = new Set([d.group, ...crossOpponents(d, divs)]);
    setConfirmed(false);
    setDivs((ds) => ds.map((x) => rel.has(x.group) && x.format.kind === "cross" ? { ...x, format: { ...x.format, crossHow: how } } : x));
  };
  const setPlayerMatches = (i: number, ms: Array<[string, string]>) => setFmt(i, { crossPlayerMatches: ms });
  const crossSection = (i: number, d: DrawDivision) => {
    const f = d.format; const sd = seeded.find((o) => o.group === d.group) ?? d;
    const against = f.kind === "cross";
    const opp = crossOpponents(d, divs);
    const others = seeded.filter((o) => o.group !== d.group && o.doubles === d.doubles);
    const lab = (g: number) => seeded.find((o) => o.group === g)?.label ?? `Group ${g}`;
    const size = (g: number) => seeded.find((o) => o.group === g)?.units.length ?? 0;
    const u = d.doubles ? "pairs" : "players";
    const n = d.units.length;
    const how = f.crossHow ?? "full";
    const relDivs = seeded.filter((o) => o.group === d.group || opp.includes(o.group));
    const picked = crossPlayerMatchesFor(relDivs, crossEdges(divs)).filter(([a, b]) => sd.units.some((x) => unitId(x) === a || unitId(x) === b));
    const oppUnits = seeded.filter((o) => opp.includes(o.group)).flatMap((o) => o.units.map((x) => ({ id: unitId(x), g: o.group })));
    const [draftA, draftB] = (pickDraft[d.group] ?? ["", ""]) as [string, string];
    const fullTotal = opp.reduce((t, g) => t + n * size(g), 0);
    return (
      <div className="space-y-2 rounded border border-border p-2" aria-label={`${d.label} who plays whom`}>
        <div className="space-y-1">
          <span className="font-medium">Who should this group play?</span>
          <div className="flex flex-wrap gap-1" role="radiogroup">
            <Button type="button" size="sm" variant={!against ? "default" : "outline"} aria-pressed={!against} onClick={() => setWho(i, "within")}>Within this group</Button>
            <Button type="button" size="sm" variant={against ? "default" : "outline"} aria-pressed={against} disabled={!others.length} onClick={() => setWho(i, "against")}>Against other groups</Button>
          </div>
          {!against && <p className="text-muted-foreground">Everyone in this group plays everyone else once: {n} {u} → {(n * (n - 1)) / 2} matches.</p>}
        </div>
        {against && (
          <div className="space-y-1">
            <span className="font-medium">How should they play?</span>
            <div className="flex flex-wrap gap-1" role="radiogroup">
              <Button type="button" size="sm" variant={how === "full" ? "default" : "outline"} aria-pressed={how === "full"} onClick={() => setHow(i, "full")}>Full cross-group round robin</Button>
              <Button type="button" size="sm" variant={how === "players" ? "default" : "outline"} aria-pressed={how === "players"} onClick={() => setHow(i, "players")}>Selected player matchups</Button>
            </div>
            <p className="text-muted-foreground">{how === "full" ? "Every player in this group plays every player in the selected group(s) once." : "Choose the individual cross-group matches yourself."}</p>
            <span className="font-medium">Which groups should they play?</span>
            <div className="flex flex-wrap gap-1">
              <Button type="button" size="sm" variant={others.length > 0 && others.every((o) => opp.includes(o.group)) ? "default" : "outline"} onClick={() => others.forEach((o) => { if (!opp.includes(o.group)) linkGroups(d.group, o.group, true); })}>All other groups</Button>
              {others.map((o) => { const on = opp.includes(o.group); return <Button key={o.group} type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on} onClick={() => linkGroups(d.group, o.group, !on)}>{o.label}</Button>; })}
            </div>
            {how === "full" && opp.length > 0 && (
              <div className="rounded bg-muted/40 p-1.5" data-testid={`cross-calc-${d.group}`}>
                {opp.map((g) => <div key={g}><span className="font-medium">{d.label} ↔ {lab(g)}</span> — {n} × {size(g)} = {n * size(g)} matches</div>)}
                <div className="text-muted-foreground">Every player plays every player in the other group once.{opp.length > 1 ? ` ${fullTotal} matches for this group.` : ""}</div>
              </div>
            )}
            {how === "players" && opp.length > 0 && (
              <div className="space-y-1">
                {picked.map(([a, b]) => (
                  <div key={`${a}|${b}`} className="flex flex-wrap items-center gap-2">
                    <span>{unitName(a)}</span><span className="text-muted-foreground">vs</span><span>{unitName(b)}</span>
                    <button type="button" className="text-destructive underline" onClick={() => { setConfirmed(false); setDivs((ds) => ds.map((x) => ({ ...x, format: { ...x.format, crossPlayerMatches: (x.format.crossPlayerMatches ?? []).filter(([p, q]) => !((p === a && q === b) || (p === b && q === a))) } }))); }}>Remove</button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-1">
                  <select aria-label={`${d.label} matchup player`} className="rounded border border-input bg-background p-1 max-w-full" value={draftA} onChange={(e) => setPickDraft((p) => ({ ...p, [d.group]: [e.target.value, draftB] }))}>
                    <option value="">Player from {d.label}</option>
                    {sd.units.map((x) => <option key={unitId(x)} value={unitId(x)}>{unitName(unitId(x))}</option>)}
                  </select>
                  <span className="text-muted-foreground">vs</span>
                  <select aria-label={`${d.label} matchup opponent`} className="rounded border border-input bg-background p-1 max-w-full" value={draftB} onChange={(e) => setPickDraft((p) => ({ ...p, [d.group]: [draftA, e.target.value] }))}>
                    <option value="">Player from another group</option>
                    {oppUnits.map((x) => <option key={x.id} value={x.id}>{unitName(x.id)} ({lab(x.g)})</option>)}
                  </select>
                  <Button type="button" size="sm" variant="outline" disabled={!draftA || !draftB} onClick={() => {
                    if (picked.some(([x, y]) => (x === draftA && y === draftB) || (x === draftB && y === draftA))) { toast.error("That matchup is already in the list."); return; }
                    setPlayerMatches(i, [...(f.crossPlayerMatches ?? []), [draftA, draftB]]);
                    setPickDraft((p) => ({ ...p, [d.group]: ["", ""] }));
                  }}>Add matchup</Button>
                </div>
                <p className="text-muted-foreground" data-testid={`cross-picked-${d.group}`}>{picked.length} selected match{picked.length === 1 ? "" : "es"} — only these are created.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  const crossPairs = useMemo(() => {
    const { meetings } = crossSets(divs);
    const lab = (g: number) => divs.find((d) => d.group === g)?.label ?? `Group ${g}`;
    const size = (g: number) => divs.find((d) => d.group === g)?.units.length ?? 0;
    const players = (g: number) => divs.find((d) => d.group === g)?.format.crossHow === "players";
    return [...meetings.values()].flat().map(([x, y]) => players(x) || players(y) ? `${lab(x)} ↔ ${lab(y)}: selected player matchups` : `${lab(x)} ↔ ${lab(y)}: ${size(x)} × ${size(y)} = ${size(x) * size(y)} matches`);
  }, [divs]);
  const nm = (id: string | null) => (id ? names.get(id) ?? "Unknown" : "");
  const unitName = (id: string) => id.split("+").map(nm).join(" & ");
  /** The seeding data actually used for this unit, shown next to its seed. */
  const seedData = (d: DrawDivision, id: string, idx: number): string => {
    const ps = id.split("+");
    if (manual[d.group]?.order) return "";
    if (d.format.seeding === "ranking") { const v = ps.map((x) => points.get(x) ?? 0); return `ranking pts ${v.join(" + ")} = ${v.reduce((a, b) => a + b, 0)}`; }
    if (d.format.seeding === "ladder") { const v = ps.map((x) => ladder.get(x)); return v.map((x) => (x == null ? "—" : `#${x}`)).join(" / "); }
    if (d.format.seeding === "random") return "random draw";
    return `entry #${(baseUnits[d.group - 1] ?? []).findIndex((u) => unitId(u) === id) + 1}`;
  };
  const moveSeed = (d: DrawDivision, id: string, dir: -1 | 1) => {
    const order = d.units.map(unitId); const k = order.indexOf(id), j = k + dir;
    if (j < 0 || j >= order.length) return;
    [order[k], order[j]] = [order[j], order[k]];
    setConfirmed(false);
    setManual((m) => ({ ...m, [d.group]: { ...m[d.group], order, pairs: undefined } }));
  };
  // Same move-to-pool action as the existing builder (pools.ts moveToPool): sizes follow the move, a pair moves as one.
  const movePool = (d: DrawDivision, id: string, to: number) => {
    const cur = poolsFor(d, poolMode); if (!cur) return;
    const r = moveToPool(cur.flat(), id, to, d.format.pools, { manual: true, sizes: cur.map((p) => p.length) });
    if (!r) return;
    setConfirmed(false);
    setManual((m) => ({ ...m, [d.group]: { ...m[d.group], pools: r, pairs: undefined } }));
  };
  const resetManual = (g: number) => { setConfirmed(false); setManual((m) => { const n = { ...m }; delete n[g]; return n; }); };
  const poolEditor = (d: DrawDivision) => {
    const pools = poolsFor(d, poolMode);
    const seedOf = new Map(d.units.map((u, k) => [unitId(u), k]));
    const groups = pools ?? [d.units.map(unitId)];
    const isPools = d.format.kind === "pools" || isPooledKnockout(d.format);
    const title = (pi: number) => isPools ? `Pool ${String.fromCharCode(65 + pi)}` : d.format.kind === "cross" ? (rrScope(d) === "between" ? "Seed order" : `${d.label} (plays the other selected groups)`) : d.format.kind === "round_robin" ? "Round robin (one group)" : "Seed order";
    if (!isPools) return null;
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
                      <span className="w-5 text-right font-semibold" title={`Seed ${k + 1}`}>{k + 1}</span>
                      <span className="flex-1 min-w-[7rem]">{unitName(id)}{(() => { const sd = seedData(d, id, k); return sd ? <span className="text-muted-foreground"> ({sd})</span> : null; })()}</span>
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

  /** Review / edit the Round 1 matches before anything is created. Only these matches are saved by Generate. */
  const round1Editor = (d: DrawDivision) => {
    const groups = round1Of(d.group) ?? [];
    const pooled = isPooledKnockout(d.format);
    const pools = pooled ? poolsFor(d, poolMode) ?? [] : [d.units.map(unitId)];
    const edited = !!manual[d.group]?.pairs;
    const change = (pi: number, next: Array<[string, string]>) => setRound1(d.group, pools.map((_, k) => (k === pi ? next : groups[k] ?? [])));
    return (
      <div className="space-y-2 rounded border border-primary/40 bg-primary/5 p-2" aria-label={`Round 1 matches for ${d.label}`}>
        <div className="font-medium">Initial Round 1 proposal — review before creating</div>
        <p className="text-muted-foreground">Nothing is created until you press Generate below. Only these Round 1 matches are created; everyone not listed stays in (waiting is not a loss). Later rounds are proposed in Manage Tournament after results.</p>
        {pools.map((members, pi) => {
          const list = groups[pi] ?? [];
          const used = list.flat();
          const waiting = members.filter((id) => !used.includes(id));
          return (
            <div key={pi} className="space-y-1">
              {pooled && <div className="font-medium">Pool {String.fromCharCode(65 + pi)}</div>}
              {list.length === 0 && <p className="text-muted-foreground">No match this round — everyone stays in.</p>}
              {list.map(([a, b], i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  {[a, b].map((v, side) => (
                    <select key={side} aria-label={`${d.label}${pooled ? ` pool ${String.fromCharCode(65 + pi)}` : ""} match ${i + 1} player ${side ? "B" : "A"}`} className="rounded border border-input bg-background p-1" value={v}
                      onChange={(e) => change(pi, list.map((p, j) => (j === i ? (side ? [p[0], e.target.value] : [e.target.value, p[1]]) : p)) as Array<[string, string]>)}>
                      <option value="">Choose…</option>
                      {members.map((id) => <option key={id} value={id}>{unitName(id)}</option>)}
                    </select>
                  )).reduce((acc: any[], el, k) => (k ? [...acc, <span key="v">v</span>, el] : [el]), [])}
                  <button type="button" className="text-destructive underline" onClick={() => change(pi, list.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              {waiting.length > 0 && <p className="text-muted-foreground">Waiting (still in): {waiting.map(unitName).join(", ")}</p>}
              {waiting.length >= 2 && <button type="button" className="text-primary underline" onClick={() => change(pi, [...list, [waiting[waiting.length - 2], waiting[waiting.length - 1]]])}>+ add a match</button>}
            </div>
          );
        })}
        {edited && <button type="button" className="text-primary underline" onClick={() => setRound1(d.group, null)}>Reset to the proposed matches</button>}
      </div>
    );
  };

  const errors = [...(venueErr ? [venueErr] : []), ...pairErrors, ...round1Issues, ...(preview?.errors ?? [])];
  const hasDraw = existing.games > 0;
  const canGenerate = !busy && schedOk && confirmed && errors.length === 0 && (!hasDraw || (rebuildOk && existing.played === 0));

  const reportSessions = (rs: Awaited<ReturnType<typeof applySetupSessions>>) => {
    for (const r of rs) {
      if (r.noSlot) toast.error(`${r.name}: enter "Match time per slot" in Stages & scheduling so games can be placed on courts.`);
      else if (r.unplaced) toast.warning(`${r.name}: ${r.placed} of ${r.games} games placed on courts (${r.slots} slots). ${r.unplaced} keep their play-by date — add a day, courts or time.`);
      else if (r.games) toast.success(`${r.name}: all ${r.placed} games placed on courts (${r.slots - r.placed} slots spare).`);
      if (r.note) toast.warning(r.note);
    }
  };
  const placeOnCourts = async () => {
    setBusy(true);
    try { const rs = await applySetupSessions(supabase, tournamentId); if (!rs.some((r) => r.games)) toast.info("No unplaced games in scheduled rounds."); reportSessions(rs); }
    catch (e: any) { toast.error(String(e.message ?? e)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!askSend) return;
    setRecips(null);
    loadDrawNoticeRecipients(tournamentId).then((r) => { setRecips(r); setPicked(new Set(r.map((x) => x.id))); }).catch((e) => { setRecips([]); toast.error(String(e.message ?? e)); });
  }, [askSend, tournamentId]);
  const closeAsk = () => { const after = askSend?.after; setAskSend(null); if (after) navigate(fixturesUrl()); };
  const sendDraw = async () => {
    const want = [sendCh.app && "app", sendCh.email && "email", sendCh.wa && waEnabled && "wa"].filter(Boolean) as string[];
    if (!want.length) { toast.error("Choose at least one channel."); return; }
    if (!picked.size) { toast.error("Choose at least one player."); return; }
    setSending(true);
    try {
      const channels = [...(sendCh.app ? ["in_app" as const] : []), ...(sendCh.email ? ["email" as const] : []), ...(sendCh.wa && waEnabled ? ["whatsapp" as const] : [])];
      const { dispatched } = await sendDrawNotice(clubId, tournamentId, meta?.name ?? "Tournament", drawMessage, channels, [...picked], true);
      if (dispatched?.failed) throw new Error(`${dispatched.failed} delivery attempts failed. Check Communications delivery history before sending again.`);
      toast.success(`Draw notification sent: ${dispatched?.sent ?? 0} deliveries.`);
      closeAsk();
    } catch (e: any) { toast.error(`Players weren't notified: ${e.message ?? e}`); }
    finally { setSending(false); }
  };

  const generate = async () => {
    if (!meta) return;
    const ko = seeded.some((d) => proposals.has(d.group));
    if (!window.confirm(`This creates ${preview?.total ?? 0} game${preview?.total === 1 ? "" : "s"} now${ko ? " — exactly the Round 1 matches listed above. Later knockout rounds are only proposed and confirmed week by week in Manage Tournament" : ""}. You will be asked whether to notify players after it is saved. Continue?`)) return;
    setBusy(true);
    try {
      await assertNotDiamondTournament(tournamentId);
      const version = `v${Date.now().toString(36)}`;
      // Re-check against the freshest entries right before saving (server re-validates pairs too).
      await (supabase as any).rpc("step_reconcile_admin_entrants", { p_champ_id: tournamentId }).then(() => undefined, () => undefined);
      const { data: fresh } = await fromExt("club_champs_registrations").select("club_member_id, partner_member_id, status, division_choices, division_partners").eq("champ_id", tournamentId);
      const n = seeded.length;
      const drift = seeded.some((d) => unitsFor((fresh ?? []) as RegLite[], d.group, n, d.doubles).units.length !== d.units.length);
      if (drift) { toast.error("Entries changed since this preview — the preview has been refreshed. Check it and generate again."); await load(); return; }
      const spec = finalDrawSpec(meta.name, seeded, version, poolMode);
      { // Tie-break rules from the setup (device answers, else the plan saved on the tournament).
        const { data: lt } = await fromExt("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle();
        const plan: any = readStepPlan(clubId, tournamentId) ?? (lt as any)?.beta_lifecycle?.format_plan ?? null;
        spec.tieBreaks = normaliseTieBreaks(plan?.tieBreaks);
      }
      const entries = seeded.flatMap((d) => d.units.map((u, k) => ({ member: u.member, partner: u.partner, group: d.group, order: k })));
      const { error } = await (supabase as any).rpc("step_prepare_draw", { p_champ_id: tournamentId, p_spec: spec, p_entries: entries, p_rebuild: hasDraw });
      if (error) throw new Error(error.message);
      // Cross-league: standings attribute games to each pair's own league (existing Club Champs cross-league view).
      if (seeded.some((d) => d.format.kind === "cross")) await fromExt("tournaments").update({ round_format: "cross_league" }).eq("id", tournamentId);
      const rows = await atomically(supabaseDb, tournamentId, commitStructured, (db) => generateStructuredTournament(db, tournamentId));
      const games = Array.isArray(rows) ? rows.filter((r: any) => r.player_a_member_id && r.player_b_member_id).length : preview?.total ?? 0;
      toast.success(`Draw saved — ${games} games created`);
      // Complete structure: predefined play-off stages get provisional TBD fixtures now (placeholders, no players).
      try { const ph = await syncPlayoffPlaceholders(tournamentId); if (ph.created) toast.success(`${ph.created} play-off fixtures added (players to be decided)`); }
      catch (e: any) { toast.error(`Play-off fixtures not added: ${e.message ?? e}`); }
      // Universal fixed-stage rule: games of any fixed date/window/courts stage get real slots before any notice.
      for (const r of await allocateAllFixedStages(tournamentId)) {
        if (r.issues?.length) toast.error(`Games not given times — ${r.issues.join(" ")} Add courts, widen the time window or add a match date.`);
        else if (r.overflow.length) toast.error(`${r.label}: ${r.required} games need a slot but only ${r.available} fit — widen the time window or add courts.`);
      }
      try { reportSessions(await applySetupSessions(supabase, tournamentId)); }
      catch (e: any) { toast.error(`Games not placed on courts: ${e.message ?? e}`); }
      {
        // Reuse the existing round-draw notice (opponent, phone, play-by date) via the tournament's channels.
        // Never sent automatically: ask the organiser now (unless setup chose Off).
      }
      setConfirmed(false); setRebuildOk(false);
      await load();
      onGenerated({ games });
      if (notifyDraw) { setAskSend({ after: true }); return; }
      // Success only: take the organiser straight to this tournament's fixtures/games view.
      navigate(fixturesUrl());
    } catch (e: any) {
      toast.error(String(e.message ?? e).replace(/^.*?(draw_exists|results_exist|pair_integrity|stale_entry):\s*/, ""));
      await load();
    } finally { setBusy(false); }
  };

  if (loading) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading current entries…</div>;

  // Running tournament (any game played or started): setup never proposes, previews or creates fixtures again.
  if (existing.played > 0) {
    const q = new URLSearchParams({ tab: "champs", manage: tournamentId });
    const club = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("club") : null;
    if (club) q.set("club", club);
    return (
      <div className="space-y-2 rounded border border-primary/50 bg-primary/10 p-3 text-xs" data-testid="draw-running-notice">
        <div className="font-medium">Tournament is running · {existing.games} game{existing.games === 1 ? "" : "s"} saved · {existing.played} played or started</div>
        <p>Round pairings and fixture approvals are managed in Manage Tournament. Structural settings (pace, pairing strategy, pools, play-by dates, play-off stages) can still be reviewed here, but saving them never regenerates or deletes existing games. If a change would no longer fit the running draw, make it from Manage Tournament instead.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild><Link to={`/club-admin?${q.toString()}`}>Go to Manage Tournament<ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
          <Button size="sm" variant="outline" asChild><Link to={`/club-champs/${tournamentId}`}>Open draw & results</Link></Button>
        </div>
      </div>
    );
  }
  // A saved but unplayed draw is only re-proposed when the organiser explicitly chooses to replace it.
  const showProposal = !hasDraw || rebuildOk;

  return (
    <div className="space-y-3 text-xs">
      <DrawNoticeEditor value={drawMessage} onChange={setDrawMessage} disabled={sending} />
      {hasDraw && (
        <div className="rounded border border-primary/50 bg-primary/10 p-2 space-y-1">
          <div className="font-medium">Draw saved · {existing.games} game{existing.games === 1 ? "" : "s"}{existing.played ? ` · ${existing.played} played or started` : " · none played yet"}</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild><Link to={`/club-champs/${tournamentId}`}>Open draw & fixtures<ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
            <Button size="sm" variant="outline" asChild><Link to={`/beta-tournament/${tournamentId}`}>Manage stages / play-offs</Link></Button>
            <Button size="sm" variant="outline" onClick={() => setAskSend({ after: false })}>Send draw to players</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={placeOnCourts}>Place games on courts (as per setup)</Button>
            {existing.played === 0 && !rebuildOk && <Button size="sm" variant="destructive" onClick={() => setRebuildOk(true)}>Make a new draw (replace this one)</Button>}
          </div>
          <p className="text-muted-foreground">Results are entered on the draw page as usual. Play-off stages you planned are kept as "Define later" and are set up from Manage stages once the first stage finishes.</p>
        </div>
      )}

      {(seeded.some((d) => d.format.schedule.rule === "fixed") || hasDraw) && (
        <SchedulingPreferencesSection tournamentId={tournamentId} categories={seeded.map((d) => ({ group: d.group, label: d.label }))} previewGames={timedPreview} useSaved={hasDraw && !rebuildOk} onFeasible={setSchedOk} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{hasDraw ? "Rebuild the draw (optional)" : "Confirm final format"} — using the {seeded.reduce((s, d) => s + d.units.length, 0)} current entries</div>
      </div>
      <p className="text-muted-foreground">Only current active entries are used; replaced or withdrawn players are left out. Outstanding fees don't exclude anyone because entries here are confirmed without payment. Doubles pairs are kept exactly as you paired them.</p>

      {errors.length > 0 && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-2">
          <div className="flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3" />Can't generate yet</div>
          <ul className="list-disc pl-4">{[...new Set(errors)].map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {!(hasDraw && existing.played > 0) && (
        <div className="space-y-2 rounded border border-primary/40 bg-primary/5 p-3" data-testid="draw-action-panel">
          {hasDraw && existing.played === 0 && (
            <label className="flex items-start gap-2"><Checkbox checked={rebuildOk} onCheckedChange={(v) => setRebuildOk(!!v)} />
              <span>Replace the existing draw: all {existing.games} unplayed games are deleted and a new draw is made from the current entries. No results are lost (none exist). Players who already saw their games should be told.</span></label>
          )}
          <label className="flex items-start gap-2"><Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} /><span>I confirm this is the final format for these entries.</span></label>
          {false && <label className="flex items-start gap-2"><Checkbox checked={notifyDraw} onCheckedChange={(v) => setNotifyDraw(!!v)} /><span>{hasDraw ? "New draw — " : ""}Tell players their Round 1 opponent (name and phone number, and in doubles their partner too), the play-by date, and — when every round was drawn upfront — all rounds and their booking dates, so they can book all their courts at once (uses the tournament's message channels).</span></label>}
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!canGenerate} onClick={generate}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{hasDraw ? "Rebuild draw & fixtures" : "Generate draw & fixtures"}</Button>
            {hasDraw && <Button type="button" variant="outline" onClick={() => navigate(fixturesUrl())}>Go to Fixtures</Button>}
          </div>
          {!canGenerate && !busy && (
            <p className="text-muted-foreground" data-testid="draw-blocked-reason">
              To {hasDraw ? "rebuild" : "generate"}: {[
                hasDraw && !rebuildOk && "tick \"Replace the existing draw\" above",
                !confirmed && "tick \"I confirm this is the final format\"",
                errors.length > 0 && "fix the red items listed above",
                !schedOk && "make the court times fit (see scheduling box above)",
              ].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      )}

      {seedFull && createPortal(
        <div className="dark fixed inset-0 z-50 flex flex-col gap-2 overflow-auto bg-background p-3 text-xs" role="dialog" aria-modal="true" aria-label="Seeds and pools — full screen">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">Seeds & pools — {seeded.reduce((s, d) => s + d.units.length, 0)} entries</span>
            <Button size="sm" variant="outline" onClick={() => setSeedFull(false)}><Minimize2 className="mr-1 h-3.5 w-3.5" />Exit full screen</Button>
          </div>
          <p className="text-muted-foreground">All groups side by side. Change seed order with ↑↓, move players between pools with drag or "Move to pool" — changes apply here and on the page behind.</p>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" data-testid="seed-board">
            {seeded.filter((d) => d.units.length > 0 && (d.format.kind === "pools" || isPooledKnockout(d.format))).map((d) => (
              <div key={d.group} className="flex flex-col rounded border border-border p-1.5">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold">{d.label}</span>
                  <span className="text-muted-foreground">{d.units.length} {d.doubles ? "pairs" : "players"}</span>
                </div>
                {poolEditor(d)}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}

      <div className="rounded border border-border" data-testid="draw-category-summary">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-1">
          <span className="font-medium">Categories (from setup — read only)</span>
          {onEditSetup && <Button type="button" size="sm" variant="outline" className="h-7" onClick={onEditSetup}>Change in setup</Button>}
        </div>
        <table className="w-full text-left">
          <thead className="text-muted-foreground"><tr><th className="px-2 py-1 font-normal">Category</th><th className="px-2 py-1 font-normal">Entries</th><th className="px-2 py-1 font-normal">Draw format</th><th className="px-2 py-1 font-normal">Match format</th></tr></thead>
          <tbody>
            {seeded.map((d, i) => {
              const f = d.format;
              const issues = divisionIssues(d, divs);
              const pr = d.poolReview;
              const kind = f.kind ? (f.kind === "knockout" && isPooledKnockout(f) ? "Knockout within pools" : KIND_LABEL[f.kind]) : "Not set";
              const extra = f.kind === "pools" || isPooledKnockout(f) ? ` · ${f.pools} pools` : f.kind === "swiss" ? ` · ${f.swissRounds} rounds` : f.kind === "cross" ? " · vs other groups" : "";
              return (
                <tr key={d.group} className="border-t border-border align-top">
                  <td className="px-2 py-1 font-medium">{d.label}
                    {d.playoffs.length > 0 && <div className="font-normal text-muted-foreground">Play-offs: {d.playoffs.join(" → ")}</div>}
                    {issues.length > 0 && <div className="font-normal text-destructive">Fix in setup: {issues.join(" · ")}</div>}
                    {pr && pr.mode !== "none" && f.kind !== "cross" && !d.poolAccepted && <div className="font-normal text-destructive">Pools not confirmed. <button type="button" className="underline" onClick={() => acceptPools([i])}>Confirm setup pools</button></div>}
                  </td>
                  <td className="px-2 py-1">{d.units.length} {d.doubles ? "pairs" : "players"}</td>
                  <td className="px-2 py-1">{kind}{extra}</td>
                  <td className="px-2 py-1">{d.scoringText ?? <span className="text-muted-foreground">Not set</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {crossPairs.length > 0 && (
        <div className="rounded border border-border p-2" aria-label="Cross-league matchups">
          <div className="font-medium">Cross-league matchups — exactly these groups meet</div>
          <ul className="mt-1 space-y-0.5">{crossPairs.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="text-muted-foreground">No other cross-group games and no games within a group.</p>
        </div>
      )}
      {preview && errors.length === 0 && showProposal && (
        <div className="rounded border border-border bg-muted/40 p-2">
          <div className="font-medium">Preview — {preview.total} games will be created</div>
          <ul className="mt-1 space-y-0.5">{preview.divisions.map((p) => (
            <li key={p.label}>{p.label}: {p.units} entries{p.pools > 1 ? ` in ${p.pools} ${seeded.some((d) => d.format.kind === "cross" && p.label.includes(" v ")) ? "groups" : "pools"}` : ""} · {p.games} games over {p.rounds} round{p.rounds === 1 ? "" : "s"}{p.byes ? ` · ${p.byes} bye${p.byes === 1 ? "" : "s"}` : ""}</li>
          ))}</ul>
          <details className="mt-1"><summary className="cursor-pointer text-primary">Games per round</summary>
            {preview.divisions.map((p) => <div key={p.label} className="mt-1"><span className="font-medium">{p.label}:</span> {p.perRound.map((r) => `R${r.round} ${r.games}`).join(" · ")}</div>)}
          </details>
          <p className="mt-1 text-muted-foreground">Games are placed into the court times shown under "Schedule fits" above. No new court bookings are made and players are not messaged by this step.</p>
        </div>
      )}
      <Dialog open={!!askSend} onOpenChange={(o) => { if (!o) closeAsk(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send draw to players now?</DialogTitle>
            <DialogDescription>This wording goes to Round 1 players with a button to the tournament draw and match details. Nothing has been sent yet.</DialogDescription>
          </DialogHeader>
          <DrawNoticeEditor value={drawMessage} onChange={setDrawMessage} disabled={sending} />
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><Checkbox checked={sendCh.app} onCheckedChange={(v) => setSendCh((c) => ({ ...c, app: !!v }))} />In-app</label>
            <label className="flex items-center gap-2"><Checkbox checked={sendCh.email} onCheckedChange={(v) => setSendCh((c) => ({ ...c, email: !!v }))} />Email</label>
            {waEnabled && <label className="flex items-center gap-2"><Checkbox checked={sendCh.wa} onCheckedChange={(v) => setSendCh((c) => ({ ...c, wa: !!v }))} />WhatsApp</label>}
          </div>
          <p className="text-sm text-muted-foreground">Each player's fee status is always added: "Your fee has been paid", or "Your fee is outstanding" with a <b>Pay my fee</b> button. Entered is not the same as paid. Skipped when there is no entry fee.</p>
          <div className="space-y-1 text-sm" data-testid="draw-recipient-picker">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Send to {picked.size} of {recips?.length ?? 0} players</span>
              <span className="flex gap-2 text-xs">
                <button type="button" className="text-primary underline" onClick={() => setPicked(new Set((recips ?? []).map((r) => r.id)))}>All</button>
                <button type="button" className="text-primary underline" onClick={() => setPicked(new Set())}>None</button>
              </span>
            </div>
            {!recips ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading players…</div> : (
              <div className="grid max-h-48 grid-cols-1 gap-1 overflow-auto rounded border border-border p-2 sm:grid-cols-2">
                {recips.map((r) => <label key={r.id} className="flex items-center gap-2 text-xs"><Checkbox checked={picked.has(r.id)} onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })} />{r.name}</label>)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAsk} disabled={sending}>Not now</Button>
            <Button onClick={sendDraw} disabled={sending || !drawMessage.trim() || !picked.size || (!sendCh.app && !sendCh.email && !(sendCh.wa && waEnabled))}>{sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Send now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {revisiting && null}
    </div>
  );
}

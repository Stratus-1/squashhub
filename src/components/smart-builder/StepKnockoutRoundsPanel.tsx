/**
 * Knockout rounds (Manage Tournament) — week-by-week operation of every knockout
 * category: who is still in, what the current round should be, how many
 * eliminations remain and whether the category is on track for its milestone.
 *
 * Only the CURRENT round is ever proposed or created; nothing is pre-created on
 * the assumption of a winner. Played/scored fixtures are never touched.
 * Logic lives in `src/lib/tournaments/paced-knockout.ts`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { unitKeyOf } from "@/lib/smart-builder/step-draw";
import { notifyRoundDraw, roundNotifySummary } from "@/lib/tournaments/round-notify";
import {
  activeField, byRank, isDecided, koRoundState, milestoneFor, pacePlan, playoffSteps, proposePairings, roundsLeftFor,
  type FieldEntry, type KoRoundState, type KnockoutPace, type KnockoutPairing,
} from "@/lib/tournaments/paced-knockout";

const INACTIVE_REG = new Set(["declined", "withdrawn", "cancelled", "removed"]);
const COPY_KEYS = ["stage", "stage_key", "section_number", "division_id", "stage_id"] as const;

type Div = { group: number; label: string; pools: string[][] | null; poolTarget: number | null };
type PoolCtx = { index: number; members: Set<string>; target: number };
const lead = (unit: string) => unit.split("+")[0];

/** Shared loader for the knockout control panel and the Standings "What's next" shortcut. */
export async function fetchKoRoundsData(tournamentId: string) {
      const [{ data: t }, { data: matches }, { data: regs }] = await Promise.all([
        fromExt("tournaments").select("builder_spec").eq("id", tournamentId).maybeSingle(),
        fromExt("club_champs_matches").select("*").eq("champ_id", tournamentId),
        fromExt("club_champs_registrations").select("club_member_id, partner_member_id, status, division_choices").eq("champ_id", tournamentId),
      ]);
      const spec: any = (t as any)?.builder_spec;
      const divs: Div[] = ((spec?.divisions ?? []) as any[])
        .filter((d) => d?.stages?.[0]?.kind === "knockout")
        .map((d, i) => {
          const st = d.stages[0];
          const pools = st?.paced?.perPool && Array.isArray(st.poolMembers) && st.poolMembers.length > 1 ? (st.poolMembers as string[][]) : null;
          return { group: Number(d.groupNumber ?? i + 1), label: String(d.label ?? `Division ${i + 1}`), pools, poolTarget: pools ? Number(st.paced.poolTarget) || 1 : null };
        });
      const ids = [...new Set([
        ...((regs ?? []) as any[]).flatMap((r) => [r.club_member_id, r.partner_member_id]),
        ...((matches ?? []) as any[]).flatMap((m) => [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id]),
      ].filter(Boolean))];
      const { data: mem } = ids.length ? await supabase.from("club_members").select("id, name, ladder_position").in("id", ids) : { data: [] as any[] };
      return {
        divs, matches: (matches ?? []) as any[], regs: (regs ?? []) as any[],
        members: new Map(((mem ?? []) as any[]).map((m) => [m.id, { name: m.name as string, ladder: (m.ladder_position ?? null) as number | null }])),
      };
}
export type KoRoundsData = Awaited<ReturnType<typeof fetchKoRoundsData>>;

export function StepKnockoutRoundsPanel({ tournamentId, plan }: { tournamentId: string; plan: Record<string, any> | null | undefined }) {
  const { data } = useQuery({
    queryKey: ["step-ko-rounds", tournamentId],
    refetchInterval: 30000,
    queryFn: () => fetchKoRoundsData(tournamentId),
  });
  // Deep link from Standings ("Review & approve next round"): scroll to ?ko=<group>.
  const [params] = useSearchParams();
  const focus = params.get("ko");
  useEffect(() => {
    if (!data || !focus) return;
    const t = setTimeout(() => document.getElementById(`ko-div-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => clearTimeout(t);
  }, [!!data, focus]);
  if (!data || data.divs.length === 0) return null;
  return (
    <div className="space-y-3" data-testid="knockout-rounds">
      <div className="text-sm font-semibold">Knockout rounds</div>
      {data.divs.map((d) => d.pools ? <PooledDivision key={d.group} tournamentId={tournamentId} plan={plan} div={d} data={data} />
        : <DivisionRounds key={d.group} tournamentId={tournamentId} plan={plan} div={d} data={data} />)}
    </div>
  );
}

type Data = { matches: any[]; regs: any[]; members: Map<string, { name: string; ladder: number | null }> };
export type { Div as KoDiv };

/**
 * Knockout inside pools: each pool is eliminated down to its qualifiers (never round robin, never across pools).
 * Once every pool is down to its target, the combined survivors continue towards the play-off milestone.
 */
function PooledDivision({ tournamentId, plan, div, data }: { tournamentId: string; plan: Record<string, any> | null | undefined; div: Div; data: Data }) {
  const pools = div.pools!;
  const ctxs: PoolCtx[] = pools.map((p, i) => ({ index: i, members: new Set(p.map(lead)), target: div.poolTarget ?? 1 }));
  const remaining = ctxs.map((c) => {
    const rows = data.matches.filter((m) => Number(m.group_number) === div.group && Number(m.pool_number) === c.index + 1);
    const ents = data.regs.filter((r) => c.members.has(r.club_member_id) && !INACTIVE_REG.has(String(r.status || "").toLowerCase())).map((r) => ({ id: r.club_member_id, partnerId: r.partner_member_id ?? null }));
    return activeField(ents, rows).active.length;
  });
  const poolsDone = remaining.every((n) => n <= (div.poolTarget ?? 1));
  return (
    <div id={`ko-div-${div.group}`} className="scroll-mt-20 space-y-2 rounded-lg border border-border p-3" data-field={`ko-pooled-${div.group}`}>
      <div className="text-sm font-medium">{div.label} · knockout in {pools.length} pools</div>
      <p className="text-xs text-muted-foreground">Each pool is knocked down to {div.poolTarget} — losers are eliminated within their pool; pools never play each other until the play-off. {poolsDone ? "All pools are complete — the play-off runs from the combined survivors below." : ""}</p>
      {poolsDone ? <DivisionRounds tournamentId={tournamentId} plan={plan} div={div} data={data} />
        : ctxs.map((c) => <DivisionRounds key={c.index} tournamentId={tournamentId} plan={plan} div={div} data={data} pool={c} />)}
    </div>
  );
}

/**
 * One knockout unit (category, or a pool inside it): active field, milestone and the single
 * round state. Pure — shared by the Manage panel and the Standings shortcut so they cannot disagree.
 */
export function computeKoUnit({ plan, div, data, pool, today }: { plan: Record<string, any> | null | undefined; div: Div; data: Data; pool?: PoolCtx; today: string }) {
  const key = unitKeyOf(div.label);
  const fmt: any = plan?.formatOverrides?.[key] ?? plan?.formatOverrides?.[key.split("::")[0]] ?? plan?.format ?? {};
  // Missing values default to paced + progressive (the recommended knockout behaviour).
  const pace: KnockoutPace = fmt.koPace === "immediate" ? "immediate" : "paced";
  const pairing: KnockoutPairing = fmt.koPairing === "traditional" ? "traditional" : "progressive";
  const poolNo = pool ? pool.index + 1 : null;
  const rows = data.matches.filter((m) => Number(m.group_number) === div.group && (poolNo == null || Number(m.pool_number) === poolNo) && (m.player_a_member_id || m.player_b_member_id));
  const entrants: FieldEntry[] = data.regs
    .filter((r) => !INACTIVE_REG.has(String(r.status || "").toLowerCase()) && (pool ? pool.members.has(r.club_member_id) : (r.division_choices ?? []).map(Number).includes(div.group)))
    .map((r) => ({ id: r.club_member_id, partnerId: r.partner_member_id ?? null }));
  const f = activeField(entrants, rows);
  const rank = (e: FieldEntry) => ({ ...e, rank: data.members.get(e.id)?.ladder ?? null });
  const field = { ...f, active: byRank(f.active.map(rank)), eliminated: f.eliminated };
  const baseMilestone = milestoneFor(plan as any, key);
  // In a pool, the milestone is the pool's own qualifier count, paced over the same scheduling rounds.
  const milestone = pool ? { ...baseMilestone, label: `Pool ${String.fromCharCode(65 + pool.index)} down to ${pool.target}`, fieldSize: pool.target } : baseMilestone;
  const reached = milestone.fieldSize != null && field.active.length <= milestone.fieldSize;
  const poolDone = !!pool && reached;
  const target = reached ? null : milestone.fieldSize;
  const roundsLeft = reached ? null : roundsLeftFor(milestone, field.lastRound);
  const basePlan = pacePlan({ active: field.active.length, target, roundsLeft, pace, milestoneLabel: milestone.label });
  const nextRound = field.lastRound + 1;
  const steps = playoffSteps(plan as any, key);
  // One state machine: reaching the field size never opens a play-off stage by itself.
  const ks: KoRoundState = pool
    ? (reached ? { kind: "no_elimination", label: `Round ${nextRound}` } : basePlan.thisRound > 0 ? { kind: "pre_round", label: `Round ${nextRound}`, count: basePlan.thisRound } : { kind: "no_elimination", label: `Round ${nextRound}` })
    : koRoundState({ active: field.active.length, nextRound, milestone, steps, plan: basePlan, today });
  const pp = { ...basePlan, thisRound: ks.kind === "pre_round" || ks.kind === "playoff" ? ks.count : 0 };
  const nextLabel = ks.kind === "waiting_for_stage" ? ks.stage : ks.label;
  const playBy = ks.kind === "pre_round" ? milestone.roundDates[nextRound - 1] ?? null : ks.kind === "playoff" ? steps.find((s) => s.label === ks.label)?.date ?? null : null;
  const winner = field.active.length === 1 && field.eliminated.length > 0 ? field.active[0] : null;
  const openFixtures = field.roundOpen ? rows.filter((m) => Number(m.round_number) === field.lastRound && !m.is_bye && !isDecided(m)).length : 0;
  return { pace, pairing, rows, field, milestone, reached, poolDone, target, roundsLeft, nextRound, steps, ks, pp, nextLabel, playBy, winner, openFixtures };
}

export type KoAction =
  | { kind: "approve"; label: string; count: number; playBy: string | null }
  | { kind: "results_outstanding"; round: number; open: number }
  | { kind: "waiting_for_stage"; stage: string; date: string | null; fieldReady: boolean }
  | { kind: "idle" }
  | { kind: "decided" };

/** What a category needs from the admin right now, using exactly the Manage panel's state machine. */
export function koDivisionActions(data: KoRoundsData, plan: Record<string, any> | null | undefined, today: string): Array<{ group: number; label: string; unit: string; action: KoAction }> {
  const out: Array<{ group: number; label: string; unit: string; action: KoAction }> = [];
  const toAction = (u: ReturnType<typeof computeKoUnit>): KoAction =>
    u.winner ? { kind: "decided" }
      : u.field.roundOpen ? { kind: "results_outstanding", round: u.field.lastRound, open: u.openFixtures }
      : u.ks.kind === "waiting_for_stage" ? { kind: "waiting_for_stage", stage: u.ks.stage, date: u.ks.date, fieldReady: u.ks.reason === "field_ready" }
      : u.pp.thisRound > 0 && !u.poolDone ? { kind: "approve", label: u.nextLabel, count: u.pp.thisRound, playBy: u.playBy }
      : { kind: "idle" };
  for (const div of data.divs) {
    if (div.pools) {
      const ctxs: PoolCtx[] = div.pools.map((p, i) => ({ index: i, members: new Set(p.map(lead)), target: div.poolTarget ?? 1 }));
      const units = ctxs.map((c) => computeKoUnit({ plan, div, data, pool: c, today }));
      if (units.every((u) => u.reached)) out.push({ group: div.group, label: div.label, unit: div.label, action: toAction(computeKoUnit({ plan, div, data, today })) });
      else units.forEach((u, i) => out.push({ group: div.group, label: div.label, unit: `${div.label} · Pool ${String.fromCharCode(65 + i)}`, action: toAction(u) }));
    } else out.push({ group: div.group, label: div.label, unit: div.label, action: toAction(computeKoUnit({ plan, div, data, today })) });
  }
  return out;
}

function DivisionRounds({ tournamentId, plan, div, data, pool }: {
  tournamentId: string; plan: Record<string, any> | null | undefined; div: Div; data: Data; pool?: PoolCtx;
}) {
  const qc = useQueryClient();
  const u = useMemo(() => computeKoUnit({ plan, div, data, pool, today: new Date().toISOString().slice(0, 10) }), [plan, div, data, pool]);
  const { pace, pairing, rows, field, milestone, reached, poolDone, target, roundsLeft, nextRound, steps, ks, pp, nextLabel, playBy } = u;
  const nameOf = (id?: string | null) => (id ? data.members.get(id)?.name ?? "Player" : "—");
  const poolNo = pool ? pool.index + 1 : null;

  const proposal = useMemo(() => proposePairings(field.active, pp.thisRound, pairing), [field.active, pp.thisRound, pairing]);
  const [pairs, setPairs] = useState<Array<[string, string]>>([]);
  const sig = proposal.pairs.map(([a, b]) => `${a.id}-${b.id}`).join(",");
  useEffect(() => { setPairs(proposal.pairs.map(([a, b]) => [a.id, b.id])); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sig]);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const used = pairs.flat();
  const dup = used.length !== new Set(used).size;
  const incomplete = pairs.some(([a, b]) => !a || !b || a === b);
  const waiting = field.active.filter((e) => !used.includes(e.id));
  const winner = u.winner;

  const confirm = async () => {
    if (!pairs.length || dup || incomplete) return;
    if (inFlight.current) return; inFlight.current = true;
    setSaving(true);
    try {
      const { data: fresh, error: fe } = await fromExt("club_champs_matches").select("id, round_number, pool_number, player_a_member_id, player_b_member_id, status, winner_member_id, is_bye").eq("champ_id", tournamentId).eq("group_number", div.group);
      if (fe) throw fe;
      const real = ((fresh ?? []) as any[]).filter((m) => (m.player_a_member_id || m.player_b_member_id) && (poolNo == null || Number(m.pool_number) === poolNo));
      if (real.some((m) => Number(m.round_number) >= nextRound)) throw new Error("This round already has fixtures — refresh to see them.");
      const template: any = { ...(rows[0] ?? {}) };
      const partner = (id: string) => field.active.find((e) => e.id === id)?.partnerId ?? null;
      // Structured games must carry division/stage/round identity. Resolve it from the
      // tournament's own structure (never from an earlier game, which may not exist yet).
      const { data: divRows, error: de } = await fromExt("tournament_divisions").select("id, spec_key, sort_order").eq("tournament_id", tournamentId);
      if (de) throw de;
      const divRow: any = (divRows ?? []).find((d: any) => d.spec_key === `g${div.group}`)
        ?? (template.division_id ? (divRows ?? []).find((d: any) => d.id === template.division_id) : null);
      if (divRow) {
        const { data: stRows, error: se } = await fromExt("tournament_stages").select("id, kind, label, spec_key, stage_order").eq("division_id", divRow.id).order("stage_order");
        if (se) throw se;
        const stages = (stRows ?? []) as any[];
        const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z]/g, "").replace(/s$/, "");
        const formal = ks.kind === "playoff" ? stages.find((s) => norm(s.label) === norm(nextLabel)) : null;
        const stage = formal ?? stages.find((s) => s.id === template.stage_id) ?? stages.find((s) => s.kind === "knockout") ?? stages[0];
        if (stage) {
          template.division_id = divRow.id;
          template.stage_id = stage.id;
          template.stage_key = stage.spec_key ?? template.stage_key ?? null;
        }
      }
      if (!template.division_id || !template.stage_id) throw new Error("This category has no knockout stage set up yet — reopen setup and generate the draw.");
      let roundId: string | null = null;
      {
        const { data: ex, error: re } = await fromExt("club_champs_rounds").select("id").eq("champ_id", tournamentId).eq("stage_id", template.stage_id).eq("round_number", nextRound).maybeSingle();
        if (re) throw re;
        roundId = (ex as any)?.id ?? null;
        if (!roundId) {
          const { data: cr, error: ce } = await fromExt("club_champs_rounds").insert({
            champ_id: tournamentId, group_number: div.group, section_number: 1, round_number: nextRound, label: nextLabel,
            round_type: ks.kind !== "playoff" ? "knockout" : /semi/i.test(nextLabel) ? "semi_final" : /^final/i.test(nextLabel) ? "final" : "knockout", play_by: playBy, status: "active", scheduling_mode: "self",
            division_id: template.division_id, stage_id: template.stage_id, stage_key: template.stage_key ?? null,
          } as any).select("id").single();
          if (ce) throw ce;
          roundId = (cr as any).id;
        }
      }
      const insert = pairs.map(([a, b], i) => ({
        champ_id: tournamentId, group_number: div.group, stage: "ko", round_id: roundId,
        ...Object.fromEntries(COPY_KEYS.filter((k) => template[k] != null).map((k) => [k, template[k]])),
        round_number: nextRound, bracket_position: i + 1, stage_label: nextLabel, pool_number: poolNo,
        player_a_member_id: a, partner_a_member_id: partner(a), player_b_member_id: b, partner_b_member_id: partner(b),
        is_bye: false, status: "scheduled", play_by: playBy,
      }));
      const { error } = await fromExt("club_champs_matches").insert(insert as any);
      if (error) throw error;
      toast.success(`${insert.length} fixture${insert.length === 1 ? "" : "s"} confirmed for ${nextLabel}.`);
      try {
        const res = await notifyRoundDraw({ champId: tournamentId, roundNumber: nextRound, groupNumber: div.group });
        if (res.sent > 0) toast.success(roundNotifySummary(res));
      } catch (e: any) { toast.warning(`Fixtures created, but players were not notified: ${e?.message || "unknown error"}`); }
      qc.invalidateQueries({ queryKey: ["step-ko-rounds", tournamentId] });
      qc.invalidateQueries({ queryKey: ["step-run", tournamentId] });
    } catch (e: any) {
      toast.error(e?.message || "Could not confirm fixtures");
    } finally { inFlight.current = false; setSaving(false); }
  };

  const status = winner ? "done" : ks.kind === "waiting_for_stage" ? "done" : pp.status;
  const badge: Record<string, { text: string; cls: string }> = {
    on_track: { text: "On track", cls: "bg-primary/10 text-primary" },
    at_risk: { text: "At risk", cls: "bg-accent text-accent-foreground" },
    behind: { text: "Behind schedule", cls: "bg-destructive/10 text-destructive" },
    done: { text: winner ? "Decided" : "Milestone reached", cls: "bg-muted text-foreground" },
    free: { text: "Own pace", cls: "bg-muted text-foreground" },
  };

  return (
    <div id={pool ? undefined : `ko-div-${div.group}`} className="scroll-mt-20 rounded-lg border border-border p-3 space-y-2 text-sm" data-field={`ko-div-${div.group}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{pool ? `Pool ${String.fromCharCode(65 + pool.index)}` : div.label}</span>
        <Badge variant="outline" className={cn("border-0", badge[status].cls)}>{badge[status].text}</Badge>
        <span className="text-xs text-muted-foreground">{pace === "paced" ? "Paced" : "Immediate"} · {pairing === "progressive" ? "Progressive pairing" : "Traditional seeded"}</span>
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>Still in: <span className="text-foreground font-medium">{field.active.length}</span> · Out: {field.eliminated.length}</div>
        <div>
          {milestone.source === "none" ? "No play-off milestone — runs at its own pace" : `${milestone.label}${milestone.date ? ` on ${milestone.date}` : ""} (${milestone.source === "shared" ? "shared tournament stage" : "own stage"})${steps.length ? ` · path: ${["Round 1…", ...steps.map((x) => x.label)].join(" → ")}` : ""}`}
        </div>
        {!reached && target != null && ks.kind === "pre_round" && <div>Eliminations still needed: <span className="text-foreground font-medium">{pp.needed}</span>{roundsLeft != null ? ` over ${roundsLeft} round${roundsLeft === 1 ? "" : "s"}` : ""}</div>}
      </div>
      {pp.warning && !winner && <p className="rounded bg-accent/40 px-2 py-1 text-xs">{pp.warning}</p>}

      {poolDone ? <p className="text-xs">Pool complete — qualifiers: {field.active.map((e) => nameOf(e.id)).join(", ")}. Waiting for the other pools before the play-off.</p>
        : winner ? <p>Winner: <span className="font-medium">{nameOf(winner.id)}</span></p>
        : field.roundOpen ? <p className="text-xs">Round {field.lastRound} is in play — {rows.filter((m) => Number(m.round_number) === field.lastRound && !m.is_bye && !isDecided(m)).length} fixture(s) still to finish. The next round is proposed once its results are in.</p>
        : ks.kind === "waiting_for_stage" ? <p className="text-xs" data-field="ko-waiting">{ks.reason === "field_ready" ? `${ks.stage} field ready` : `No elimination needed before ${ks.stage}`} — waiting for the {ks.stage} stage{ks.date ? ` on ${ks.date}` : ""}. Nothing is created until it opens.</p>
        : pp.thisRound === 0 ? <p className="text-xs text-muted-foreground">No elimination needed this round — everyone stays active.</p>
        : <div className="space-y-2">
            <div className="text-xs font-medium">Proposed {nextLabel}{playBy ? ` · play by ${playBy}` : ""} — {pp.thisRound} match{pp.thisRound === 1 ? "" : "es"}</div>
            {pairs.map(([a, b], i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                {[a, b].map((v, side) => (
                  <select key={side} aria-label={`Match ${i + 1} player ${side ? "B" : "A"}`} className="h-8 rounded border border-input bg-background px-2 text-xs"
                    value={v} onChange={(e) => setPairs(pairs.map((p, j) => j === i ? (side ? [p[0], e.target.value] : [e.target.value, p[1]]) as [string, string] : p))}>
                    <option value="">Choose…</option>
                    {field.active.map((e) => <option key={e.id} value={e.id}>{nameOf(e.id)}{e.rank ? ` (${e.rank})` : ""}</option>)}
                  </select>
                )).reduce((acc: any[], el, k) => k ? [...acc, <span key="v" className="text-xs">v</span>, el] : [el], [])}
                <Button type="button" size="sm" variant="ghost" onClick={() => setPairs(pairs.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            ))}
            {waiting.length > 0 && <p className="text-xs text-muted-foreground">Waiting this round (still active, not a loss): {waiting.map((e) => nameOf(e.id)).join(", ")}</p>}
            {dup && <p className="text-xs text-destructive">A player appears in two matches.</p>}
            <div className="flex flex-wrap gap-2">
              {waiting.length >= 2 && <Button type="button" size="sm" variant="outline" onClick={() => setPairs([...pairs, [waiting[waiting.length - 2].id, waiting[waiting.length - 1].id]])}>Add match</Button>}
              <Button type="button" size="sm" variant="outline" onClick={() => setPairs(proposal.pairs.map(([x, y]) => [x.id, y.id]))}>Reset to proposal</Button>
              <Button type="button" size="sm" disabled={saving || !pairs.length || dup || incomplete} onClick={confirm}>{saving ? "Confirming…" : `Confirm ${pairs.length} fixture${pairs.length === 1 ? "" : "s"}`}</Button>
            </div>
            {pairs.length !== pp.thisRound && pp.minimumNow > pairs.length && <p className="text-xs text-destructive">At least {pp.minimumNow} matches are needed this round to stay on schedule.</p>}
          </div>}
    </div>
  );
}

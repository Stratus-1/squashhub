/**
 * Knockout rounds (Manage Tournament) — week-by-week operation of every knockout
 * category: who is still in, what the current round should be, how many
 * eliminations remain and whether the category is on track for its milestone.
 *
 * Only the CURRENT round is ever proposed or created; nothing is pre-created on
 * the assumption of a winner. Played/scored fixtures are never touched.
 * Logic lives in `src/lib/tournaments/paced-knockout.ts`.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { unitKeyOf } from "@/lib/smart-builder/step-draw";
import { labelForActive } from "@/lib/tournaments/active-draw";
import { notifyRoundDraw, roundNotifySummary } from "@/lib/tournaments/round-notify";
import {
  activeField, byRank, isDecided, milestoneFor, pacePlan, proposePairings, roundsLeftFor,
  type FieldEntry, type KnockoutPace, type KnockoutPairing,
} from "@/lib/tournaments/paced-knockout";

const INACTIVE_REG = new Set(["declined", "withdrawn", "cancelled", "removed"]);
const COPY_KEYS = ["stage", "stage_key", "section_number"] as const;

type Div = { group: number; label: string; pools: string[][] | null; poolTarget: number | null };
type PoolCtx = { index: number; members: Set<string>; target: number };
const lead = (unit: string) => unit.split("+")[0];

export function StepKnockoutRoundsPanel({ tournamentId, plan }: { tournamentId: string; plan: Record<string, any> | null | undefined }) {
  const { data } = useQuery({
    queryKey: ["step-ko-rounds", tournamentId],
    refetchInterval: 30000,
    queryFn: async () => {
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
    },
  });
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
    <div className="space-y-2 rounded-lg border border-border p-3" data-field={`ko-pooled-${div.group}`}>
      <div className="text-sm font-medium">{div.label} · knockout in {pools.length} pools</div>
      <p className="text-xs text-muted-foreground">Each pool is knocked down to {div.poolTarget} — losers are eliminated within their pool; pools never play each other until the play-off. {poolsDone ? "All pools are complete — the play-off runs from the combined survivors below." : ""}</p>
      {poolsDone ? <DivisionRounds tournamentId={tournamentId} plan={plan} div={div} data={data} />
        : ctxs.map((c) => <DivisionRounds key={c.index} tournamentId={tournamentId} plan={plan} div={div} data={data} pool={c} />)}
    </div>
  );
}

function DivisionRounds({ tournamentId, plan, div, data, pool }: {
  tournamentId: string; plan: Record<string, any> | null | undefined; div: Div; data: Data; pool?: PoolCtx;
}) {
  const qc = useQueryClient();
  const key = unitKeyOf(div.label);
  const fmt: any = plan?.formatOverrides?.[key] ?? plan?.formatOverrides?.[key.split("::")[0]] ?? plan?.format ?? {};
  // Missing values default to paced + progressive (the recommended knockout behaviour).
  const pace: KnockoutPace = fmt.koPace === "immediate" ? "immediate" : "paced";
  const pairing: KnockoutPairing = fmt.koPairing === "traditional" ? "traditional" : "progressive";
  const nameOf = (id?: string | null) => (id ? data.members.get(id)?.name ?? "Player" : "—");

  const poolNo = pool ? pool.index + 1 : null;
  const rows = useMemo(() => data.matches.filter((m) => Number(m.group_number) === div.group && (poolNo == null || Number(m.pool_number) === poolNo) && (m.player_a_member_id || m.player_b_member_id)), [data.matches, div.group, poolNo]);
  const entrants: FieldEntry[] = useMemo(() => data.regs
    .filter((r) => !INACTIVE_REG.has(String(r.status || "").toLowerCase()) && (pool ? pool.members.has(r.club_member_id) : (r.division_choices ?? []).map(Number).includes(div.group)))
    .map((r) => ({ id: r.club_member_id, partnerId: r.partner_member_id ?? null })), [data.regs, div.group]);
  const field = useMemo(() => {
    const f = activeField(entrants, rows);
    const rank = (e: FieldEntry) => ({ ...e, rank: data.members.get(e.id)?.ladder ?? null });
    return { ...f, active: byRank(f.active.map(rank)), eliminated: f.eliminated };
  }, [entrants, rows, data.members]);

  const baseMilestone = useMemo(() => milestoneFor(plan as any, key), [plan, key]);
  // In a pool, the milestone is the pool's own qualifier count, paced over the same scheduling rounds.
  const milestone = pool ? { ...baseMilestone, label: `Pool ${String.fromCharCode(65 + pool.index)} down to ${pool.target}`, fieldSize: pool.target } : baseMilestone;
  const reached = milestone.fieldSize != null && field.active.length <= milestone.fieldSize;
  const poolDone = !!pool && reached;
  const target = reached ? null : milestone.fieldSize;
  const roundsLeft = reached ? null : roundsLeftFor(milestone, field.lastRound);
  const basePlan = pacePlan({ active: field.active.length, target, roundsLeft, pace, milestoneLabel: milestone.label });
  const nextRound = field.lastRound + 1;
  const steps = useMemo(() => playoffSteps(plan as any, key), [plan, key]);
  const today = new Date().toISOString().slice(0, 10);
  // One state machine: reaching the field size never opens a play-off stage by itself.
  const ks: KoRoundState = pool
    ? (reached ? { kind: "no_elimination", label: `Round ${nextRound}` } : basePlan.thisRound > 0 ? { kind: "pre_round", label: `Round ${nextRound}`, count: basePlan.thisRound } : { kind: "no_elimination", label: `Round ${nextRound}` })
    : koRoundState({ active: field.active.length, nextRound, milestone, steps, plan: basePlan, today });
  const pp = { ...basePlan, thisRound: ks.kind === "pre_round" || ks.kind === "playoff" ? ks.count : 0 };
  const nextLabel = ks.kind === "waiting_for_stage" ? ks.stage : ks.label;
  const playBy = ks.kind === "pre_round" ? milestone.roundDates[nextRound - 1] ?? null : ks.kind === "playoff" ? steps.find((s) => s.label === ks.label)?.date ?? null : null;

  const proposal = useMemo(() => proposePairings(field.active, pp.thisRound, pairing), [field.active, pp.thisRound, pairing]);
  const [pairs, setPairs] = useState<Array<[string, string]>>([]);
  const sig = proposal.pairs.map(([a, b]) => `${a.id}-${b.id}`).join(",");
  useEffect(() => { setPairs(proposal.pairs.map(([a, b]) => [a.id, b.id])); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sig]);
  const [saving, setSaving] = useState(false);

  const used = pairs.flat();
  const dup = used.length !== new Set(used).size;
  const incomplete = pairs.some(([a, b]) => !a || !b || a === b);
  const waiting = field.active.filter((e) => !used.includes(e.id));
  const winner = field.active.length === 1 && field.eliminated.length > 0 ? field.active[0] : null;

  const confirm = async () => {
    if (!pairs.length || dup || incomplete) return;
    setSaving(true);
    try {
      const { data: fresh, error: fe } = await fromExt("club_champs_matches").select("id, round_number, pool_number, player_a_member_id, player_b_member_id, status, winner_member_id, is_bye").eq("champ_id", tournamentId).eq("group_number", div.group);
      if (fe) throw fe;
      const real = ((fresh ?? []) as any[]).filter((m) => (m.player_a_member_id || m.player_b_member_id) && (poolNo == null || Number(m.pool_number) === poolNo));
      if (real.some((m) => Number(m.round_number) >= nextRound)) throw new Error("This round already has fixtures — refresh to see them.");
      const template: any = rows[0] ?? {};
      const partner = (id: string) => field.active.find((e) => e.id === id)?.partnerId ?? null;
      const insert = pairs.map(([a, b], i) => ({
        champ_id: tournamentId, group_number: div.group, section_number: 1, stage: "ko",
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
    } finally { setSaving(false); }
  };

  const status = winner ? "done" : pp.status;
  const badge: Record<string, { text: string; cls: string }> = {
    on_track: { text: "On track", cls: "bg-primary/10 text-primary" },
    at_risk: { text: "At risk", cls: "bg-accent text-accent-foreground" },
    behind: { text: "Behind schedule", cls: "bg-destructive/10 text-destructive" },
    done: { text: winner ? "Decided" : "Milestone reached", cls: "bg-muted text-foreground" },
    free: { text: "Own pace", cls: "bg-muted text-foreground" },
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2 text-sm" data-field={`ko-div-${div.group}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{pool ? `Pool ${String.fromCharCode(65 + pool.index)}` : div.label}</span>
        <Badge variant="outline" className={cn("border-0", badge[status].cls)}>{badge[status].text}</Badge>
        <span className="text-xs text-muted-foreground">{pace === "paced" ? "Paced" : "Immediate"} · {pairing === "progressive" ? "Progressive pairing" : "Traditional seeded"}</span>
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>Still in: <span className="text-foreground font-medium">{field.active.length}</span> · Out: {field.eliminated.length}</div>
        <div>
          {milestone.source === "none" ? "No play-off milestone — runs at its own pace" : `${milestone.label}${milestone.date ? ` on ${milestone.date}` : ""} (${milestone.source === "shared" ? "shared tournament stage" : "own stage"})`}
        </div>
        {!reached && target != null && <div>Eliminations still needed: <span className="text-foreground font-medium">{pp.needed}</span>{roundsLeft != null ? ` over ${roundsLeft} round${roundsLeft === 1 ? "" : "s"}` : ""}</div>}
      </div>
      {pp.warning && !winner && <p className="rounded bg-accent/40 px-2 py-1 text-xs">{pp.warning}</p>}

      {poolDone ? <p className="text-xs">Pool complete — qualifiers: {field.active.map((e) => nameOf(e.id)).join(", ")}. Waiting for the other pools before the play-off.</p>
        : winner ? <p>Winner: <span className="font-medium">{nameOf(winner.id)}</span></p>
        : field.roundOpen ? <p className="text-xs">Round {field.lastRound} is in play — {rows.filter((m) => Number(m.round_number) === field.lastRound && !m.is_bye && !isDecided(m)).length} fixture(s) still to finish. The next round is proposed once its results are in.</p>
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

/**
 * Step-by-Step Beta: the organiser overview once games exist. Everything is DERIVED from the stage lifecycle
 * (progression.ts — i.e. the games actually stored and their results), never from today's date or a manually
 * clicked "Activate" flag. Dates are play dates, not gates.
 */
import type { StageStatus } from "@/lib/tournaments/progression";
import type { LifecycleKey } from "./step-handover";

export type RunAction =
  | { kind: "resolve_tie"; status: StageStatus }
  | { kind: "generate"; status: StageStatus }
  | { kind: "setup"; status: StageStatus }
  | { kind: "auto_starting"; status: StageStatus }
  | { kind: "blocked"; status: StageStatus }
  | { kind: "in_play"; status: StageStatus }
  | { kind: "waiting"; status: StageStatus }
  | { kind: "complete"; division: string };

const isTie = (s: StageStatus) => s.state === "blocked" && /tied/i.test(s.detail);

/** One next meaningful action per competition path (division), most urgent first. */
export function runActions(states: StageStatus[]): RunAction[] {
  const byDiv = new Map<string, StageStatus[]>();
  for (const s of states) byDiv.set(s.divisionKey, [...(byDiv.get(s.divisionKey) ?? []), s]);
  const out: RunAction[] = [];
  for (const [, list] of byDiv) {
    const pick = (f: (s: StageStatus) => boolean) => list.find(f);
    let s: StageStatus | undefined;
    if ((s = pick(isTie))) out.push({ kind: "resolve_tie", status: s });
    else if ((s = pick((x) => x.state === "blocked"))) out.push({ kind: "blocked", status: s });
    else if ((s = pick((x) => x.state === "ready" && !x.automatic))) out.push({ kind: "generate", status: s });
    else if ((s = pick((x) => x.state === "ready" && x.automatic))) out.push({ kind: "auto_starting", status: s });
    else if ((s = pick((x) => x.state === "needs_setup"))) out.push({ kind: "setup", status: s });
    else if ((s = pick((x) => x.state === "active"))) out.push({ kind: "in_play", status: s });
    else if ((s = pick((x) => x.state === "waiting" || x.state === "deferred"))) out.push({ kind: "waiting", status: s });
    else out.push({ kind: "complete", division: list[0]?.divisionLabel ?? "" });
  }
  const rank: Record<RunAction["kind"], number> = { resolve_tie: 0, blocked: 1, generate: 2, setup: 3, auto_starting: 4, in_play: 5, waiting: 6, complete: 7 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

export const needsOrganiser = (a: RunAction) => ["resolve_tie", "blocked", "generate", "setup"].includes(a.kind);

/**
 * Lifecycle stage implied by the stored games. Once any game exists the tournament IS running (there is no
 * separate activation step); when every stage of every path is complete it is complete. Returns null when
 * no games exist yet (keep the saved stage).
 */
export function derivedLifecycle(states: StageStatus[], gameCount: number): LifecycleKey | null {
  if (!gameCount || !states.length) return null;
  return states.every((s) => s.state === "completed") ? "complete" : "running";
}

export function headline(a: RunAction): string {
  const s = "status" in a ? a.status : null;
  const who = s ? `${s.divisionLabel}: ` : `${(a as any).division}: `;
  switch (a.kind) {
    case "resolve_tie": return `${who}Action required — resolve a tie that decides who qualifies for ${s!.name}`;
    case "blocked": return `${who}${s!.name} can't be formed yet`;
    case "generate": return `${who}Ready — generate ${s!.name}`;
    case "setup": return `${who}Set up ${s!.name}`;
    case "auto_starting": return `${who}${s!.name} is starting automatically`;
    case "in_play": return `${who}${s!.name} in play (${s!.played}/${s!.total} decided)`;
    case "waiting": return `${who}Next: ${s!.name} — ${s!.detail}`;
    case "complete": return `${who}All stages complete`;
  }
}

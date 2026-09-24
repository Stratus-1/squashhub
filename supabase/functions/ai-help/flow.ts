// Pure helpers for the ai-help ask loop (no Deno/network deps, unit-tested).

export const MAX_STEPS = 8;
/** Don't START another AI step after this; an in-flight step is never aborted. */
export const STEP_BUDGET_MS = 40_000;

export const ESCALATED_ANSWER =
  "I've passed this to support with the details I found — you won't need to explain it again.";
export const BUDGET_ANSWER =
  "This is taking longer than expected, so I stopped. Nothing was changed — please try again or ask for a person.";

/** Decide whether the loop may run another model step. */
export function nextStepDecision(s: { step: number; startedAt: number; now: number; escalated: boolean }):
  "continue" | "stop_escalated" | "stop_budget" | "stop_max" {
  if (s.escalated) return "stop_escalated";
  if (s.step >= MAX_STEPS) return "stop_max";
  if (s.step > 0 && s.now - s.startedAt > STEP_BUDGET_MS) return "stop_budget";
  return "continue";
}

/** Rebuild the reply for a retried request that already has a stored result. */
export function replayStored(row: {
  id: string; kind: string; status: string; ticket_id?: string | null; preview?: unknown; result?: any;
}): Record<string, unknown> {
  if (row.kind === "action" && row.status === "proposed" && row.preview) {
    return { answer: "Here's exactly what I'd change. Nothing happens until you confirm.", preview: row.preview, interactionId: row.id, replayed: true };
  }
  if (row.ticket_id) return { answer: ESCALATED_ANSWER, ticketId: row.ticket_id, escalated: true, replayed: true };
  return { answer: row.result?.answer ?? "Your earlier request was already handled.", replayed: true };
}

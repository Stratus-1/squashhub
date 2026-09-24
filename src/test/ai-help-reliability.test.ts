import { describe, it, expect, vi } from "vitest";
import { nextStepDecision, replayStored, STEP_BUDGET_MS, ESCALATED_ANSWER } from "../../supabase/functions/ai-help/flow";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import { supabase } from "@/integrations/supabase/client";
import { buildAskPayload, callAiHelp, AI_HELP_NETWORK_ERROR } from "@/hooks/use-ai-help";

const afr = "Oei Willem, sorry, ek sien nou die play-off games is nou op. Laat ons dieselfde tyd 'n match moet speel.";

describe("ai-help loop", () => {
  it("stops right after an escalation (one ticket, no more AI steps)", () => {
    expect(nextStepDecision({ step: 1, startedAt: 0, now: 1000, escalated: true })).toBe("stop_escalated");
  });
  it("does not start a new step after the time budget", () => {
    expect(nextStepDecision({ step: 2, startedAt: 0, now: STEP_BUDGET_MS + 1, escalated: false })).toBe("stop_budget");
    expect(nextStepDecision({ step: 0, startedAt: 0, now: STEP_BUDGET_MS + 1, escalated: false })).toBe("continue");
  });
  it("replays a stored escalation on retry instead of opening a new ticket", () => {
    const r = replayStored({ id: "i", kind: "escalation", status: "escalated", ticket_id: "t1" });
    expect(r).toMatchObject({ ticketId: "t1", replayed: true, answer: ESCALATED_ANSWER });
  });
  it("replays a stored preview without executing", () => {
    expect(replayStored({ id: "i", kind: "action", status: "proposed", preview: { a: 1 } })).toMatchObject({ interactionId: "i", preview: { a: 1 } });
  });
});

describe("assistant client", () => {
  it("typed and spoken requests share one payload; Afrikaans text passes unchanged", () => {
    const base = { question: afr, requestId: "11111111-1111-4111-8111-111111111111", context: { route: "/x" }, history: [], atts: [] };
    const typed = buildAskPayload({ ...base, voice: false });
    const spoken = buildAskPayload({ ...base, voice: true });
    expect(typed.question).toBe(afr);
    expect({ ...spoken, transcriptUsed: false }).toEqual(typed);
    expect(typed.clientRequestId).toBe(base.requestId);
  });
  it("network failure becomes a retryable, friendly error", async () => {
    const err = Object.assign(new Error("Failed to send a request to the Edge Function"), { name: "FunctionsFetchError" });
    (supabase.functions.invoke as any).mockResolvedValueOnce({ data: null, error: err });
    expect(await callAiHelp({})).toEqual({ error: AI_HELP_NETWORK_ERROR, retryable: true });
  });
});

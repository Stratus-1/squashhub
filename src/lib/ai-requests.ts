// Requester-facing AI request history: pure helpers (unit-tested).

export type MyAiRow = {
  id: string; user_id: string; club_id: string | null; conversation_id: string | null; kind: string;
  request_text: string | null; assistant_answer: string | null; status: string; action_name: string | null;
  preview: any; result: any; error: string | null; ticket_id: string | null; bug_report_id: string | null;
  expires_at: string | null; executed_at: string | null; created_at: string; retry_of: string | null;
};

export type Tone = "waiting" | "done" | "bug" | "support" | "denied" | "failed" | "muted";
export type StatusInfo = { label: string; tone: Tone };

const BUG: Record<string, string> = { open: "Open", investigating: "Investigating", fixed: "Fixed", wont_fix: "Won't fix", duplicate: "Duplicate" };
const TICKET: Record<string, string> = { open: "Open", pending: "Waiting on support", in_progress: "Being handled", resolved: "Resolved", closed: "Closed" };

/** Status reflects the real underlying lifecycle, never just "the AI replied". */
export function requestStatus(
  row: Pick<MyAiRow, "status" | "expires_at" | "bug_report_id" | "ticket_id">,
  bugStatus?: string | null, ticketStatus?: string | null, now = Date.now(),
): StatusInfo {
  if (row.bug_report_id) {
    const s = bugStatus ?? "open";
    return { label: `Bug reported · ${BUG[s] ?? s}`, tone: s === "fixed" ? "done" : "bug" };
  }
  switch (row.status) {
    case "proposed":
      return row.expires_at && new Date(row.expires_at).getTime() < now
        ? { label: "Preview expired — ask again", tone: "muted" }
        : { label: "Waiting for your confirmation", tone: "waiting" };
    case "confirmed": return { label: "Confirmed · running", tone: "waiting" };
    case "executed": return { label: "Completed action", tone: "done" };
    case "rolled_back": return { label: "Completed, then reversed by support", tone: "muted" };
    case "denied": return { label: "Permission denied", tone: "denied" };
    case "needs_clarification": return { label: "Needs more detail from you", tone: "waiting" };
    case "cancelled": return { label: "Cancelled — nothing changed", tone: "muted" };
    case "expired": return { label: "Preview expired — ask again", tone: "muted" };
    case "failed": return { label: `Failed — needs attention${ticketStatus ? ` · Support ${TICKET[ticketStatus] ?? ticketStatus}` : ""}`, tone: "failed" };
    case "escalated": return { label: `Support request · ${TICKET[ticketStatus ?? "open"] ?? ticketStatus}`, tone: "support" };
    case "answered": return { label: "Answered", tone: "muted" };
    default: return { label: row.status.replace(/_/g, " "), tone: "muted" };
  }
}

/** Old support escalations (e.g. from before an action existed) are never executed;
 *  the requester may deliberately retry them as a new request. */
export function canRetry(row: Pick<MyAiRow, "status" | "kind">, alreadyRetried: boolean): boolean {
  return !alreadyRetried && (row.status === "escalated" || row.status === "expired" || row.status === "failed");
}

export type Conversation = { id: string; rows: MyAiRow[]; latest: MyAiRow; title: string; updatedAt: string };

/** Group the caller's own rows into conversations (stable conversation_id). */
export function groupConversations(rows: MyAiRow[], userId: string): Conversation[] {
  const map = new Map<string, MyAiRow[]>();
  for (const r of rows) {
    if (r.user_id !== userId || r.kind === "rollback") continue; // defence in depth
    const k = r.conversation_id ?? r.id;
    (map.get(k) ?? map.set(k, []).get(k)!).push(r);
  }
  return [...map.entries()].map(([id, rs]) => {
    rs.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const latest = rs[rs.length - 1];
    return { id, rows: rs, latest, title: (rs[0].request_text ?? "Request").slice(0, 80), updatedAt: latest.created_at };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type RestoredTurn = { role: "user" | "assistant"; content: string; row?: MyAiRow };

/** Rebuild visible chat turns from persisted rows. */
export function turnsFromRows(rows: MyAiRow[]): RestoredTurn[] {
  const out: RestoredTurn[] = [];
  for (const r of rows) {
    if (r.request_text) out.push({ role: "user", content: r.request_text });
    const reply = r.assistant_answer ?? r.result?.answer ?? (r.preview ? "Here's exactly what I'd change. Nothing happens until you confirm." : "");
    out.push({ role: "assistant", content: reply, row: r });
    if (r.status === "executed" || r.status === "failed") {
      const msg = r.result?.message ?? r.error;
      if (msg) out.push({ role: "assistant", content: msg });
    }
  }
  return out;
}

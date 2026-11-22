/**
 * Finance audit trail display rules (admin / chairman / treasurer views only).
 *
 * The server returns one row per change (see `club_ledger_audit_trail`):
 *  - "deleted":  a journal line that no longer exists — shown struck through,
 *                never counted in any total or running balance;
 *  - "edited":   a live line whose amount/account/description/member/date changed;
 *  - "reversed": an original journal group that a later reversal cancelled.
 * Members never receive this data; their own statements are unchanged.
 */

export type LedgerAuditRow = {
  kind: "deleted" | "edited" | "reversed";
  entry_id: string | null;
  journal_ref: string | null;
  club_member_id: string | null;
  row_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  actor_name: string | null;
  changed_at: string;
  note: string | null;
};

export type EntryAudit =
  | { status: "deleted"; by: string; at: string; note: string | null }
  | { status: "reversed"; by: string; at: string; note: string | null }
  | { status: "reversal"; by: string; at: string; note: string | null }
  | { status: "edited"; by: string; at: string; note: string | null; was: { debit: number; credit: number; description: string | null } };

export type AuditedEntry = Record<string, any> & { audit?: EntryAudit };

export type AuditView = "with_changes" | "clean" | "live_only" | "changes_only";

export const AUDIT_VIEWS: AuditView[] = ["with_changes", "clean", "live_only", "changes_only"];

/** True for an original that was reversed or the reversal that cancelled it (the pair nets to zero). */
export const isReversedPair = (e: AuditedEntry) => e.audit?.status === "reversed" || e.audit?.status === "reversal";

const who = (r: LedgerAuditRow) => r.actor_name || "System";

/** Live entries annotated with reversal/edit flags, plus deleted lines as struck-through ghosts. */
export function mergeLedgerAudit(entries: Record<string, any>[], audit: LedgerAuditRow[]): AuditedEntry[] {
  const reversedRefs = new Map<string, LedgerAuditRow>();
  const reversalRefs = new Map<string, LedgerAuditRow>();
  const latestEdit = new Map<string, LedgerAuditRow>();
  const ghosts: AuditedEntry[] = [];
  const liveIds = new Set(entries.map((e) => String(e.id)));

  for (const r of audit) {
    if (r.kind === "reversed" && r.journal_ref) {
      reversedRefs.set(r.journal_ref, r);
      const rev = r.row_data?.reversal_journal_ref;
      if (rev) reversalRefs.set(String(rev), r);
    } else if (r.kind === "edited" && r.entry_id) {
      const prev = latestEdit.get(r.entry_id);
      if (!prev || prev.changed_at < r.changed_at) latestEdit.set(r.entry_id, r);
    } else if (r.kind === "deleted" && r.row_data && r.entry_id && !liveIds.has(r.entry_id)) {
      ghosts.push({
        ...r.row_data,
        id: `deleted:${r.entry_id}:${r.changed_at}`,
        entry_id: r.entry_id,
        audit: { status: "deleted", by: who(r), at: r.changed_at, note: r.note },
      });
    }
  }

  const live: AuditedEntry[] = entries.map((e) => {
    const ref = e.journal_ref ? String(e.journal_ref) : "";
    const rev = ref ? reversalRefs.get(ref) : undefined;
    if (rev) return { ...e, audit: { status: "reversal", by: who(rev), at: rev.changed_at, note: rev.note } };
    const orig = ref ? reversedRefs.get(ref) : undefined;
    if (orig) return { ...e, audit: { status: "reversed", by: who(orig), at: orig.changed_at, note: orig.note } };
    const ed = latestEdit.get(String(e.id));
    if (ed) {
      const was = ed.row_data || {};
      return {
        ...e,
        audit: {
          status: "edited", by: who(ed), at: ed.changed_at, note: ed.note,
          was: { debit: Number(was.debit || 0), credit: Number(was.credit || 0), description: was.description ?? null },
        },
      };
    }
    return e;
  });

  return [...live, ...ghosts];
}

export const isDeleted = (e: AuditedEntry) => e.audit?.status === "deleted";

/** Only rows that still count — use for every total and running balance. */
export const countable = <T extends AuditedEntry>(rows: T[]): T[] => rows.filter((e) => !isDeleted(e));

export function applyAuditView<T extends AuditedEntry>(rows: T[], view: AuditView): T[] {
  if (view === "live_only") return rows.filter((e) => !isDeleted(e));
  // Hides deleted lines and both halves of every reversal, so what remains still nets correctly.
  if (view === "clean") return rows.filter((e) => !isDeleted(e) && !isReversedPair(e));
  if (view === "changes_only") return rows.filter((e) => !!e.audit);
  return rows;
}

/** Plain-language status used on screen and in exports. */
export function auditLabel(a: EntryAudit | undefined, fmt: (iso: string) => string): string {
  if (!a) return "";
  const base =
    a.status === "deleted" ? `Deleted by ${a.by}` :
    a.status === "reversed" ? `Reversed by ${a.by}` :
    a.status === "reversal" ? `Reversal posted by ${a.by}` :
    `Edited by ${a.by}`;
  return `${base} · ${fmt(a.at)}${a.note ? ` — ${a.note}` : ""}`;
}

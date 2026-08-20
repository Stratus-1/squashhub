/**
 * Single source of truth for WHO receives a tournament invitation.
 *
 * Production incident (Aug 2026): a selective "send to selected members" send
 * reached far more people than the organiser picked. The rules below are
 * deliberately fail-closed — a selective send never widens to the full roster,
 * for any reason.
 */

export type InviteRegistrationRow = {
  id: string;
  club_member_id?: string | null;
  status?: string | null;
  invited_by_admin?: boolean | null;
};

export type InviteSendMode = "all" | "selected";

/** Statuses that don't need another invitation on a send-all. */
export const SKIP_INVITE_STATUSES = new Set(["paid", "waived", "registered", "active", "cancelled"]);

export type ResolveResult =
  | { ok: true; rows: InviteRegistrationRow[] }
  | { ok: false; error: string };

export function resolveInviteRecipients(input: {
  mode: InviteSendMode;
  registrations: InviteRegistrationRow[];
  selectedIds?: string[] | null;
  /** Send-all fallback: allow re-sending to everyone already registered. */
  allowResendAll?: boolean;
}): ResolveResult {
  const registrations = (input.registrations || []).filter((r) => r && r.id && r.club_member_id);

  if (input.mode === "selected") {
    const selected = Array.from(new Set((input.selectedIds || []).filter((id) => typeof id === "string" && id.trim())));
    if (selected.length === 0) {
      return { ok: false, error: "No members were selected — nothing was sent." };
    }
    const byId = new Map(registrations.map((r) => [r.id, r]));
    const rows = selected.map((id) => byId.get(id)).filter(Boolean) as InviteRegistrationRow[];
    if (rows.length !== selected.length) {
      // Stale / malformed ids: fail closed rather than sending a partial or
      // (worse) a widened audience.
      return {
        ok: false,
        error:
          "Some selected members are no longer valid for this tournament. Nothing was sent — reopen the list and try again.",
      };
    }
    return { ok: true, rows };
  }

  const pending = registrations.filter((r) => !SKIP_INVITE_STATUSES.has(String(r.status || "").toLowerCase()));
  if (pending.length > 0) return { ok: true, rows: pending };

  const everyone = registrations.filter((r) => String(r.status || "").toLowerCase() !== "cancelled");
  if (everyone.length === 0) return { ok: false, error: "No invitees to notify." };
  if (!input.allowResendAll) {
    return { ok: false, error: "Everyone is already registered." };
  }
  return { ok: true, rows: everyone };
}

/** Human confirmation summary shown before a send. */
export function inviteConfirmSummary(
  mode: InviteSendMode,
  names: string[],
): string {
  const n = names.length;
  const who = n <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${n - 3} more`;
  if (mode === "selected") {
    return `Send to ${n} selected member${n === 1 ? "" : "s"}: ${who}?`;
  }
  return `Send the invitation to all ${n} invited member${n === 1 ? "" : "s"}: ${who}?`;
}

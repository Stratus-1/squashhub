// Pure helpers for committee approval requests. Status changes are decided
// only by the database writers (approval_* RPCs); these mirror the rules for display.
export type ApproverStatus = "pending" | "approved" | "declined";
export type RequestStatus = "open" | "approved" | "declined" | "withdrawn";

export interface ApprovalApprover {
  id: string; member_id: string; name: string; office: string | null; status: ApproverStatus;
  signature_path: string | null; signed_at: string | null; signed_via: string | null; decline_reason: string | null;
}
export interface ApprovalRequest {
  id: string; topic: string; description: string; amount: number | null; status: RequestStatus;
  created_at: string; decided_at: string | null; requester_member_id: string; requester_name: string;
  requester_signature_path: string;
  approvers: ApprovalApprover[];
  attachments: { id: string; path: string; file_name: string; mime_type: string | null; size_bytes: number | null }[];
  events: { kind: string; note: string | null; created_at: string; actor_name: string | null }[];
}
export interface EligibleMember { member_id: string; name: string; office: string | null; is_admin: boolean; has_email: boolean }

/** Outcome implied by approver answers: all approved → approved, any decline → declined. */
export function outcomeFromApprovers(statuses: ApproverStatus[]): RequestStatus {
  if (statuses.some((s) => s === "declined")) return "declined";
  if (statuses.length > 0 && statuses.every((s) => s === "approved")) return "approved";
  return "open";
}

/** Approver choices exclude the requester's own member records. */
export function approverOptions(members: EligibleMember[], myMemberIds: string[]): EligibleMember[] {
  const mine = new Set(myMemberIds);
  return members.filter((m) => !mine.has(m.member_id));
}

export function isWaitingForMe(r: ApprovalRequest, myMemberIds: string[]): boolean {
  return r.status === "open" && r.approvers.some((a) => a.status === "pending" && myMemberIds.includes(a.member_id));
}

export function canEdit(status: RequestStatus): boolean {
  return status === "open";
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  open: "Waiting", approved: "Approved", declined: "Declined", withdrawn: "Withdrawn",
};

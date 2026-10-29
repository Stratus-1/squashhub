import { rpcExt } from "@/lib/supabase-ext";

export const OUTSTANDING_BALANCE_KEY = "outstanding_balance";
export const CORRECTION_UP_KEY = "correction_up";
export const CORRECTION_DOWN_KEY = "correction_down";
export type CorrectionDirection = "up" | "down";

export function memberOutstandingRequest(input: {
  clubId: string; memberId: string; amount: string; description: string;
  date: string; requestId: string;
}) {
  const amount = Number(input.amount);
  if (!input.clubId || !input.memberId) throw new Error("Select a member");
  if (!/^\d+(\.\d{1,2})?$/.test(input.amount.trim()) || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a positive amount with at most two decimal places");
  }
  const description = input.description.trim();
  if (!description || description.length > 500) throw new Error("Enter a description of 1 to 500 characters");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Select a valid date");
  const date = new Date(`${input.date}T00:00:00+02:00`);
  if (!Number.isFinite(date.getTime())) throw new Error("Select a valid date");
  const johannesburgDay = new Date(date.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (johannesburgDay !== input.date) throw new Error("Select a valid date");
  if (!input.requestId) throw new Error("Request ID is required");
  return {
    _club_id: input.clubId, _club_member_id: input.memberId, _amount: amount,
    _description: description, _date: date.toISOString(), _request_id: input.requestId,
  };
}

export async function addMemberOutstandingBalance(input: Parameters<typeof memberOutstandingRequest>[0]) {
  const { error } = await rpcExt("admin_add_member_outstanding_balance", memberOutstandingRequest(input));
  if (error) throw error;
}

export function memberCorrectionRequest(input: Parameters<typeof memberOutstandingRequest>[0] & { direction: CorrectionDirection }) {
  if (input.direction !== "up" && input.direction !== "down") throw new Error("Choose correction up or correction down");
  return { ...memberOutstandingRequest(input), _direction: input.direction };
}

export async function postMemberCorrection(input: Parameters<typeof memberCorrectionRequest>[0]) {
  const { error } = await rpcExt("admin_post_member_correction", memberCorrectionRequest(input));
  if (error) throw error;
}

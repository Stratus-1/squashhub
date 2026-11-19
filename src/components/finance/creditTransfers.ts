import { supabase } from "@/integrations/supabase/client";

export type CreditTransfer = {
  id: string; from_member_id: string; from_name: string; to_member_id: string; to_name: string;
  amount: number; note: string | null; status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  requested_as: "member" | "admin"; created_at: string; expires_at: string; decided_at: string | null;
};

export async function listCreditTransfers(clubId: string, scope: "mine" | "club"): Promise<CreditTransfer[]> {
  const { data, error } = await (supabase as any).rpc("list_member_credit_transfers", { _club_id: clubId, _scope: scope });
  if (error) throw error;
  return ((data || []) as any[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

export const TRANSFER_STATUS_LABEL: Record<CreditTransfer["status"], string> = {
  pending: "Waiting", accepted: "Accepted", declined: "Declined", cancelled: "Cancelled", expired: "Expired",
};

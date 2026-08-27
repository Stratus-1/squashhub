import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

export interface ClubBankRule {
  id: string;
  club_id: string;
  match_key: string;
  direction: "in" | "out" | "any";
  account: string | null;
  custom_account_id: string | null;
  member_id: string | null;
  discard: boolean;
}

/** Value used by the import UI: plain gl code, or "custom:<uuid>" for club-defined accounts. */
export function ruleAccountValue(rule: ClubBankRule): string | null {
  if (rule.custom_account_id) return `custom:${rule.custom_account_id}`;
  return rule.account;
}

export function splitAccountValue(value: string | null) {
  if (!value) return { account: null as string | null, custom_account_id: null as string | null };
  if (value.startsWith("custom:")) return { account: null, custom_account_id: value.slice(7) };
  return { account: value, custom_account_id: null };
}

export function useClubBankRules(clubId?: string, enabled = true) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["club-bank-rules", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_bank_rules")
        .select("id, club_id, match_key, direction, account, custom_account_id, member_id, discard")
        .eq("club_id", clubId!);
      if (error) throw error;
      return (data || []) as unknown as ClubBankRule[];
    },
    enabled: !!clubId && enabled,
  });

  /** Remember (or update) how this club treats a narrative. */
  const saveRule = async (input: {
    match_key: string;
    direction: "in" | "out";
    accountValue?: string | null;
    member_id?: string | null;
    discard?: boolean;
  }) => {
    if (!clubId || !input.match_key) return;
    const { account, custom_account_id } = splitAccountValue(input.accountValue ?? null);
    const payload: Record<string, unknown> = {
      club_id: clubId,
      match_key: input.match_key,
      direction: input.direction,
      discard: input.discard ?? false,
    };
    if (input.accountValue !== undefined) {
      payload.account = account;
      payload.custom_account_id = custom_account_id;
    }
    if (input.member_id !== undefined) payload.member_id = input.member_id;

    const { error } = await fromExt("club_bank_rules").upsert(payload as never, {
      onConflict: "club_id,match_key,direction",
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["club-bank-rules", clubId] });
  };

  return { rules: query.data ?? [], isLoading: query.isLoading, saveRule };
}

/** Find the rule that applies to a narrative + direction (direction-specific wins over 'any'). */
export function matchRule(rules: ClubBankRule[], key: string, direction: "in" | "out"): ClubBankRule | null {
  if (!key) return null;
  return (
    rules.find((r) => r.match_key === key && r.direction === direction) ||
    rules.find((r) => r.match_key === key && r.direction === "any") ||
    null
  );
}

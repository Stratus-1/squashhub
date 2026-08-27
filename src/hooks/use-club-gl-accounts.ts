import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

export type GLCategory = "Asset" | "Liability" | "Income" | "Expense";

export interface ClubGLAccount {
  id: string;
  club_id: string;
  name: string;
  category: GLCategory;
  /** Standard account this rolls up into for the double-entry ledger. Null = standalone. */
  base_account: string | null;
  description: string | null;
  is_active: boolean;
}

/** Ledger account used to carry standalone (parentless) custom accounts per category. */
export const STANDALONE_FALLBACK_ACCOUNT: Record<GLCategory, string> = {
  Asset: "cash",
  Liability: "creditors",
  Income: "fee_income",
  Expense: "general_expense",
};

/** Club-defined general ledger accounts (in addition to the standard chart). */
export function useClubGLAccounts(clubId?: string) {
  return useQuery({
    queryKey: ["club-gl-accounts", clubId],
    queryFn: async (): Promise<ClubGLAccount[]> => {
      const { data, error } = await fromExt("club_gl_accounts")
        .select("id, club_id, name, category, base_account, description, is_active")
        .eq("club_id", clubId!)
        .order("category")
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as ClubGLAccount[];
    },
    enabled: !!clubId,
  });
}

export function useClubGLAccountMutations(clubId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["club-gl-accounts", clubId] });

  return {
    async create(input: { name: string; category: GLCategory; base_account?: string | null; description?: string | null }) {
      const { error } = await fromExt("club_gl_accounts").insert({
        club_id: clubId,
        name: input.name.trim(),
        category: input.category,
        base_account: input.base_account ?? null,
        description: input.description?.trim() || null,
      } as any);
      if (error) throw error;
      await invalidate();
    },
    async update(id: string, patch: Partial<Pick<ClubGLAccount, "name" | "category" | "base_account" | "description" | "is_active">>) {
      const { error } = await fromExt("club_gl_accounts").update(patch as any).eq("id", id);
      if (error) throw error;
      await invalidate();
    },
    async remove(id: string) {
      const { error } = await fromExt("club_gl_accounts").delete().eq("id", id);
      if (error) throw error;
      await invalidate();
    },
  };
}

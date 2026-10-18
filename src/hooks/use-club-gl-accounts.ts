import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";

export type GLCategory = "Asset" | "Liability" | "Income" | "Expense";
export type CostOfSalesCategory = "bar_cost_of_sales" | "shop_cost_of_sales";
export type AccountCategoryChoice = GLCategory | CostOfSalesCategory;
export const ACCOUNT_CATEGORY_CHOICES: AccountCategoryChoice[] = ["Asset", "Liability", "Income", "Expense", "bar_cost_of_sales", "shop_cost_of_sales"];
export const categoryLabel = (category: AccountCategoryChoice) => category === "bar_cost_of_sales" ? "Cost of sales — Bar" : category === "shop_cost_of_sales" ? "Cost of sales — Shop" : category;
export function accountCategoryPatch(choice: AccountCategoryChoice) {
  return choice === "bar_cost_of_sales" || choice === "shop_cost_of_sales"
    ? { category: "Expense" as GLCategory, reporting_category: choice }
    : { category: choice, reporting_category: null };
}

export interface ClubGLAccount {
  id: string;
  club_id: string;
  name: string;
  category: GLCategory;
  reporting_category?: CostOfSalesCategory | null;
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
      if (!clubId) return [];
      const { data, error } = await fromExt("club_gl_accounts")
        .select("id, club_id, name, category, reporting_category, base_account, description, is_active")
        .eq("club_id", clubId)
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
    async create(input: { name: string; category: GLCategory; reporting_category?: CostOfSalesCategory | null; base_account?: string | null; description?: string | null }) {
      const { error } = await fromExt("club_gl_accounts").insert({
        club_id: clubId,
        name: input.name.trim(),
        category: input.category,
        reporting_category: input.reporting_category ?? null,
        base_account: input.base_account ?? null,
        description: input.description?.trim() || null,
      } as any);
      if (error) throw error;
      await invalidate();
    },
    async update(id: string, patch: Partial<Pick<ClubGLAccount, "name" | "category" | "reporting_category" | "description" | "is_active">> & { base_account?: string | null }) {
      const { error } = await fromExt("club_gl_accounts").update(patch as any).eq("id", id).eq("club_id", clubId);
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

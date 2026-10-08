import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { EMPTY_PREFS, normalisePrefs, type MenuPrefs } from "@/lib/menu-order";

const NO_CLUB = "00000000-0000-0000-0000-000000000000";

/** The signed-in user's own menu order/hidden items for one menu in one club. */
export function useMenuPrefs(menuKey: string, clubId?: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const club = clubId || NO_CLUB;
  const key = ["menu-prefs", user?.id, club, menuKey];
  const q = useQuery({
    queryKey: key,
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MenuPrefs> => {
      const { data, error } = await supabase.from("user_menu_preferences").select("item_order")
        .eq("user_id", user!.id).eq("club_id", club).eq("menu_key", menuKey).maybeSingle();
      if (error) throw error;
      return normalisePrefs(data?.item_order);
    },
  });
  const save = useMutation({
    mutationFn: async (prefs: MenuPrefs | null) => {
      if (!user) throw new Error("Not signed in");
      if (!prefs) {
        const { error } = await supabase.from("user_menu_preferences").delete()
          .eq("user_id", user.id).eq("club_id", club).eq("menu_key", menuKey);
        if (error) throw error;
        return EMPTY_PREFS;
      }
      const { error } = await supabase.from("user_menu_preferences").upsert(
        { user_id: user.id, club_id: club, menu_key: menuKey, item_order: prefs as never, updated_at: new Date().toISOString() },
        { onConflict: "user_id,club_id,menu_key" });
      if (error) throw error;
      return prefs;
    },
    onSuccess: (prefs) => qc.setQueryData(key, prefs),
  });
  return { prefs: q.data ?? EMPTY_PREFS, canEdit: !!user, save };
}

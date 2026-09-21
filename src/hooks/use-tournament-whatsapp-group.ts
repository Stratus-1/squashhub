/**
 * The tournament's WhatsApp group record (invite link, name, status).
 *
 * A missing group is a normal state — every screen simply hides its join
 * button and the tournament runs exactly as before.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TournamentWhatsAppGroup } from "@/lib/tournaments/whatsapp-group";

const TABLE = "tournament_whatsapp_groups";

export function useTournamentWhatsAppGroup(champId?: string | null) {
  return useQuery({
    queryKey: ["tournament-whatsapp-group", champId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from(TABLE)
        .select("*")
        .eq("champ_id", champId as string)
        .maybeSingle();
      return (data ?? null) as TournamentWhatsAppGroup | null;
    },
    enabled: !!champId,
    staleTime: 60 * 1000,
  });
}

export function useSaveTournamentWhatsAppGroup(champId?: string | null, clubId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<TournamentWhatsAppGroup>) => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .upsert(
          { champ_id: champId, club_id: clubId ?? null, ...patch },
          { onConflict: "champ_id" },
        )
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as TournamentWhatsAppGroup;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournament-whatsapp-group", champId] });
      qc.invalidateQueries({ queryKey: ["tournament-group-invites", champId] });
    },
  });
}

/** Who has been sent the join link (organiser view only). */
export function useTournamentGroupInvites(champId?: string | null) {
  return useQuery({
    queryKey: ["tournament-group-invites", champId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tournament_whatsapp_group_invites")
        .select("club_member_id, sent_at, send_error, link_opened_at")
        .eq("champ_id", champId as string);
      return (data ?? []) as Array<{
        club_member_id: string;
        sent_at: string | null;
        send_error: string | null;
        link_opened_at: string | null;
      }>;
    },
    enabled: !!champId,
    staleTime: 30 * 1000,
  });
}

export function useSendGroupJoinLinks(champId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts: { paidOnly?: boolean; resend?: boolean } = {}) => {
      const { data, error } = await supabase.functions.invoke("tournament-group", {
        body: {
          action: "send_join_links",
          champ_id: champId,
          paid_only: !!opts.paidOnly,
          resend: !!opts.resend,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { total: number; sent: number; failed: number; skipped: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tournament-group-invites", champId] }),
  });
}

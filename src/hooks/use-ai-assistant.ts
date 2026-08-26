import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useMyClub } from "@/hooks/use-club";
import { useCapabilities } from "@/hooks/use-club-capabilities";

export interface ClubAiSettings {
  club_id: string;
  enabled: boolean;
  /** "all" | "admins" */
  audience: string;
  voice_input_enabled: boolean;
  voice_output_enabled: boolean;
  text_chat_enabled: boolean;
  actions_enabled: boolean;
  default_voice: string | null;
  default_rate: number;
  response_style: string;
}

export interface AiUserPreferences {
  user_id: string;
  voice: string | null;
  rate: number;
  response_style: string | null;
  speak_replies: boolean;
}

export function useClubAiSettings(clubIdOverride?: string) {
  const { data: clubData } = useMyClub();
  const clubId = clubIdOverride || clubData?.club?.id;
  return useQuery({
    queryKey: ["club-ai-settings", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_ai_settings")
        .select("*")
        .eq("club_id", clubId!)
        .maybeSingle();
      if (error) throw error;
      return (data as ClubAiSettings | null) ?? null;
    },
    enabled: !!clubId,
    staleTime: 60_000,
  });
}

export function useUpdateClubAiSettings(clubId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ClubAiSettings>) => {
      const { error } = await fromExt("club_ai_settings")
        .upsert({ club_id: clubId!, ...patch }, { onConflict: "club_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["club-ai-settings", clubId] }),
  });
}

export function useAiPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ai-preferences", user?.id],
    queryFn: async () => {
      const { data, error } = await fromExt("ai_user_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as AiUserPreferences | null) ?? null;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

export function useUpdateAiPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AiUserPreferences>) => {
      const { error } = await fromExt("ai_user_preferences")
        .upsert({ user_id: user!.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-preferences", user?.id] }),
  });
}

/** Everything the assistant UI needs to decide what it may show. */
export function useAiAssistant() {
  const { data: clubData } = useMyClub();
  const { isAdmin } = useMemberContext();
  const { enabled: capabilities } = useCapabilities();
  const { data: settings, isLoading } = useClubAiSettings();
  const { data: prefs } = useAiPreferences();

  const club = clubData?.club;
  const allowed = !!settings?.enabled && (settings.audience !== "admins" || !!isAdmin);

  return useMemo(
    () => ({
      isLoading,
      settings: settings ?? null,
      prefs: prefs ?? null,
      allowed,
      clubId: club?.id as string | undefined,
      clubName: (club as any)?.name as string | undefined,
      clubSubdomain: (club as any)?.subdomain as string | undefined,
      isAdmin: !!isAdmin,
      capabilities,
      voice: prefs?.voice ?? settings?.default_voice ?? null,
      rate: Number(prefs?.rate ?? settings?.default_rate ?? DEFAULT_RATE),
      style: prefs?.response_style ?? settings?.response_style ?? "friendly",
      speakReplies: (prefs?.speak_replies ?? true) && !!settings?.voice_output_enabled,
      voiceInput: !!settings?.voice_input_enabled,
    }),
    [isLoading, settings, prefs, allowed, club, isAdmin, capabilities],
  );
}

export type AssistantTurn = {
  answer: string;
  action: { key: string; params?: Record<string, string | undefined> } | null;
  workflow_key: string | null;
  unanswered: boolean;
  conversationId: string | null;
};

export function useAskAssistant() {
  return useMutation({
    mutationFn: async (payload: {
      question: string;
      history: { role: "user" | "assistant"; content: string }[];
      conversationId?: string | null;
      context: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.functions.invoke("ai-assistant", { body: payload });
      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as AssistantTurn;
    },
  });
}

/** Rate an answer / flag an unanswered question so admins can improve it. */
export function useAiFeedback() {
  const { user } = useAuth();
  const { data: clubData } = useMyClub();
  return useMutation({
    mutationFn: async (input: {
      question: string;
      answer?: string | null;
      rating?: "up" | "down";
      conversationId?: string | null;
      route?: string;
    }) => {
      const { error } = await fromExt("ai_feedback").insert({
        user_id: user!.id,
        club_id: clubData?.club?.id ?? null,
        conversation_id: input.conversationId ?? null,
        question: input.question,
        answer: input.answer ?? null,
        rating: input.rating ?? null,
        unanswered: input.rating === "down",
        route: input.route ?? null,
      });
      if (error) throw error;
    },
  });
}

/** Feedback rows for the club admin dashboard. */
export function useAiFeedbackLog(clubId?: string) {
  return useQuery({
    queryKey: ["ai-feedback", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("ai_feedback")
        .select("*")
        .eq("club_id", clubId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as {
        id: string;
        question: string;
        answer: string | null;
        rating: string | null;
        unanswered: boolean;
        route: string | null;
        created_at: string;
      }[];
    },
    enabled: !!clubId,
    staleTime: 30_000,
  });
}

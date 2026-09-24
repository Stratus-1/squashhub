import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useMyClub, useIsSuperAdmin } from "@/hooks/use-club";

export const AI_ACTIONS_FEATURE = "ai_actions";

export type AiHelpPreview = {
  summary: string;
  changes: string[];
  affected: string[];
  consequences: string[];
  unchanged: string[];
  reversible: boolean;
  request: string;
};

export type AiHelpReply = {
  answer?: string;
  preview?: AiHelpPreview;
  interactionId?: string;
  ticketId?: string;
  escalated?: boolean;
  executed?: boolean;
  failed?: boolean;
  error?: string;
  retryable?: boolean;
};

/** Is the AI Help Assistant beta on for this user's club (or Super Admin)? Fails closed. */
export function useAiHelpBeta() {
  const { data: clubData } = useMyClub();
  const isSuper = useIsSuperAdmin();
  const clubId = ((clubData as any)?.club_id ?? (clubData as any)?.club?.id) as string | undefined;
  const q = useQuery({
    queryKey: ["club-beta", AI_ACTIONS_FEATURE, clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_beta_features")
        .select("club_id").eq("club_id", clubId!).eq("feature", AI_ACTIONS_FEATURE).maybeSingle();
      return !error && !!data;
    },
    enabled: !!clubId,
    staleTime: 60_000,
  });
  return { enabled: !!clubId && (isSuper || !!q.data), clubId };
}

/** Pull record IDs out of the current page so the assistant knows the context. */
export function pageIds(pathname: string, search: string): Record<string, string> {
  const ids: Record<string, string> = {};
  const champ = /\/(?:club-champs|tournaments?)\/([0-9a-f-]{36})/i.exec(pathname);
  if (champ) ids.champId = champ[1];
  const fixture = /\/league-games\/([0-9a-f-]{36})/i.exec(pathname);
  if (fixture) ids.fixtureId = fixture[1];
  const params = new URLSearchParams(search);
  for (const k of ["match", "matchId", "champ", "fixture"]) {
    const v = params.get(k);
    if (v && /^[0-9a-f-]{36}$/i.test(v)) ids[k === "champ" ? "champId" : k === "fixture" ? "fixtureId" : "matchId"] = v;
  }
  return ids;
}

export const AI_HELP_NETWORK_ERROR = "Couldn't reach the assistant. Your message is saved — tap Retry.";

export async function callAiHelp(body: Record<string, unknown>): Promise<AiHelpReply> {
  const { data, error } = await supabase.functions.invoke("ai-help", { body });
  if (error) {
    // Network-level failure (no HTTP reply reached the device).
    if ((error as any)?.name === "FunctionsFetchError" || /Failed to send a request/i.test(error.message || "")) {
      return { error: AI_HELP_NETWORK_ERROR, retryable: true };
    }
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    const status = (error as any)?.context?.status;
    return { error: msg, retryable: status === 429 || (status >= 500 && status < 600) };
  }
  return (data ?? {}) as AiHelpReply;
}

export async function uploadAiScreenshot(userId: string, file: File) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `ai-help/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const { error } = await supabase.storage.from("support-attachments").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return { path, name: file.name, mime: file.type, size: file.size };
}

export type AiActivityRow = {
  id: string; user_id: string; club_id: string | null; role: string | null; kind: string;
  request_text: string | null; transcript_used: boolean; attachments: { path: string; name: string }[];
  context: { route?: string; ids?: Record<string, string> }; interpretation: string | null;
  action_name: string | null; action_args: unknown; preview: AiHelpPreview | null; status: string;
  confirmed_at: string | null; executed_at: string | null; before_data: unknown; after_data: unknown;
  result: { message?: string; answer?: string } | null; error: string | null; escalation_reason: string | null;
  ticket_id: string | null; reversible: boolean; rollback_of: string | null; rolled_back_by: string | null; created_at: string;
  clubs?: { name: string } | null;
};

export function useAiActivity(filters: { status?: string; clubId?: string }) {
  return useQuery({
    queryKey: ["ai-activity", filters],
    queryFn: async () => {
      let q = fromExt("ai_assist_interactions").select("*, clubs(name)").order("created_at", { ascending: false }).limit(200);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.clubId) q = q.eq("club_id", filters.clubId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AiActivityRow[];
    },
  });
}

export function useAiRollback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, preview }: { id: string; preview: boolean }) => {
      const r = await callAiHelp({ mode: preview ? "rollback_preview" : "rollback", interactionId: id }) as any;
      if (r.error) throw new Error(r.error);
      return r as { ok: boolean; message: string; changes?: string[] };
    },
    onSuccess: (_d, v) => { if (!v.preview) qc.invalidateQueries({ queryKey: ["ai-activity"] }); },
  });
}

/** Super Admin: clubs with a given beta feature. */
export function useBetaClubs(feature: string) {
  return useQuery({
    queryKey: ["club-beta", feature, "all"],
    queryFn: async () => {
      const { data, error } = await fromExt("club_beta_features").select("club_id, created_at, clubs(name)").eq("feature", feature);
      if (error) throw error;
      return (data ?? []) as { club_id: string; clubs: { name: string } | null }[];
    },
  });
}

export function useSetBetaClub(feature: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clubId, on }: { clubId: string; on: boolean }) => {
      const { error } = on
        ? await fromExt("club_beta_features").insert({ club_id: clubId, feature })
        : await fromExt("club_beta_features").delete().eq("club_id", clubId).eq("feature", feature);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["club-beta"] }),
  });
}

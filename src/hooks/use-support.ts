import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const fromAny = (table: string) => (supabase as any).from(table);

export type SupportThreadRow = {
  id: string;
  user_id: string;
  subject: string;
  status: "open" | "pending" | "closed" | string;
  assigned_to: string | null;
  last_message_at: string | null;
  last_message_by: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportAttachment = {
  path: string;
  name: string;
  size: number;
  mime: string;
};

export type SupportMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  attachments?: SupportAttachment[];
};

export function useMySupportThreads() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`rt-support-threads-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_threads", filter: `user_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["support", "my-threads", user.id] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user?.id]);

  return useQuery({
    queryKey: ["support", "my-threads", user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as SupportThreadRow[];
      const { data, error } = await fromAny("support_threads")
        .select("*")
        .eq("user_id", user.id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as SupportThreadRow[];
    },
    enabled: !!user?.id,
  });
}

export function useAdminSupportThreads(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("rt-support-threads-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_threads" }, () =>
        queryClient.invalidateQueries({ queryKey: ["support", "admin-threads"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);

  return useQuery({
    queryKey: ["support", "admin-threads"],
    queryFn: async () => {
      const { data, error } = await fromAny("support_threads")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data || []) as SupportThreadRow[];
      const weight = (s: string) => (s === "open" ? 0 : s === "pending" ? 1 : 2);
      rows.sort((a, b) => {
        const w = weight(a.status) - weight(b.status);
        if (w !== 0) return w;
        const at = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        if (at !== bt) return bt - at;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return rows;
    },
    enabled,
  });
}

export function useSupportMessages(threadId?: string | null, enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    if (!threadId) return;
    const channel = supabase
      .channel(`rt-support-messages-${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `thread_id=eq.${threadId}` },
        () => queryClient.invalidateQueries({ queryKey: ["support", "messages", threadId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient, threadId]);

  return useQuery({
    queryKey: ["support", "messages", threadId],
    queryFn: async () => {
      if (!threadId) return [] as SupportMessageRow[];
      const { data, error } = await fromAny("support_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as SupportMessageRow[];
    },
    enabled: enabled && !!threadId,
  });
}

export function useCreateSupportThread() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ subject }: { subject: string }) => {
      if (!user?.id) throw new Error("Not logged in");
      const clean = subject.trim();
      const { data, error } = await fromAny("support_threads")
        .insert({
          user_id: user.id,
          subject: clean || "Support",
          status: "open",
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as SupportThreadRow;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["support", "my-threads"] });
      await queryClient.invalidateQueries({ queryKey: ["support", "admin-threads"] });
    },
  });
}

export function useSendSupportMessage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ threadId, body, files }: { threadId: string; body: string; files?: File[] }) => {
      if (!user?.id) throw new Error("Not logged in");
      const clean = body.trim();
      const fileList = files || [];
      if (!clean && fileList.length === 0) throw new Error("Message cannot be empty");

      // Upload attachments first
      const attachments: SupportAttachment[] = [];
      for (const file of fileList) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${threadId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("support-attachments")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        attachments.push({ path, name: file.name, size: file.size, mime: file.type });
      }

      const { data, error } = await fromAny("support_messages")
        .insert({
          thread_id: threadId,
          sender_id: user.id,
          body: clean || (attachments.length ? `(${attachments.length} attachment${attachments.length > 1 ? "s" : ""})` : ""),
          attachments,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as SupportMessageRow;
    },
    onSuccess: async (_row, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["support", "messages", vars.threadId] });
      await queryClient.invalidateQueries({ queryKey: ["support", "my-threads"] });
      await queryClient.invalidateQueries({ queryKey: ["support", "admin-threads"] });
    },
  });
}

export function useUpdateSupportThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, patch }: { threadId: string; patch: Partial<SupportThreadRow> }) => {
      const { data, error } = await fromAny("support_threads")
        .update(patch)
        .eq("id", threadId)
        .select("*")
        .single();
      if (error) throw error;
      return data as SupportThreadRow;
    },
    onSuccess: async (_row, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["support", "messages", vars.threadId] });
      await queryClient.invalidateQueries({ queryKey: ["support", "my-threads"] });
      await queryClient.invalidateQueries({ queryKey: ["support", "admin-threads"] });
    },
  });
}

export async function getSupportAttachmentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from("support-attachments")
    .createSignedUrl(path, 60 * 60); // 1 hour
  return data?.signedUrl || null;
}


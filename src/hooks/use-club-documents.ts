import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { CLUB_DOCUMENTS_BUCKET } from "@/lib/club-rules";
import { libraryFilePath, type ClubDocument, type ClubDocumentCategory } from "@/lib/club-documents";

const keys = {
  cats: (clubId?: string) => ["club-document-categories", clubId],
  docs: (clubId?: string) => ["club-documents", clubId],
};

/** Server decides: club admins, chairman, secretary and the "Club Info" permission. */
export function useCanManageClubDocuments(clubId?: string) {
  return useQuery({
    queryKey: ["can-manage-club-documents", clubId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("my_can_manage_club_documents", { _club_id: clubId });
      if (error) return false;
      return data === true;
    },
    enabled: !!clubId,
    staleTime: 5 * 60_000,
  });
}

/** Categories the signed-in user may see (managers: all; members: visible ones). */
export function useClubDocumentCategories(clubId?: string) {
  return useQuery({
    queryKey: keys.cats(clubId),
    queryFn: async (): Promise<ClubDocumentCategory[]> => {
      const { data, error } = await fromExt("club_document_categories")
        .select("id, club_id, name, standard_key, sort_order, members_visible")
        .eq("club_id", clubId)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data || []) as ClubDocumentCategory[];
    },
    enabled: !!clubId,
  });
}

/** Documents the signed-in user may see (RLS filters hidden ones for members). */
export function useClubDocuments(clubId?: string) {
  return useQuery({
    queryKey: keys.docs(clubId),
    queryFn: async (): Promise<ClubDocument[]> => {
      const { data, error } = await fromExt("club_documents")
        .select("id, club_id, category_id, title, file_path, file_name, mime_type, size_bytes, members_visible, created_at, description, document_date, description_source")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ClubDocument[];
    },
    enabled: !!clubId,
  });
}

export function useClubDocumentMutations(clubId?: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.cats(clubId) });
    qc.invalidateQueries({ queryKey: keys.docs(clubId) });
  };

  const addCategory = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await fromExt("club_document_categories").insert({
        club_id: clubId, name: name.trim(), members_visible: true, sort_order: 100,
      });
      if (error) {
        if (String(error.code) === "23505") throw new Error("A category with that name already exists");
        throw error;
      }
    },
    onSuccess: refresh,
  });

  const updateCategory = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; members_visible?: boolean }) => {
      const { error } = await fromExt("club_document_categories").update(patch).eq("id", id);
      if (error) {
        if (String(error.code) === "23505") throw new Error("A category with that name already exists");
        throw error;
      }
    },
    onSuccess: refresh,
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromExt("club_document_categories").delete().eq("id", id);
      if (error) {
        if (String(error.code) === "23503") throw new Error("Move or remove the documents in this category first");
        throw error;
      }
    },
    onSuccess: refresh,
  });

  const upload = useMutation({
    mutationFn: async (args: { file: File; title: string; categoryId: string; membersVisible: boolean; documentDate?: string | null }): Promise<string> => {
      const id = crypto.randomUUID();
      const path = libraryFilePath(clubId!, args.file.name, id);
      const { error: upErr } = await supabase.storage
        .from(CLUB_DOCUMENTS_BUCKET)
        .upload(path, args.file, { upsert: false, contentType: args.file.type || "application/octet-stream" });
      if (upErr) throw upErr;
      const { error } = await fromExt("club_documents").insert({
        id,
        club_id: clubId,
        category_id: args.categoryId,
        title: args.title.trim(),
        file_path: path,
        file_name: args.file.name,
        mime_type: args.file.type || null,
        size_bytes: args.file.size,
        members_visible: args.membersVisible,
        document_date: args.documentDate || null,
      });
      if (error) {
        await supabase.storage.from(CLUB_DOCUMENTS_BUCKET).remove([path]).catch(() => null);
        throw error;
      }
      return id;
    },
    onSuccess: refresh,
  });

  const updateDocument = useMutation({
    mutationFn: async ({ id, ...patch }: {
      id: string; title?: string; category_id?: string; members_visible?: boolean;
      description?: string | null; document_date?: string | null; description_source?: "ai" | "manual" | null;
    }) => {
      const { error } = await fromExt("club_documents").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const deleteDocument = useMutation({
    mutationFn: async (doc: ClubDocument) => {
      const { error } = await fromExt("club_documents").delete().eq("id", doc.id);
      if (error) throw error;
      await supabase.storage.from(CLUB_DOCUMENTS_BUCKET).remove([doc.file_path]).catch(() => null);
    },
    onSuccess: refresh,
  });

  /** Lovable AI reads the file and writes a short description + the document's own date. */
  const describe = useMutation({
    mutationFn: async (args: { id: string; force?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("club-document-describe", {
        body: { document_id: args.id, force: !!args.force },
      });
      if (error) {
        let msg = "AI could not describe this document";
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* keep default */ }
        throw new Error(msg);
      }
      return data as { description: string | null; document_date: string | null; skipped?: string };
    },
    onSettled: refresh,
  });

  return { addCategory, updateCategory, deleteCategory, upload, updateDocument, deleteDocument, describe };
}

/** Private bucket: open through a short-lived link the storage policy re-checks. */
export async function openClubDocument(doc: Pick<ClubDocument, "file_path">): Promise<boolean> {
  const { data, error } = await supabase.storage.from(CLUB_DOCUMENTS_BUCKET).createSignedUrl(doc.file_path, 60 * 10);
  if (error || !data?.signedUrl) return false;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  return true;
}

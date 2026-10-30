import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { COMMS_DOCUMENT_BUCKET, COMMS_DOCUMENT_MAX_BYTES, commsDocumentPath, commsDocumentUrl } from "@/lib/comms/documents";
import { escapeHtml } from "@/lib/comms/render";

export function CommsDocumentUpload({ clubId, onInsert }: { clubId: string; onInsert: (html: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (files: File[]) => {
    setBusy(true);
    try {
      for (const file of files) {
        if (file.size > COMMS_DOCUMENT_MAX_BYTES) throw new Error(`${file.name}: maximum document size is 10 MB`);
        const path = commsDocumentPath(clubId, file.name, crypto.randomUUID());
        const { error } = await supabase.storage.from(COMMS_DOCUMENT_BUCKET).upload(path, file, { upsert: false });
        if (error) throw error;
        onInsert(`<p><a href="${escapeHtml(commsDocumentUrl(path, "https://squashhub.co.za"))}">${escapeHtml(file.name)}</a></p>`);
      }
      toast({ title: "Documents added", description: "Members sign in to open the download links." });
    } catch (error) {
      toast({ title: "Document upload failed", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" });
    } finally { setBusy(false); }
  };
  return <>
    <input ref={input} aria-label="Upload email documents" type="file" multiple className="hidden" onChange={(event) => {
      const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files);
    }} />
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
      <Paperclip className="w-3.5 h-3.5 mr-1" />{busy ? "Uploading…" : "Add documents"}
    </Button>
  </>;
}
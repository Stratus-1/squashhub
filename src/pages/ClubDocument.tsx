import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { COMMS_DOCUMENT_BUCKET, validCommsDocumentPath } from "@/lib/comms/documents";
export default function ClubDocument() {
  const [params] = useSearchParams();
  const path = params.get("path") ?? "";
  const { data, isLoading, error } = useQuery({
    queryKey: ["comms-document", path],
    queryFn: async () => {
      if (!validCommsDocumentPath(path)) throw new Error("Invalid document link");
      const { data, error } = await supabase.storage.from(COMMS_DOCUMENT_BUCKET).createSignedUrl(path, 300);
      if (error) throw error;
      return data.signedUrl;
    }, retry: false,
  });
  return <main className="max-w-3xl mx-auto px-4 py-10 space-y-4">
    <h1 className="text-xl font-semibold">Club document</h1>
    {isLoading ? <p>Loading document…</p> : error ? <p role="alert">This document is unavailable or your account does not have access to this club.</p> : data ?
      <Button asChild><a href={data} target="_blank" rel="noopener noreferrer"><Download className="w-4 h-4 mr-2" />Open document</a></Button> : null}
  </main>;
}
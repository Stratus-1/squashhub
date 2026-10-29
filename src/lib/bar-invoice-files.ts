import { supabase } from "@/integrations/supabase/client";

export const INVOICE_BUCKET = "bar-purchase-invoices";
export interface InvoiceFile { path: string; name: string; type: string }

export function validateInvoiceFile(file: Pick<File, "type" | "size">): void {
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") throw new Error("Choose an invoice photo or PDF");
  if (file.size > 20 * 1024 * 1024) throw new Error("Each invoice file must be 20 MB or smaller");
  if (file.size === 0) throw new Error("This invoice file is empty");
}

/** Upload before the one existing purchase insert; remove unlinked files if saving fails. */
export async function saveWithInvoiceFiles(clubId: string, files: File[], save: (attachments: InvoiceFile[]) => Promise<void>) {
  files.forEach(validateInvoiceFile);
  const storage = supabase.storage.from(INVOICE_BUCKET);
  const uploaded: InvoiceFile[] = [];
  try {
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${clubId}/${crypto.randomUUID()}/${safeName}`;
      const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      uploaded.push({ path, name: file.name, type: file.type });
    }
    await save(uploaded);
  } catch (error) {
    if (uploaded.length) await storage.remove(uploaded.map(file => file.path));
    throw error;
  }
}

export async function openInvoiceFile(file: InvoiceFile) {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  try {
    const { data, error } = await supabase.storage.from(INVOICE_BUCKET).createSignedUrl(file.path, 300);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("Invoice unavailable");
    if (tab) tab.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
  } catch (error) { tab?.close(); throw error; }
}
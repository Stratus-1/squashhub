export const COMMS_DOCUMENT_BUCKET = "club-documents";
export const COMMS_DOCUMENT_MAX_BYTES = 10_000_000;
export function commsDocumentPath(clubId: string, filename: string, id: string) {
  return `${clubId}/comms/${id}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}
export function commsDocumentUrl(path: string, base: string) {
  return `${base.replace(/\/$/, "")}/club-document?path=${encodeURIComponent(path)}`;
}
export function validCommsDocumentPath(path: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/comms\/[a-zA-Z0-9._-]+$/i.test(path);
}
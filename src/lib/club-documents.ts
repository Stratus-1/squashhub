/**
 * Club document library (Club Admin → Rules & Documents).
 *
 * Documents sit in club-defined categories. Three standard categories are
 * created for every club; clubs add their own. A member sees a document only
 * when BOTH the document and its category are switched to "visible to members".
 * The database enforces the same rule (RLS + storage policy); this module is
 * the client mirror used for labels and grouping.
 */

export interface ClubDocumentCategory {
  id: string;
  club_id: string;
  name: string;
  standard_key: string | null;
  sort_order: number;
  members_visible: boolean;
}

export interface ClubDocument {
  id: string;
  club_id: string;
  category_id: string;
  title: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  members_visible: boolean;
  created_at: string;
  /** Short summary, written by Lovable AI after upload or typed by a manager. */
  description?: string | null;
  /** Date the document itself carries (meeting/adopted/signed date), YYYY-MM-DD. */
  document_date?: string | null;
  description_source?: "ai" | "manual" | null;
}

export const CLUB_LIBRARY_MAX_BYTES = 20 * 1024 * 1024;

export const STANDARD_CATEGORY_NAMES = [
  "Constitution & amendments",
  "AGM documents",
  "Financial reports",
] as const;

/** Both switches must be on for an ordinary member to see a document. */
export function isDocumentVisibleToMembers(
  doc: Pick<ClubDocument, "members_visible">,
  category: Pick<ClubDocumentCategory, "members_visible"> | null | undefined,
): boolean {
  return !!doc.members_visible && !!category?.members_visible;
}

/** Storage path inside the club-documents bucket; the `library` folder is visibility-checked. */
export function libraryFilePath(clubId: string, fileName: string, id: string): string {
  const safe = (fileName || "document").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return `${clubId}/library/${id}-${safe}`;
}

/** Title suggestion from a file name ("AGM_minutes-2026.pdf" → "AGM minutes 2026"). */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base || "Document";
}

export function sortCategories<T extends Pick<ClubDocumentCategory, "sort_order" | "name">>(cats: T[]): T[] {
  return [...cats].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

/** Groups documents under their (sorted) categories; newest document first. */
export function groupByCategory(
  categories: ClubDocumentCategory[],
  documents: ClubDocument[],
): Array<{ category: ClubDocumentCategory; documents: ClubDocument[] }> {
  return sortCategories(categories).map((category) => ({
    category,
    documents: documents
      .filter((d) => d.category_id === category.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }));
}

/** What an ordinary member sees: visible categories holding at least one visible document. */
export function memberView(categories: ClubDocumentCategory[], documents: ClubDocument[]) {
  return groupByCategory(categories, documents)
    .map((g) => ({ ...g, documents: g.documents.filter((d) => isDocumentVisibleToMembers(d, g.category)) }))
    .filter((g) => g.category.members_visible && g.documents.length > 0);
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "2026-10-29" or an ISO timestamp → "29 Oct 2026" (South African style). */
export function formatDocDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

/** Meta line under a document: document date, upload date and size. */
export function documentMetaLine(doc: Pick<ClubDocument, "document_date" | "created_at" | "size_bytes">): string {
  const parts: string[] = [];
  if (doc.document_date) parts.push(`Dated ${formatDocDate(doc.document_date)}`);
  parts.push(`Uploaded ${formatDocDate(doc.created_at)}`);
  const size = formatFileSize(doc.size_bytes);
  if (size) parts.push(size);
  return parts.join(" · ");
}

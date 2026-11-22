import { describe, expect, it } from "vitest";
import { isDocumentVisibleToMembers, libraryFilePath, memberView, type ClubDocument, type ClubDocumentCategory } from "./club-documents";

const cat = (id: string, members_visible: boolean, sort_order = 10): ClubDocumentCategory => ({
  id, club_id: "c", name: id, standard_key: null, sort_order, members_visible,
});
const doc = (id: string, category_id: string, members_visible: boolean): ClubDocument => ({
  id, club_id: "c", category_id, title: id, file_path: `c/library/${id}`, file_name: id,
  mime_type: null, size_bytes: null, members_visible, created_at: "2026-11-22T10:00:00Z",
});

describe("club document visibility", () => {
  it("member sees a document only when the document and its category are both visible", () => {
    expect(isDocumentVisibleToMembers({ members_visible: true }, { members_visible: true })).toBe(true);
    expect(isDocumentVisibleToMembers({ members_visible: false }, { members_visible: true })).toBe(false);
    expect(isDocumentVisibleToMembers({ members_visible: true }, { members_visible: false })).toBe(false);
  });

  it("hiding a category hides all its documents from members", () => {
    const view = memberView(
      [cat("agm", false), cat("constitution", true)],
      [doc("minutes", "agm", true), doc("constitution-2024", "constitution", true), doc("draft", "constitution", false)],
    );
    expect(view.map((g) => g.category.id)).toEqual(["constitution"]);
    expect(view[0].documents.map((d) => d.id)).toEqual(["constitution-2024"]);
  });

  it("library files are stored in the visibility-checked library folder", () => {
    expect(libraryFilePath("club-1", "AGM minutes.pdf", "abc")).toBe("club-1/library/abc-AGM_minutes.pdf");
  });
});

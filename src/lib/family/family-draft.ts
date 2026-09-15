/**
 * Family members captured while someone is joining the club.
 *
 * The joining wizard only collects the people — nothing is created until the
 * registration is saved, so a half-finished wizard never leaves stray members
 * or charges behind.
 */

import { isFamilyFull, relationshipAllowed, type FamilyCategory } from "./family-package";

export interface FamilyDraft {
  /** Local key for list rendering only. */
  key: string;
  /** "new" = a person who is not at the club yet, "existing" = by member number. */
  mode: "new" | "existing";
  name: string;
  surname: string;
  email: string;
  phone: string;
  memberNo: string;
  relationship: string;
}

export function emptyFamilyDraft(relationship = "child"): FamilyDraft {
  return {
    key: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()),
    mode: "new",
    name: "",
    surname: "",
    email: "",
    phone: "",
    memberNo: "",
    relationship,
  };
}

export function familyDraftLabel(d: FamilyDraft): string {
  if (d.mode === "existing") return d.memberNo.trim() || "Member number";
  return `${d.name.trim()} ${d.surname.trim()}`.trim() || "New family member";
}

/**
 * First problem with the captured list, or null when it is safe to save.
 * Capacity, relationship and completeness are all checked here so the wizard
 * can block "Complete Registration" with a plain message.
 */
export function familyDraftError(
  primary: FamilyCategory | null,
  drafts: FamilyDraft[],
): string | null {
  if (drafts.length === 0) return null;
  if (!primary || primary.family_role !== "primary") {
    return "Choose the family membership first";
  }
  if (!primary.family_additional_category_id) {
    return "Your club has not set up the additional family member fee yet — ask the club to add it";
  }
  if (isFamilyFull(primary, drafts.length - 1)) {
    const max = primary.family_max_additional ?? 0;
    return `Your club's family package includes up to ${max} extra ${max === 1 ? "person" : "people"}`;
  }
  for (const d of drafts) {
    if (!relationshipAllowed(primary, d.relationship)) {
      return "Your club does not include that relationship in the family package";
    }
    if (d.mode === "existing") {
      if (!d.memberNo.trim()) return "Enter the membership number of each existing member";
    } else {
      if (d.name.trim().length < 2 || d.surname.trim().length < 2) {
        return "Enter a name and surname for each family member";
      }
      if (!d.email.trim() && !d.phone.trim()) {
        return "Give each family member an email address or a cell number";
      }
    }
  }
  return null;
}

/** Payload for the `family_add_member` call, one per captured person. */
export function familyDraftPayload(primaryMemberId: string, d: FamilyDraft) {
  return {
    _primary_member_id: primaryMemberId,
    _existing_member_id: null as string | null,
    _name: d.mode === "new" ? `${d.name.trim()} ${d.surname.trim()}`.trim() : null,
    _email: d.mode === "new" ? d.email.trim() || null : null,
    _phone: d.mode === "new" ? d.phone.trim() || null : null,
    _relationship: d.relationship,
  };
}

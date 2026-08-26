/**
 * Club membership rules & constitution.
 *
 * Every club stores its own rules text plus supporting documents
 * (constitution / house rules PDFs). The same content is rendered on the
 * public landing page and inside member registration, so it can never drift.
 */

export interface ClubRuleDocument {
  name: string;
  path: string;
  uploaded_at?: string;
}

export interface ClubMembershipRules {
  id?: string;
  club_id: string;
  rules_text: string;
  documents: ClubRuleDocument[];
  show_on_landing: boolean;
  require_acceptance: boolean;
  acceptance_statement: string;
  current_version: number;
}

export const CLUB_DOCUMENTS_BUCKET = "club-documents";

export const DEFAULT_ACCEPTANCE_STATEMENT =
  "I confirm I have read and understood the club constitution, house rules and membership rules, and agree to abide by them.";

/**
 * Starter template (based on the Nelspruit club rules). Every club can edit
 * this freely — nothing here is hard-coded into the product behaviour.
 */
export const DEFAULT_RULES_TEMPLATE = `Club rules for members
1. Only squash/court shoes allowed. Fine for playing with incorrect shoes is R1000.
2. Bookings must be cancelled at least 2 hours before the time. In peak time, please notify a committee member so members can be informed on the main group. Fine for not pitching up for your game R100.
3. No double bookings in peak time. Not allowed to book more than 1 hour during peak hours (peak hours 16h00–18h00).
4. No coaching on court 1 & 2 without permission from the committee.
5. Drills for practice only on Court 3 and not during peak time.
6. No smoking or vaping in the building. Please make use of the area indicated.
7. Dress code: appropriate and decent (no gym tops, revealing bellies etc).

Rules for Juniors/Scholars
1. Juniors are allowed to book court 1, only with a senior member.
2. Juniors must wear glasses at all times while on court. Fail to comply, R50 fine.`;

/** True when the club has anything worth showing. */
export function hasRulesContent(
  rules?: { rules_text?: string | null; documents?: ClubRuleDocument[] | null } | null
): boolean {
  if (!rules) return false;
  return !!rules.rules_text?.trim() || (rules.documents?.length ?? 0) > 0;
}

/** Split the rules text into headed blocks so it renders neatly. */
export function parseRuleBlocks(text: string): { heading?: string; lines: string[] }[] {
  const blocks: { heading?: string; lines: string[] }[] = [];
  let current: { heading?: string; lines: string[] } | null = null;
  for (const raw of (text || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const isNumbered = /^\d+[.)]\s*/.test(line);
    if (!isNumbered) {
      current = { heading: line, lines: [] };
      blocks.push(current);
    } else {
      if (!current) {
        current = { lines: [] };
        blocks.push(current);
      }
      current.lines.push(line.replace(/^\d+[.)]\s*/, ""));
    }
  }
  return blocks;
}

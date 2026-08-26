/**
 * Member Skills & Expertise
 * ─────────────────────────
 * A club-agnostic list of common skills members can offer. Stored on
 * `club_members.skills` (text[]) using the stable `value` below, plus a
 * free-text `skills_other` field for anything not in the list.
 *
 * Extensible: adding a new option here is safe — historic values keep
 * rendering because `skillLabel()` falls back to the raw value.
 */

export type SkillOption = { value: string; label: string; group: string };

export const SKILL_OPTIONS: SkillOption[] = [
  { value: "electrician", label: "Electrician", group: "Trades & Maintenance" },
  { value: "plumber", label: "Plumber", group: "Trades & Maintenance" },
  { value: "carpenter", label: "Carpenter", group: "Trades & Maintenance" },
  { value: "builder", label: "Builder / Handyman", group: "Trades & Maintenance" },
  { value: "painter", label: "Painter", group: "Trades & Maintenance" },
  { value: "gardening", label: "Gardening / Grounds", group: "Trades & Maintenance" },

  { value: "it", label: "IT / Technology", group: "Professional" },
  { value: "legal", label: "Legal", group: "Professional" },
  { value: "accounting", label: "Accounting / Bookkeeping", group: "Professional" },
  { value: "marketing", label: "Marketing / Design", group: "Professional" },
  { value: "insurance", label: "Insurance / Financial advice", group: "Professional" },
  { value: "hr", label: "HR / Recruitment", group: "Professional" },

  { value: "event_management", label: "Event management", group: "Club life" },
  { value: "fundraising", label: "Fundraising / Sponsorship", group: "Club life" },
  { value: "catering", label: "Catering / Bar", group: "Club life" },
  { value: "coaching", label: "Coaching", group: "Club life" },
  { value: "refereeing", label: "Refereeing / Marking", group: "Club life" },
  { value: "photography", label: "Photography / Video", group: "Club life" },

  { value: "medical", label: "Medical / First aid", group: "Health & Safety" },
  { value: "physio", label: "Physiotherapy / Biokinetics", group: "Health & Safety" },
  { value: "security", label: "Security", group: "Health & Safety" },
  { value: "transport", label: "Transport / Driving", group: "Health & Safety" },
];

export const SKILL_GROUPS = Array.from(new Set(SKILL_OPTIONS.map((s) => s.group)));

const BY_VALUE = new Map(SKILL_OPTIONS.map((s) => [s.value, s]));

export function skillLabel(value: string): string {
  return BY_VALUE.get(value)?.label || value;
}

/** Normalise whatever came back from the DB into a clean string array. */
export function normaliseSkills(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v || "").trim()).filter(Boolean);
}

/** Extra free-text skills, split on commas — used for search + display. */
export function parseOtherSkills(other?: string | null): string[] {
  return String(other || "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type SkillsProfile = {
  occupation?: string | null;
  skills?: unknown;
  skills_other?: string | null;
  volunteer_willing?: boolean | null;
};

/** True when the member has told us anything at all about their skills. */
export function hasSkillsInfo(m: SkillsProfile | null | undefined): boolean {
  if (!m) return false;
  return (
    normaliseSkills(m.skills).length > 0 ||
    parseOtherSkills(m.skills_other).length > 0 ||
    !!String(m.occupation || "").trim()
  );
}

/** Free-text search across skills, other-skills and occupation. */
export function matchesSkillSearch(m: SkillsProfile, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    ...normaliseSkills(m.skills).map(skillLabel),
    ...normaliseSkills(m.skills),
    ...parseOtherSkills(m.skills_other),
    String(m.occupation || ""),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

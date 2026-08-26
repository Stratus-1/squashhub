/**
 * Shared merge-field catalogue for the Communications engine.
 *
 * One catalogue for every channel (email / WhatsApp / in-app) so admins learn
 * the tokens once and reuse them everywhere.
 */

export type MergeField = {
  key: string;
  label: string;
  group: "member" | "club" | "league" | "action";
};

export const MERGE_FIELDS: MergeField[] = [
  { key: "title", label: "Title", group: "member" },
  { key: "first_name", label: "First name", group: "member" },
  { key: "surname", label: "Surname", group: "member" },
  { key: "name", label: "Full name", group: "member" },
  { key: "member_number", label: "Member #", group: "member" },
  { key: "email", label: "Email", group: "member" },
  { key: "phone", label: "Phone", group: "member" },
  { key: "id_number", label: "ID number", group: "member" },
  { key: "league_name", label: "League name", group: "league" },
  { key: "league_number", label: "League #", group: "league" },
  { key: "club_name", label: "Club name", group: "club" },
  { key: "club_email", label: "Club email", group: "club" },
  { key: "club_phone", label: "Club phone", group: "club" },
  { key: "action_label", label: "Action label", group: "action" },
  { key: "action_url", label: "Action link", group: "action" },
];

export const MERGE_FIELD_KEYS = MERGE_FIELDS.map((f) => f.key);

export type MergeVars = Record<string, string>;

/** Build merge vars for a member row + club row (client-side preview). */
export function buildMergeVars(opts: {
  member?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    club_member_number?: string | null;
    id_number?: string | null;
    title?: string | null;
  } | null;
  club?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  leagueName?: string;
  leagueNumber?: string;
  actionLabel?: string;
  actionUrl?: string;
}): MergeVars {
  const full = String(opts.member?.name || "").trim();
  const [first, ...rest] = full.split(/\s+/);
  return {
    title: String(opts.member?.title || ""),
    first_name: first || "",
    surname: rest.join(" "),
    name: full,
    member_number: String(opts.member?.club_member_number || ""),
    email: String(opts.member?.email || ""),
    phone: String(opts.member?.phone || ""),
    id_number: String(opts.member?.id_number || ""),
    league_name: opts.leagueName || "",
    league_number: opts.leagueNumber || "",
    club_name: String(opts.club?.name || ""),
    club_email: String(opts.club?.email || ""),
    club_phone: String(opts.club?.phone || ""),
    action_label: opts.actionLabel || "",
    action_url: opts.actionUrl || "",
  };
}

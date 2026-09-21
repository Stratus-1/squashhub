/**
 * Tournament WhatsApp group — link, naming and description helpers.
 *
 * WhatsApp has no usable API for groups this size: Meta's native Groups API
 * (Oct 2025) caps a group at EIGHT participants and is not exposed by Twilio
 * at all, and Twilio's "group messaging" sample is parallel one-to-one chats,
 * not a real group. So the organiser creates the group on their own phone
 * (name, photo, admin-only posting) and pastes the invite link here. Everything
 * else — who gets the link, the enter/withdraw deep links, the tracking — is
 * SquashHub's.
 *
 * `provider` is kept on the record so a native-API group can slot in later
 * without touching any screen.
 */

export type GroupProvider = "manual" | "meta_native";
export type GroupStatus = "active" | "closed" | "archived";

export type TournamentWhatsAppGroup = {
  id: string;
  champ_id: string;
  club_id: string | null;
  provider: GroupProvider;
  invite_url: string | null;
  group_name: string | null;
  description: string | null;
  announcements_only: boolean;
  status: GroupStatus;
  closed_at: string | null;
};

const INVITE_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{6,}(\?[^\s]*)?$/;

/** A WhatsApp group invite link, tidied up. Returns null when it isn't one. */
export function normaliseGroupInviteUrl(raw: string | null | undefined): string | null {
  let v = String(raw ?? "").trim();
  if (!v) return null;
  v = v.replace(/^http:\/\//i, "https://");
  if (/^chat\.whatsapp\.com\//i.test(v)) v = `https://${v}`;
  v = v.replace(/[.,;)\]]+$/, "");
  return INVITE_RE.test(v) ? v : null;
}

export function isGroupInviteUrl(raw: string | null | undefined): boolean {
  return normaliseGroupInviteUrl(raw) !== null;
}

/**
 * Suggested group name. Multi-tenant: the owning club, association or
 * federation leads, and the tournament name follows. Never hard-coded.
 */
export function defaultGroupName(tournamentName: string, ownerName?: string | null): string {
  const t = String(tournamentName ?? "").trim() || "Tournament";
  const o = String(ownerName ?? "").trim();
  if (!o || t.toLowerCase().includes(o.toLowerCase())) return t;
  return `${o} — ${t}`;
}

/** Tenant-aware absolute link. Falls back to the current origin. */
export function tournamentActionUrl(
  champId: string,
  action: "enter" | "withdraw",
  subdomain?: string | null,
): string {
  const path = `/t/${champId}/${action}`;
  if (subdomain) return `https://${subdomain}.squashhub.co.za${path}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return `https://squashhub.co.za${path}`;
}

/**
 * Text the organiser pastes into the group description (and pins), so every
 * participant can enter or withdraw straight from the group.
 */
export function groupDescriptionText(opts: {
  champId: string;
  tournamentName: string;
  ownerName?: string | null;
  subdomain?: string | null;
}): string {
  const enter = tournamentActionUrl(opts.champId, "enter", opts.subdomain);
  const withdraw = tournamentActionUrl(opts.champId, "withdraw", opts.subdomain);
  const owner = String(opts.ownerName ?? "").trim();
  return [
    `${opts.tournamentName}${owner ? ` — ${owner}` : ""}`,
    "",
    "Entries and results are managed in SquashHub. Being in this group does not enter you.",
    "",
    `Enter the tournament: ${enter}`,
    `Withdraw from the tournament: ${withdraw}`,
  ].join("\n");
}

/** Message sent to confirmed entrants inviting them into the group. */
export function groupJoinMessage(opts: {
  tournamentName: string;
  ownerName?: string | null;
  inviteUrl: string;
}): string {
  const owner = String(opts.ownerName ?? "").trim();
  return [
    `${owner ? `${owner}: ` : ""}You are entered for ${opts.tournamentName}.`,
    `Join the tournament WhatsApp group for draws, times and results: ${opts.inviteUrl}`,
  ].join(" ");
}

/**
 * Who may be sent the group link: entrants who have actually entered. Merely
 * invited prospects are never added to the group.
 */
export type GroupInviteCandidate = { club_member_id: string; status?: string | null };

const ENTERED = new Set(["paid", "confirmed", "entered", "accepted", "pending_payment"]);

export function groupInviteRecipients<T extends GroupInviteCandidate>(
  registrations: T[],
  opts: { paidOnly?: boolean } = {},
): T[] {
  return (registrations || []).filter((r) => {
    const s = String(r.status ?? "").toLowerCase();
    if (!r.club_member_id) return false;
    if (opts.paidOnly) return s === "paid";
    return ENTERED.has(s);
  });
}

/** Group activity is automated only while the tournament is running. */
export function groupAutomationActive(
  group: Pick<TournamentWhatsAppGroup, "status" | "invite_url"> | null | undefined,
  tournamentStatus?: string | null,
): boolean {
  if (!group?.invite_url) return false;
  if (group.status !== "active") return false;
  const s = String(tournamentStatus ?? "").toLowerCase();
  return s !== "completed" && s !== "cancelled";
}

/** The default opening is editable with the rest of the tournament invitation. */
export function defaultTournamentInviteOpening(tournamentName?: string | null): string {
  return `You have been invited to ${String(tournamentName || "a tournament").trim() || "a tournament"}.`;
}

/** Personal greeting added at delivery time; it is not stored in editable copy. */
export function buildTournamentInviteGreeting(recipientName?: string | null): string {
  const name = String(recipientName || "").trim();
  return `Dear ${name || "player"},`;
}

export function personalizeTournamentInvite(
  body: string,
  recipientName?: string | null,
): string {
  return [buildTournamentInviteGreeting(recipientName), String(body || "").trim()]
    .filter(Boolean)
    .join("\n\n");
}

export function buildDefaultTournamentInviteText(
  tournamentName: string | null | undefined,
  detailsBlock: string,
): string {
  return [defaultTournamentInviteOpening(tournamentName), detailsBlock.trim()]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Older tournaments stored only the details because the opening sentence was
 * added during sending. Bring that sentence into the editor without changing
 * what recipients would have seen. Once loaded, organisers may edit or remove it.
 */
export function migrateLegacyTournamentInviteText(
  savedText: string | null | undefined,
  tournamentName?: string | null,
): string {
  const text = String(savedText || "").trim();
  if (!text) return text;
  if (/^you\s+(?:have been|are)\s+invited\b/i.test(text)) return text;
  return `${defaultTournamentInviteOpening(tournamentName)}\n\n${text}`;
}
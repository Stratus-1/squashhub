/** The default opening is editable with the rest of the tournament invitation. */
export function defaultTournamentInviteOpening(tournamentName?: string | null, diamondLeague = false): string {
  if (diamondLeague) {
    const name = String(tournamentName || "").trim();
    return `You have been invited to ${name ? (/diamond league/i.test(name) ? `the ${name}` : `the Diamond League — ${name}`) : "the Diamond League"}.`;
  }
  return `You have been invited to ${String(tournamentName || "a tournament").trim() || "a tournament"}.`;
}

/** Diamond identity comes from the linked team event / setup mode, never its name. */
export function inviteCompetitionLines(diamondLeague: boolean, category: string, matchType: "singles" | "doubles"): string[] {
  return diamondLeague
    ? ["Competition: Diamond League (singles and doubles)", `Category: ${category}`]
    : [`Category: ${category} ${matchType === "doubles" ? "Doubles" : "Singles"}`];
}

export function buildDefaultTournamentInviteText(
  tournamentName: string | null | undefined,
  detailsBlock: string,
  diamondLeague = false,
): string {
  return [defaultTournamentInviteOpening(tournamentName, diamondLeague), detailsBlock.trim()]
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
/**
 * AGM secret ballot helpers (pure). Server functions enforce eligibility,
 * one-vote-per-member, the deadline and anonymity; these helpers only shape
 * admin input and results for display.
 */

export type BallotPositionDraft = { title: string; nominees: string[]; maxChoices?: number };

export const DEFAULT_DECLARATION = (clubName: string) =>
  `I confirm that I am a paid-up member of ${clubName}, aged 18 years or older, and entitled to vote in accordance with the Club Constitution. I confirm that I will submit only one ballot.`;

/** Sample invitation message for a new AGM ballot — the admin edits it before sending. */
export const DEFAULT_INVITATION_MESSAGE = `Dear {member name},

You are warmly invited to our Annual General Meeting. Please confirm on your invitation page whether you will attend in person or online, or send your apologies.

The agenda, minutes and other meeting documents are attached on the same page.

Voting for the new committee takes place online before the meeting — your personal voting link is in the email you receive.`;

/** Editable default for the call-for-nominations email. Placeholders are filled per member at send time. */
export function defaultNominationMessage(allowSelf: boolean): string {
  return `Dear {member name},

Members are hereby notified that the Annual General Meeting will be held on {meeting date}.

Members are now called to make nominations for the committee. You can nominate another member for a position${allowSelf ? ", or make yourself available to serve on the committee and choose the position or function you would like to fulfil" : ""}. Please add your nominations using your personal link in this email.

Members nominated by someone else are asked on the same page to accept or decline. Only accepted nominations go onto the ballot.

Nominations close {nominations close}.

The agenda and relevant documents will be made available in due course.`;
}

/** Fills nomination placeholders; returns email-safe HTML paragraphs. */
export function nominationMessageHtml(msg: string, vars: { meeting: string; closes: string }): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(msg.trim())
    .replace(/\{\s*member[ _]name\s*\}/gi, "{{name}}")
    .replace(/\{\s*meeting[ _]date\s*\}/gi, `<strong>${esc(vars.meeting)}</strong>`)
    .replace(/\{\s*nominations[ _]close\s*\}/gi, `<strong>${esc(vars.closes)}</strong>`)
    .split(/\n\s*\n/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
}

/** "Chairperson: A, B" per line → positions. Blank/duplicate nominees are dropped. */
export function parseBallotText(text: string, opts: { allowEmpty?: boolean } = {}): BallotPositionDraft[] {
  const out: BallotPositionDraft[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const t0 = raw.trim();
    const line = opts.allowEmpty && t0 && !t0.includes(":") ? `${t0}:` : t0;
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) throw new Error(`Line "${line}" needs "Position: nominee, nominee"`);
    let title = line.slice(0, idx).trim();
    // "General Member (3): ..." → members may pick up to 3.
    let maxChoices = 1;
    const m = title.match(/\s*\((\d+)\)\s*$/);
    if (m) {
      maxChoices = Number(m[1]);
      title = title.slice(0, m.index).trim();
      if (maxChoices < 1 || maxChoices > 20) throw new Error(`"${title}" choices must be between 1 and 20`);
    }
    const seen = new Set<string>();
    const nominees = line
      .slice(idx + 1)
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    if (!nominees.length && !opts.allowEmpty) throw new Error(`"${title}" needs at least one nominee`);
    if (out.some((p) => p.title.toLowerCase() === title.toLowerCase())) throw new Error(`"${title}" is listed twice`);
    if (nominees.length && maxChoices > nominees.length) throw new Error(`"${title}" allows ${maxChoices} choices but has only ${nominees.length} nominee(s)`);
    out.push({ title, nominees, maxChoices });
  }
  return out;
}

export function formatBallotText(positions: BallotPositionDraft[]): string {
  return positions.map((p) => `${p.title}${(p.maxChoices ?? 1) > 1 ? ` (${p.maxChoices})` : ""}:${p.nominees.length ? " " + p.nominees.join(", ") : ""}`).join("\n");
}

/** Public voting link. Production links use the main domain. */
export function buildVoteLink(token: string, origin: string): string {
  const isPreview = /localhost|lovable|127\.0\.0\.1/.test(origin);
  return `${isPreview ? origin : "https://squashhub.co.za"}/vote/${token}`;
}

/** Public nomination link. */
export function buildNominationLink(token: string, origin: string): string {
  return buildVoteLink(token, origin).replace("/vote/", "/nominate/");
}

/** Public AGM invitation / attendance link. */
export function buildInviteLink(token: string, origin: string): string {
  return buildVoteLink(token, origin).replace("/vote/", "/agm/");
}

export type AgmDocument = { name: string; path: string };

/** One-line meeting summary for messages, Johannesburg time. */
export function meetingLine(meetingAt: string | null, venue: string | null): string {
  if (!meetingAt) return venue ? `Venue: ${venue}` : "";
  const when = new Date(meetingAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "full", timeStyle: "short" });
  return venue ? `${when} at ${venue}` : when;
}

export type TallyRow = { candidate_id: string; name: string; votes: number };

/**
 * Elected names for a position with `seats` places. `tie` lists candidates
 * level on votes at the cut-off who cannot all fit (decide at the AGM).
 */
export function positionWinners(tally: TallyRow[], seats = 1): { elected: string[]; tie: string[] } {
  const ranked = tally.filter((t) => t.votes > 0).sort((a, b) => b.votes - a.votes);
  if (!ranked.length) return { elected: [], tie: [] };
  if (ranked.length <= seats) return { elected: ranked.map((t) => t.name), tie: [] };
  const cut = ranked[seats - 1].votes;
  const above = ranked.filter((t) => t.votes > cut).map((t) => t.name);
  const atCut = ranked.filter((t) => t.votes === cut).map((t) => t.name);
  if (above.length + atCut.length <= seats) return { elected: [...above, ...atCut], tie: [] };
  return { elected: above, tie: atCut };
}

export type ReceiptChoice = string | string[] | null;
export const receiptPicks = (c: ReceiptChoice | undefined): string[] => (c == null ? [] : Array.isArray(c) ? c : [c]);

/** Recount totals from the anonymous receipt list (independent verification). */
export function recountFromReceipts(
  receipts: { code: string; choices: Record<string, ReceiptChoice> | null }[],
  positionId: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of receipts) {
    const picks = receiptPicks(r.choices?.[positionId]);
    for (const c of picks.length ? picks : ["abstain"]) counts[c] = (counts[c] ?? 0) + 1;
  }
  return counts;
}

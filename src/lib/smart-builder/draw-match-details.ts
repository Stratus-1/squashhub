/**
 * "Your match details" block for draw / round notices. Pure: built only from saved games,
 * court rows and linked court bookings for ONE recipient. Never guesses: anything not
 * saved shows "To be confirmed". Opponent phone numbers are never included — SquashHub has
 * no player consent to share mobile numbers, so players contact each other in the app.
 * The same function feeds the admin preview and the real send, so they cannot differ.
 */
export type DetailMatch = {
  id: string; group_number?: number | null; round_number?: number | null; stage_label?: string | null; status?: string | null;
  player_a_member_id?: string | null; player_b_member_id?: string | null; partner_a_member_id?: string | null; partner_b_member_id?: string | null;
  bye_member_id?: string | null; is_bye?: boolean | null;
  scheduled_date?: string | null; scheduled_time?: string | null; court_id?: string | null; play_by?: string | null; booking_id?: string | null;
};
export type DetailBooking = { id: string; status?: string | null; date?: string | null; start_time?: string | null; end_time?: string | null; court_id?: string | null };
export type DetailCourt = { id: string; name?: string | null; venue_name?: string | null };
export type DetailContext = {
  tournamentName: string;
  matches: DetailMatch[];
  names: Record<string, string>;
  categoryOf: (groupNumber: number | null | undefined) => string;
  courts: Record<string, DetailCourt>;
  bookings: Record<string, DetailBooking>;
  clubVenue?: string | null;
};
export type MatchDetail = {
  matchId: string; category: string; round: string; opponent: string; partner: string | null;
  when: string; time: string; court: string; venue: string; state: "booked" | "scheduled" | "play_by" | "tbc" | "bye"; status: string;
};

const TBC = "To be confirmed";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Tue 24 Nov 2026" from a saved calendar date — no timezone shift (dates are local club dates). */
export function dayLabel(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (!m) return TBC;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const hm = (t: string | null | undefined) => { const m = /^(\d{1,2}):(\d{2})/.exec(t ?? ""); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : ""; };
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));

const sideOf = (m: DetailMatch, id: string): "a" | "b" | null =>
  m.player_a_member_id === id || m.partner_a_member_id === id ? "a" : m.player_b_member_id === id || m.partner_b_member_id === id ? "b" : null;

export function matchDetailsFor(recipientId: string, ctx: DetailContext): MatchDetail[] {
  const out: MatchDetail[] = [];
  const nm = (id: string | null | undefined) => (id ? ctx.names[id] ?? "Player" : "");
  const mine = ctx.matches.filter((m) => sideOf(m, recipientId) || m.bye_member_id === recipientId)
    .filter((m) => !["cancelled"].includes(String(m.status ?? "")))
    .sort((x, y) => (x.scheduled_date ?? "9").localeCompare(y.scheduled_date ?? "9") || hm(x.scheduled_time).localeCompare(hm(y.scheduled_time)) || (x.round_number ?? 0) - (y.round_number ?? 0));
  for (const m of mine) {
    const category = ctx.categoryOf(m.group_number);
    const round = m.stage_label?.trim() || (m.round_number ? `Round ${m.round_number}` : "Round");
    const side = sideOf(m, recipientId);
    if (!side || m.is_bye || m.bye_member_id === recipientId) {
      out.push({ matchId: m.id, category, round, opponent: "Bye — you go through without playing", partner: null, when: "—", time: "—", court: "—", venue: "—", state: "bye", status: "Bye" });
      continue;
    }
    const opp = side === "a" ? [m.player_b_member_id, m.partner_b_member_id] : [m.player_a_member_id, m.partner_a_member_id];
    const partnerId = side === "a" ? (m.player_a_member_id === recipientId ? m.partner_a_member_id : m.player_a_member_id) : (m.player_b_member_id === recipientId ? m.partner_b_member_id : m.player_b_member_id);
    const oppNames = opp.filter(Boolean).map(nm).join(" & ");
    const b = m.booking_id ? ctx.bookings[m.booking_id] : undefined;
    const booked = !!b && String(b.status ?? "") === "active";
    const date = booked ? b!.date ?? m.scheduled_date : m.scheduled_date;
    const start = hm(booked ? b!.start_time ?? m.scheduled_time : m.scheduled_time);
    const end = booked ? hm(b!.end_time) : "";
    const courtId = (booked ? b!.court_id : null) ?? m.court_id ?? null;
    const court = courtId ? ctx.courts[courtId] : undefined;
    const state: MatchDetail["state"] = booked ? "booked" : date && start && courtId ? "scheduled" : !date && m.play_by ? "play_by" : "tbc";
    out.push({
      matchId: m.id, category, round,
      opponent: oppNames || TBC,
      partner: partnerId ? nm(partnerId) : null,
      when: state === "play_by" ? `Play by ${dayLabel(m.play_by)}` : date ? dayLabel(date) : TBC,
      time: start ? (end ? `${start}–${end}` : start) : state === "play_by" ? "Arrange with your opponent" : TBC,
      court: court?.name ?? (courtId ? `Court ${courtId}` : state === "play_by" ? "Book a court yourself" : TBC),
      venue: court?.venue_name || ctx.clubVenue || TBC,
      state,
      status: ["completed", "confirmed"].includes(String(m.status ?? "")) ? "Played" : String(m.status ?? "") === "in_progress" ? "In progress" : "Not yet played",
    });
  }
  return out;
}

const HEAD: Record<MatchDetail["state"], string> = {
  booked: "Court booking confirmed",
  scheduled: "Your match is scheduled for",
  play_by: "Arrange your match before the deadline",
  tbc: "Match details to be confirmed",
  bye: "Bye",
};

/** Email HTML (inline styles; every value escaped). Empty string when the player has no game in scope. */
export function matchDetailsHtml(items: MatchDetail[]): string {
  if (!items.length) return "";
  const row = (k: string, v: string) => `<tr><td style="padding:2px 10px 2px 0;color:#475569;white-space:nowrap">${k}</td><td style="padding:2px 0;color:#0f172a;font-weight:600">${esc(v)}</td></tr>`;
  const cards = items.map((d) => `<div style="margin:0 0 10px;padding:12px 14px;border:1px solid #cbd5e1;border-left:4px solid ${d.state === "booked" ? "#15803d" : "#1E3A5F"};border-radius:8px;background:#f8fafc">`
    + `<div style="font-size:13px;font-weight:700;color:${d.state === "booked" ? "#15803d" : "#1E3A5F"};margin-bottom:6px">${esc(HEAD[d.state])}</div>`
    + `<table style="font-size:14px;border-collapse:collapse">${row("Category", d.category)}${row("Round", d.round)}${row("Opponent", d.opponent)}${d.partner ? row("Your partner", d.partner) : ""}${row("Date", d.when)}${row("Time", d.time)}${row("Court", d.court)}${row("Venue", d.venue)}${row("Status", d.status)}</table></div>`).join("");
  return `<div style="margin:16px 0"><div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:8px">Your match details</div>${cards}`
    + `<div style="font-size:12px;color:#475569">Need to contact your opponent? Use the button below to open your fixture in SquashHub. Phone numbers are not shared by email.</div></div>`;
}

const TEXT_STATE: Record<MatchDetail["state"], string> = {
  booked: "Court booking confirmed",
  scheduled: "Scheduled by the organiser",
  play_by: "Arrange with your opponent before the deadline",
  tbc: "Details to be confirmed",
  bye: "Bye",
};

/** Plain text for WhatsApp / SMS / in-app. */
export function matchDetailsText(items: MatchDetail[]): string {
  if (!items.length) return "";
  return ["Your match details:", ...items.map((d) => d.state === "bye" ? `• ${d.category} · ${d.round}: bye`
    : `• ${d.category} · ${d.round} v ${d.opponent}${d.partner ? ` (with ${d.partner})` : ""} — ${d.when}, ${d.time}, ${d.court}${d.venue !== TBC ? `, ${d.venue}` : ""}. ${TEXT_STATE[d.state]}.`)].join("\n");
}

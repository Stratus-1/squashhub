// Pure helpers (no Deno/Node APIs) for the round-draw email call-to-action.
// The button must open EXACTLY the destination the tournament's Match Day QR
// encodes (the overall `/md/<token>` link) — no email-only or round-only URL.
// Shared with the app's tests so the email and QR can never drift.
export const PRODUCTION_ROOT = "squashhub.co.za";

export const DRAW_CTA_LABEL = "VIEW TOURNAMENT & SCORE MATCH";

/** Keep signed-in navigation; external messages reuse the overall QR destination. */
export function tournamentMessageAction<T extends { key: string; webUrl: string; label: string }>(action: T, qrUrl?: string | null): T {
  return action.key === "tournament_view" && qrUrl
    ? { ...action, webUrl: qrUrl, label: DRAW_CTA_LABEL }
    : action;
}

/** Approved notice templates already have a separate link variable. */
export function noticeTemplateVariables(body: string, url: string, label: string) {
  if (!url) return { message: body, link: "" };
  const suffix = `${label ? `${label}: ` : ""}${url}`;
  const message = body.endsWith(suffix) ? body.slice(0, -suffix.length).trimEnd() : body;
  return { message, link: url };
}

export function drawCtaCopy(roundNumber: number | null | undefined): string {
  const lead = roundNumber === 1 ? "Your first-round match has been drawn." : "Your match has been drawn.";
  return `${lead} Use the button below to view the tournament, follow the draw, score your match live, or submit your result after the match.`;
}

function base(subdomain?: string | null): string {
  const sub = String(subdomain || "").trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(sub) ? `https://${sub}.${PRODUCTION_ROOT}` : `https://${PRODUCTION_ROOT}`;
}

/** The overall Match Day link — identical to the QR card's "All Courts" link on production. */
export function tournamentDestinationUrl(token: string, subdomain?: string | null): string {
  return `${base(subdomain)}/md/${token}`;
}

/** Used only when Match Day Access is not switched on (there is no QR then). */
export function tournamentFallbackUrl(champId: string, subdomain?: string | null): string {
  return `${base(subdomain)}/club-champs/${champId}`;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export function champIdFromUrl(url: string | null | undefined): string | null {
  const m = String(url || "").match(new RegExp(`/club-champs/(${UUID.source})`, "i"));
  return m ? m[1].toLowerCase() : null;
}

export const LOGIN_CTA_LABEL = "LOG IN TO SQUASHHUB";

/** The club's own landing page, where members log in to manage their account. */
export function clubLoginUrl(subdomain?: string | null): string {
  return `${base(subdomain)}/`;
}

/** Third email button, same size as the other buttons. */
export function loginEmailButton(subdomain?: string | null): string {
  return `<div style="margin:20px 0"><a href="${clubLoginUrl(subdomain)}" style="display:inline-block;background:#1E3A5F;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px">${LOGIN_CTA_LABEL}</a></div>` +
    '<p style="font-size:12px;color:#64748b;margin:0">Log in to SquashHub to manage your account.</p>';
}

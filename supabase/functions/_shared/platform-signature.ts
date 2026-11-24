// SquashHub (platform) email signature — the single sign-off used on every
// letter SquashHub itself sends (platform updates, junior-leader welcomes).
// Club letters keep their own `clubs.email_signature_html`; this is the
// platform equivalent, so a SquashHub letter never goes out unsigned.
const PLATFORM_LOGO_BASE =
  'https://bzbuppwzljadulwntjys.supabase.co/storage/v1/object/public/club-logos/_platform';

export const SQUASHHUB_LOGO_URL = `${PLATFORM_LOGO_BASE}/squashhub-logo.png`;
export const STRATUS_LOGO_URL = `${PLATFORM_LOGO_BASE}/stratus-logo.png`;

/**
 * Closing sign-off block for a SquashHub letter: optional closing line
 * ("Kind regards,"), the sender, the company, the website and both logos.
 * Pass '' for letters that already end with their own closing line.
 */
export function platformSignature(closing = 'Kind regards,'): string {
  const closingLine = closing
    ? `<div style="font-size:13px;color:#1d2733;margin:0 0 6px">${closing}</div>`
    : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;color:#1d2733;font-size:13px;line-height:19px">
<tr><td style="padding:0 0 10px">${closingLine}<div style="font-size:14px;font-weight:700;color:#1e3a5f">Willem Pretorius</div>
<div>SquashHub | Stratus Software Solutions (Pty) Ltd</div>
<div><a href="https://squashhub.co.za" style="color:#1e3a5f;text-decoration:none">squashhub.co.za</a></div></td></tr>
<tr><td><img src="${SQUASHHUB_LOGO_URL}" alt="SquashHub" height="34" style="height:34px;vertical-align:middle;margin-right:18px" /><img src="${STRATUS_LOGO_URL}" alt="Stratus Software" height="64" style="height:64px;vertical-align:middle" /></td></tr>
</table>`;
}

/** Same signature without a closing line, for letters that already say it. */
export const PLATFORM_SIGNATURE_HTML = platformSignature('');

/** Identity + unsubscribe strip shown at the very bottom of every emailed
 *  platform update, below the signature and logos. */
export const PLATFORM_EMAIL_FOOTER_HTML = `<div style="margin-top:22px;border-top:1px solid #e2e8f0;padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94a3b8;line-height:1.6">
SquashHub — Stratus Software Solutions (Pty) Ltd, South Africa.<br>
Sent to you as a SquashHub club admin. Reply to this email or
<a href="https://squashhub.co.za/settings" style="color:#94a3b8">unsubscribe</a>.
</div>`;

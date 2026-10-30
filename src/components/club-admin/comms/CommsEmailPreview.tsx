import DOMPurify from "dompurify";
import { escapeHtml } from "@/lib/comms/render";

export type EmailPreviewClub = {
  email_signature_html?: string | null;
  email_disclaimer?: string | null;
};

/** Mirrors send-comms-campaign's standard email footer, without app CSS. */
export function CommsEmailPreview({ body, subject, club }: {
  body: string;
  subject: string;
  club?: EmailPreviewClub | null;
}) {
  const signature = club?.email_signature_html
    ? `<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:14px">${club.email_signature_html}</div>` : "";
  const disclaimer = club?.email_disclaimer
    ? `<p style="margin:14px 0 0;font-size:11px;color:#94a3b8;line-height:1.4">${escapeHtml(club.email_disclaimer)}</p>` : "";
  const html = DOMPurify.sanitize(`${body}${signature}${disclaimer}`);
  return (
    <iframe
      title={`Email preview: ${subject || "Untitled"}`}
      sandbox=""
      referrerPolicy="no-referrer"
      className="block h-[460px] w-full rounded border border-border sm:h-[560px]"
      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title><style>:root{--email-paper:#ffffff;--email-ink:#000000;color-scheme:light}html,body{background:var(--email-paper);color:var(--email-ink)}body{overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`}
    />
  );
}
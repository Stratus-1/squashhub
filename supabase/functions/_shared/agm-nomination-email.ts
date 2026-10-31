// Shared content contract for live nominations and test nominations.
export function nominationEmailData(o: {
  title: string; message: string; memberName: string; meeting: string; closes: string;
  url: string; test?: boolean; clubName?: string; clubLogoUrl?: string;
  signatureHtml?: string; disclaimer?: string;
}) {
  return {
    clubName: o.clubName, clubLogoUrl: o.clubLogoUrl,
    title: `${o.test ? '[TEST] ' : ''}${o.title} — nominations for the committee`,
    messageBody: o.message.trim()
      .replace(/\{\s*member[ _]name\s*\}/gi, () => o.memberName)
      .replace(/\{\s*meeting[ _]date\s*\}/gi, () => o.meeting)
      .replace(/\{\s*nominations[ _]close\s*\}/gi, () => o.closes),
    url: o.url, ctaLabel: o.test ? 'Make your nominations (test link)' : 'Make your nominations',
    signatureHtml: o.signatureHtml, disclaimer: o.disclaimer,
  };
}
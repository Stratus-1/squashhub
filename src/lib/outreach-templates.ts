// Starter email templates for platform outreach campaigns.
// Plain, inline-styled HTML — heavy templates trigger spam filters.

const WRAP = (inner: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#1f2937;max-width:600px">
${inner}
</div>`;

export const VIDEO_BLOCK_PLACEHOLDER = "{{video_block}}";

/** Builds the clickable YouTube thumbnail block. Never attach an MP4. */
export function buildVideoBlock(opts: {
  desktopUrl?: string | null;
  mobileUrl?: string | null;
  thumbUrl?: string | null;
}) {
  const { desktopUrl, mobileUrl, thumbUrl } = opts;
  if (!desktopUrl && !mobileUrl) return "";
  const primary = desktopUrl || mobileUrl!;
  const thumb = thumbUrl
    ? `<a href="${primary}"><img src="${thumbUrl}" alt="Watch the SquashHub overview" width="560" style="display:block;width:100%;max-width:560px;border-radius:10px;border:1px solid #e2e8f0"></a>`
    : "";
  const mobileLine =
    mobileUrl && desktopUrl
      ? `<p style="margin:8px 0 0;font-size:13px;color:#64748b">Watching on your phone? <a href="${mobileUrl}" style="color:#1d4ed8">Here's the mobile walkthrough</a>.</p>`
      : "";
  return `<div style="margin:22px 0">
${thumb}
<p style="margin:12px 0 0"><a href="${primary}" style="display:inline-block;background:#0E1F35;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">▶ Watch the 60-second overview</a></p>
${mobileLine}
</div>`;
}

export interface OutreachTemplate {
  key: string;
  name: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
}

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    key: "nsa",
    name: "NSA clubs (Pretoria / Squash Northerns)",
    subject: "{{club_name}}: submit your NSA league results straight from the app",
    preheader:
      "NSA-approved, tested in live league play — your captain marks and submits from his phone.",
    bodyHtml: WRAP(`<p>Dear {{contact_name}},</p>

<p>I'm reaching out to the committee at <strong>{{club_name}}</strong> about <strong>SquashHub</strong> — a club management platform built specifically for South African squash, not adapted from tennis or generic booking software.</p>

<p style="background:#f1f5f9;border-left:4px solid #0E1F35;padding:14px 16px;margin:20px 0">
<strong>SquashHub integrates directly with the NSA system — with NSA's approval, and fully tested in live league play.</strong><br><br>
Your club's NSA member list, league numbers, teams and fixtures are pulled straight from NSA. Your captain marks the scorecard on his phone — laid out exactly like the NSA form — and submits the result <strong>directly to the NSA site from the app</strong>.<br><br>
No paper scorecards. No re-typing. No logging into the NSA site a second time after the game. No emailing scorecards to a league convener on a Sunday night. The captain marks, submits, and it's done.
</p>

<p>What your club gets on day one:</p>
<ul style="padding-left:20px">
  <li><strong>Court bookings</strong> — a live grid your members use from their phones, no more WhatsApp scramble</li>
  <li><strong>NSA league management</strong> — fixtures, team allocation, reserves and substitution rules enforced automatically</li>
  <li><strong>Digital scorecards and live marking</strong> — spectators follow the score in real time</li>
  <li><strong>Club ladders and championships</strong> — challenges, auto-generated draws, playoffs</li>
  <li><strong>Member fees and payments</strong> — club dues, NSA levies and SSA fees per member, with card and recurring debit collection</li>
  <li><strong>Automated court lighting and access control</strong> — lights and doors follow the booking, so you stop paying for empty lit courts</li>
  <li><strong>Your own branded club site</strong> — yourclub.squashhub.co.za, with your logo and colours</li>
</ul>

${VIDEO_BLOCK_PLACEHOLDER}

<p style="background:#ecfdf5;border-left:4px solid #059669;padding:14px 16px;margin:20px 0">
<strong>{{club_name}} is already live on SquashHub.</strong><br><br>
Your club site is up and waiting at {{club_link}} — your NSA roster, league numbers and fixtures are already loaded.<br><br>
Your players simply open that link and register with their NSA number (or their personal details) — it takes 30 seconds and it's free for every player. Tell us who the committee members are and we'll switch on full admin access for them.
</p>

<p style="margin:20px 0"><a href="{{club_url}}" style="display:inline-block;background:#0E1F35;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Open {{club_name}} on SquashHub</a></p>

<p><strong>You can test it for free.</strong> It's free for players, always. If {{club_name}} would like to try the full club functionality as well, just let us know and we'll give your committee full admin rights so you can explore everything at no cost. A fee only becomes payable if the club decides to carry on using the full admin features.</p>

<p>If you'd like more information, you're most welcome to contact us.</p>

<p>Kind regards,<br><br>
<strong>Willem Pretorius</strong><br>
SquashHub — HKFT Services<br>
+27 83 375 9003<br>
<a href="https://squashhub.co.za" style="color:#1d4ed8">squashhub.co.za</a></p>`),
  },
  {
    key: "general",
    name: "General / non-NSA / international",
    subject: "Run all of {{club_name}} from one app",
    preheader:
      "Bookings, ladders, leagues, fees and lighting — one platform, one affordable price.",
    bodyHtml: WRAP(`<p>Dear {{contact_name}},</p>

<p>Most squash clubs are still run on a WhatsApp group, a wall chart and a spreadsheet that only one person understands. <strong>SquashHub</strong> replaces all three.</p>

<p>It's a club management platform built purely for squash — and priced for real clubs, not corporate gyms.</p>

<ul style="padding-left:20px">
  <li><strong>Court bookings</strong> from any phone, with clear rules for peak, off-peak, guests and members in arrears</li>
  <li><strong>Ladders and challenges</strong> — automatic rank movement, no manual updating</li>
  <li><strong>Leagues and club championships</strong> — fixtures, pools, playoffs and finals generated for you, spread across the dates you actually have courts</li>
  <li><strong>Run your own tournaments</strong> — club or interclub events with ease: entries, pools, draws, scheduling and results, all handled for you</li>
  <li><strong>Live match marking</strong> — digital scorecards, spectators can follow along</li>
  <li><strong>Member management and fees</strong> — dues, invoices, statements, card payments and monthly debit orders</li>
  <li><strong>Smart court lighting and access control</strong> — lights and doors follow the booking, cutting your electricity bill</li>
  <li><strong>Your own branded club site and app</strong> — your name, your logo, your colours</li>
</ul>

${VIDEO_BLOCK_PLACEHOLDER}

<p>Clubs are up and running in a matter of days — we import your existing member list for you.</p>

<p style="background:#f1f5f9;border-left:4px solid #0E1F35;padding:14px 16px;margin:20px 0">
<strong>Part of a regional league?</strong> If your club plays in a regional league (like NSA) where league results have to be submitted, just let us know and we'll add your league to SquashHub — your captains can then mark and submit results straight from the app.
</p>

<p><strong>You can test it for free.</strong> Visit our website and download the app — it's free for players, always. If {{club_name}} wants to try the full club functionality too, just let us know and we'll give your committee full admin rights to explore everything at no cost. A fee only becomes payable if the club decides to keep using the full admin features.</p>

<p>If you'd like more information, you're most welcome to contact us.</p>

<p>Kind regards,<br><br>
<strong>Willem Pretorius</strong><br>
SquashHub — HKFT Services<br>
+27 83 375 9003<br>
<a href="https://squashhub.co.za" style="color:#1d4ed8">squashhub.co.za</a></p>`),
  },
];

export const MERGE_FIELDS = [
  "club_name",
  "club_link",
  "club_url",
  "club_subdomain",
  "contact_name",
  "first_name",
  "role",
  "association",
  "city",
  "country",
] as const;

export const PROSPECT_STATUSES = [
  "new",
  "contacted",
  "opened",
  "clicked",
  "replied",
  "interested",
  "not_interested",
  "bounced",
  "unsubscribed",
] as const;

export const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  opened: "Opened",
  clicked: "Clicked",
  replied: "Replied",
  interested: "Interested",
  not_interested: "Not interested",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
};

export const CONTACT_ROLES = [
  "Chairman",
  "Secretary",
  "League convener",
  "Treasurer",
  "Coach",
  "Other",
];

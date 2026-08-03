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
  /** Prospect tags this template is written for — pre-selected as the audience. */
  suggestedTags?: string[];
  /** Short hint shown in the "New campaign" menu. */
  audienceHint?: string;
}

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    key: "nsa",
    name: "NSA clubs (Pretoria / Squash Northerns)",
    audienceHint: "Member clubs affiliated to NSA",
    suggestedTags: ["nsa-pretoria"],
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
    name: "General clubs / non-NSA / international",
    audienceHint: "Member-run clubs with a committee",
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
  {
    key: "commercial",
    name: "Commercial squash centres / venues",
    audienceHint: "Pay-to-play venues, leisure centres, academies",
    suggestedTags: ["commercial"],
    subject: "Fill your empty courts at {{club_name}}",
    preheader:
      "Online booking, automatic court lighting and in-house leagues that bring players back every week.",
    bodyHtml: WRAP(`<p>Dear {{contact_name}},</p>

<p>I'm writing to you about <strong>{{club_name}}</strong>. We build <strong>SquashHub</strong> — booking and player-management software made purely for squash venues, not adapted from generic gym software.</p>

<p>For a commercial centre the question is simple: how many of your court hours are sold, and how often does the same player come back? SquashHub is built around both.</p>

<ul style="padding-left:20px">
  <li><strong>Online court booking, 24/7</strong> — your customers book and pay from their phone. Peak and off-peak pricing, guest rates, cancellation windows and no-show rules are all handled for you.</li>
  <li><strong>Card payment up front</strong> — the court is paid for when it's booked, not chased afterwards.</li>
  <li><strong>Automatic court lighting</strong> — the lights switch on when the booking starts and off when it ends. Most venues see this pay for the software on its own.</li>
  <li><strong>Door and turnstile access</strong> — access follows the booking, so you can open early or run unstaffed hours safely.</li>
  <li><strong>In-house leagues, box leagues and ladders</strong> — the single best tool for turning a one-off visitor into a weekly booking. Fixtures, results and rankings run themselves.</li>
  <li><strong>Run your own tournaments</strong> — entries, pools, draws, scheduling and live results, with almost no admin from your staff.</li>
  <li><strong>Coaching and academy bookings</strong> — sessions, attendance and payment in the same system.</li>
  <li><strong>Occupancy reporting</strong> — see exactly which hours sell out and which need a promotion.</li>
  <li><strong>Your own branded booking site and app</strong> — your name, your logo, your colours.</li>
</ul>

${VIDEO_BLOCK_PLACEHOLDER}

<p>Set-up takes days, not months, and we import your existing customer list for you.</p>

<p><strong>You're welcome to test it at no cost.</strong> We'll switch on full access for your management so you can load your courts, your prices and your opening hours and see it working with real bookings. A fee only becomes payable if you decide to keep it.</p>

<p>If you'd like a short demo or more information, you're most welcome to contact us.</p>

<p>Kind regards,<br><br>
<strong>Willem Pretorius</strong><br>
SquashHub — HKFT Services<br>
+27 83 375 9003<br>
<a href="https://squashhub.co.za" style="color:#1d4ed8">squashhub.co.za</a></p>`),
  },
  {
    key: "association",
    name: "Associations / federations / regional bodies",
    audienceHint: "Provincial or national bodies and league organisers",
    suggestedTags: ["association"],
    subject: "Running the league for {{club_name}} — from entries to final log",
    preheader:
      "One platform for every affiliated club: fixtures, results, rankings and affiliation fees.",
    bodyHtml: WRAP(`<p>Dear {{contact_name}},</p>

<p>I'm reaching out to <strong>{{club_name}}</strong> because most of what an association does — fixtures, results, logs, rankings, affiliation fees and chasing captains on a Sunday night — is exactly what <strong>SquashHub</strong> was built to take off your hands.</p>

<p>SquashHub is a squash-specific platform already running live league play in South Africa, including direct result submission into a regional league system.</p>

<p>What it gives an association:</p>
<ul style="padding-left:20px">
  <li><strong>All your affiliated clubs on one system</strong> — each with its own branded club site, but reporting into your league.</li>
  <li><strong>Fixtures generated for you</strong> — divisions, rounds, home and away, spread across the dates and courts your clubs actually have.</li>
  <li><strong>Captains mark and submit from their phones</strong> — the scorecard is laid out exactly like your paper form. No re-typing, no emailed spreadsheets.</li>
  <li><strong>Logs and standings update instantly</strong> — points, rubbers, games and penalties calculated to your rules.</li>
  <li><strong>Your own rules engine</strong> — substitution limits, movement caps, reserve eligibility and gender rules are enforced automatically instead of argued about afterwards.</li>
  <li><strong>Player registration and league numbers</strong> — one verified record per player, carried across seasons and clubs.</li>
  <li><strong>Affiliation and levy collection</strong> — bill clubs or members directly, with card and debit-order collection and a full statement trail.</li>
  <li><strong>Rankings and championships</strong> — regional events, draws and results in the same place.</li>
</ul>

${VIDEO_BLOCK_PLACEHOLDER}

<p>Clubs join for free as players, so there is no barrier to getting your whole league on board.</p>

<p><strong>Happy to set up a live demo of your own league</strong> — loaded with your real club list and divisions — so your committee can see it with your own data before deciding anything.</p>

<p>If you'd like more information or a short call, you're most welcome to contact us.</p>

<p>Kind regards,<br><br>
<strong>Willem Pretorius</strong><br>
SquashHub — HKFT Services<br>
+27 83 375 9003<br>
<a href="https://squashhub.co.za" style="color:#1d4ed8">squashhub.co.za</a></p>`),
  },
  {
    key: "education",
    name: "Schools & universities",
    audienceHint: "School squash programmes and university sport",
    suggestedTags: ["school", "university-squash"],
    subject: "Squash at {{club_name}} — courts, teams and results in one place",
    preheader:
      "Court bookings, team selection, internal leagues and results for your squash programme.",
    bodyHtml: WRAP(`<p>Dear {{contact_name}},</p>

<p>I'm writing about the squash programme at <strong>{{club_name}}</strong>. <strong>SquashHub</strong> is a squash-specific platform that handles the admin around a school or university squash setup so your coaches can spend their time on court.</p>

<ul style="padding-left:20px">
  <li><strong>Court bookings</strong> — students and staff book from their phones, with rules for practice slots, team training and open play.</li>
  <li><strong>Internal ladders and box leagues</strong> — automatic rank movement, which makes team selection objective and takes the arguments out of it.</li>
  <li><strong>Team management</strong> — squads, availability, line-ups and fixtures against other institutions.</li>
  <li><strong>Live match marking and digital scorecards</strong> — parents and supporters can follow matches in real time.</li>
  <li><strong>Internal tournaments</strong> — house competitions, closed championships and inter-res events, drawn and scheduled for you.</li>
  <li><strong>Player records</strong> — results and progress carried across seasons, so you can track development year on year.</li>
  <li><strong>Automatic court lighting and access control</strong> — courts open only for booked sessions, which cuts electricity and after-hours risk.</li>
</ul>

${VIDEO_BLOCK_PLACEHOLDER}

<p>It's free for players, always — so there's no cost to your students.</p>

<p><strong>You're welcome to test the full system at no cost.</strong> We'll load your courts and your squad list and give your coaches full access so you can see it working with your own players. A fee only becomes payable if the institution decides to carry on with the full admin features.</p>

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

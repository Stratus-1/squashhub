# Manage Tournament hub + round-by-round communications (audit and proposal)

Nothing is built yet. This plan is for approval only.

## 1. Audit: where tournament admin happens today

| Entry point | Where it lives | What it does | Who sees it |
|---|---|---|---|
| Member tournament page | `/club-champs/:champId` (`ClubChampsView.tsx`) | Fixtures, standings, results, plus a "Tournament Administration (Admin only)" accordion, the Attendance/Registrations panel (Paid, Confirm, Confirm all), Diamond standings | Everyone; admin parts need `canManage` = tournament permission or club admin, and are hidden on match-day devices |
| "What's next" bar | `TournamentNextActionBar.tsx` (inside the member page) | Next Swiss round / next knockout round, "Send draw to players" | Admins |
| "Open the tournament control page" button | Member page, line ~2225 → `/beta-tournament/:champId` | Opens a second page | Admins |
| Tournament Control page | `/beta-tournament/:champId` (`BetaTournamentOperate.tsx`) | Tabs: Overview, Games, Run stages (admins only), Entries. Only for tournaments built with the Step-by-Step setup; Diamond League and older tournaments get "open it here" back to the member page | Any signed-in user can open the page; Run stages needs `canManage` |
| Tournament management view | Club Admin → Tournaments → Manage (`ClubTournamentBeta` → `StepTournamentManagement`, `StepRunOverview`) | Planned timeline, lifecycle, Edit setup, Inform players, Generate draw | Club admins |
| Current Builder management | Club Admin → Tournaments (`ClubChampsTab.tsx`, about 7,000+ lines) | Older-style setup, invites, WhatsApp sends, Diamond League setup | Club admins |

So which screen an organiser lands on depends on how the tournament was made:
- **Step-by-Step tournaments:** the member page, the control page and the management view.
- **Diamond League:** the member page and the Current Builder only.
- **Older / Current Builder tournaments:** the member page and the Current Builder.

**Shared business logic already exists and stays the single source of truth.** It covers:
- progression (`src/lib/tournaments/progression.ts`)
- the engine (`engine-service.ts`, `generateStructuredTournament`)
- Swiss and next-round generation (`use-generate-next-round.ts`, `NextRoundDrawDialog`, `AllNextRoundDrawsDialog`)
- knockout (`KnockoutCard`, `StepKnockoutRoundsPanel`)
- stages (`StageProgressPanel`)
- scheduling (`fixture-scheduling.ts`, `round-plan.ts`, `stage-schedule.ts`)
- entrants (`entrant-status.ts`)

The hub only rearranges where these controls live. It must not re-implement any of them.

### Duplicated controls found
- **Generate the next round** sits in three places: the "What's next" bar (member page), Run stages (control page) and the management view.
- **Entries / registrations** appear three times: the member-page registrations panel, the control page's Entries tab and the builder's entrants step.
- **Games list:** the member page fixtures and the control page's Games tab.
- **Overview / lifecycle:** the control page Overview and `StepRunOverview` both show it.
- **"Send draw to players":** the "What's next" bar has it, and five generation paths also ask "send now?" with a browser confirm.

### Notification audit (critical)
These all call `notifyRoundDraw` straight after a draw is saved:
- `ConfirmDrawDialog`
- `AllNextRoundDrawsDialog`
- `use-generate-next-round`
- `StepGenerateDrawPanel` (line ~523)
- `StageProgressPanel` (line ~40)
- `StepKnockoutRoundsPanel` (line ~300)

Each one is protected only by a browser OK/Cancel box (`askSendDrawNotices`). That box defaults to **send** when there is no browser window, and one answer is reused for 15 seconds across several calls. So today **generating a draw can send messages**, which breaks the new rule.

Other details:
- `notify_champ_round_draw` (backend) sends in-app and email itself, and returns WhatsApp text for the browser to send.
- Channels come from `club_champs.invite_methods`, not from a choice the admin makes when sending.
- No per-round "sent" record exists, so the app cannot show Not sent / Sent / Changes not communicated.
- Result messages after a match (`queue_champ_result_emails` + `dispatch-champ-result-messages`) are a separate, opt-in setting. They are out of scope and stay unchanged.

### Which messaging actually works (to confirm in Phase 0 by reading logs only, sending nothing)
- **In-app:** works everywhere, through the notifications table.
- **Email:** through the club's own email settings and the Communications engine (`send-comms-campaign`). It only works for clubs whose email is set up.
- **WhatsApp:** through the shared SquashHub number. It is per-club opt-in and billed per message. Messages to players who haven't replied recently need approved templates (`club_notice`).
- **SMS:** through the platform SMS gateway. It is per-club and billed.
- **Riverside:** confirm which of these are actually switched on. Riverside is only treated as a basic test site, and no test will message real members.

## 2. Proposed design: one "Manage Tournament" hub

**Route:** `/club-champs/:champId/manage`, admin-only (`canManage`). Anyone else is sent back to the member page. Match-day devices never see it.

**Single link:** at the top of the member tournament page, one "Manage tournament" button shown only to admins. It replaces the admin accordion, the "Open the tournament control page" button and the "What's next" bar on the member page. The member page keeps only fixtures, bookings, results, standings and the player's own entry.

**Tabs (the same for every format; parts that don't apply are hidden):**
1. **Overview:** lifecycle and the next action per category/division (from `progression.ts` / `run-overview`), warnings (unpaid entries, unsent changes), and Edit setup (opens the existing builder at the right step).
2. **Rounds & Fixtures:**
   - Round robin: pools and rounds.
   - Swiss: "Generate next round", using the existing Swiss engine.
   - Knockout: the bracket and the next round (`KnockoutCard`).
   - Multi-stage/weekend: Run stages and the planned timeline (`StageProgressPanel`, play-offs).
   - All formats: fixture edit, reschedule, courts.
   - "Generate all rounds now" where the format allows. It is never offered for Swiss or knockout rounds that depend on earlier results.
3. **Players & Entries:** the existing registrations panel moved here (Paid, Confirm, Confirm all, invite, withdraw/replace, partners).
4. **Notifications:** see section 3.
5. **Settings:** result-notification settings, the WhatsApp group link, and scoring/serving rules (existing cards moved here).

The `/beta-tournament/:champId` page and the Club Admin "Manage" card both open the hub. The old route stays as a redirect, so saved links still work.

## 3. Round-by-round communications

**Hard rule:** generating, regenerating, confirming or editing a draw never sends anything. All six automatic `notifyRoundDraw` calls are removed from the generation paths, and `askSendDrawNotices` is retired.

**After the first draw is generated,** a dialog offers Preview / Send first round now / Later. "Send" opens the send flow below. It never sends straight away.

**Notifications tab:**
- One row per round, and per category/division where they run separately.
- Each row shows: Not sent / Sent (date, who sent it, channels, how many players) / Changes not communicated (number of affected players). History opens when you expand the row.
- Swiss and knockout rounds only appear once real pairings exist.
- Actions: **Send now**, **Send later** (scheduled through the existing Communications scheduling and cancellable), **Resend all** (shows a warning that it was already sent), **Send changes only** (only players whose opponent, date, time or court changed since the last send), and **Choose recipients**.
- **One round at a time:** each send covers exactly one round (optionally one category/division). There is no "send all rounds" button, even when all rounds are generated upfront.
- **Updated notices** are clearly marked: the subject and opening line say "UPDATED: Round N", and the message says what changed (e.g. "Court changed from 2 to 3").
- **Where it appears:** the same round rows also show inside the management view's Planned timeline (one row per stage, round and category/pool). Later rounds are handled there without reopening setup.
- **Message content by fixture type:**
  - Fixed date, time and court: opponent, date, time and court.
  - Play-by-date: opponent, the opponent's contact details (only where permitted), the deadline and how to book.

**Trigger for round 2 onwards (per round, set in the Planned timeline):**
- **Manual** (the default): nothing happens until the admin presses Send.
- **When the previous round is completed:** the recommended and default behaviour is **Prompt admin**. When the last result of the previous round is in (and, for Swiss/knockout, the next pairings have been generated), the round is marked "Ready to send". The admin gets an in-app alert and still goes through preview, channels and confirmation.
- **Automatic send** is an extra opt-in only. It needs:
  - the admin to switch it on explicitly for that round
  - the channels chosen and confirmed at the moment it's switched on
  - pairings generated and marked "checked" by the admin
  - one send per round and fixture snapshot, enforced by a stored key, so a re-run or regeneration can never send twice
  - any later change to show as "Changes not communicated", never resent automatically
- **Uitsig and any test tournament** stay on Manual or Prompt only. A per-club switch can turn automatic send off entirely and is off by default.

**Send flow (every time, nothing pre-ticked from setup):**
1. Choose channels: Email / WhatsApp / SMS / In-app, any combination. A channel the club hasn't switched on shows as unavailable with the reason. WhatsApp and SMS show the estimated cost from the existing messaging rates.
2. A preview for each channel shows the opponent (the latest confirmed one), the opponent's contact details (only if the club's privacy settings allow), the date/time/court or play-by deadline, and booking instructions.
3. Recipient count, with players who can't be reached on a chosen channel listed.
4. "Send test to me" sends to the admin only.
5. A clear "Send to N players via X" confirmation.
6. Delivery status per player and channel afterwards.

**Delivery** goes through the existing Communications engine (`comms_campaigns` + `send-comms-campaign`), with per-player text in `member_vars` and `meta { tournament_id, round, group, purpose: "round_draw" | "round_changes" }`. That gives the delivery log, retry safety and audit trail without a new sending system.

**Preventing duplicate sends:**
- Each send has an idempotency key made from the round, the fixture snapshot, the channel set and the recipients.
- The Send button is disabled while a send is running.
- Resending needs a second confirmation.

**Detecting unsent changes:** each send stores a snapshot (fixture id, opponent, date, time, court, deadline). The tab compares current fixtures with the last snapshot and flags differences. Edits only flag the change; they never send.

## 4. Risks
- Admins used to the accordion or control page: the redirect from the old route keeps their links working, and the single button sits in the same spot.
- Diamond League and older tournaments have never had a control page. The hub must load them on the existing engines (Diamond uses `team_league_events`), with nothing converted.
- `ClubChampsTab` is very large, so pieces will be moved out of it step by step, never rewritten.
- Removing the automatic send changes behaviour: tell organisers "players are no longer messaged automatically".
- WhatsApp needs approved templates for players who haven't replied recently. Each preview will show if a template is missing.
- Privacy: the opponent's phone number is shown only where the existing rule allows it.

## 5. Phased plan (nothing is removed until its replacement is verified)

**Phase 0: verify, read-only.** Confirm which channels each club has switched on (including Riverside), list every caller of `notify_champ_round_draw`, and capture the current admin screens per format as a baseline.

**Phase 1: safety first.** Remove automatic sending from all six generation paths. After the first draw, show Preview / Send / Later, with Send still going through the existing round-notify. Tests check that generating, regenerating, confirming and editing make no notify calls.

**Phase 2: hub shell.** Add the `/manage` route behind `canManage`, with Overview, Rounds & Fixtures and Players & Entries reusing the existing components. Add the "Manage tournament" button. The old controls stay in place but are marked as moved.

**Phase 3: Notifications tab.** Store each send (a small table for round sends and snapshots, which is the only schema change, with RLS limited to club admins), the channel picker, previews, test-to-self, costs, Send / Resend / Send changes only / recipient choice, delivery through the Communications engine, and the unsent-changes flag.

**Phase 3b: round triggers.** Add the Manual / When previous round completed setting, with the "Ready to send" prompt. Automatic send comes last, behind the per-club switch (off by default) and the safeguards above. It is tested only on Riverside test data with sends intercepted.

**Phase 4: parity check per format,** across round robin, Swiss, knockout, multi-stage/weekend, Diamond League and older tournaments. Every action from the old screens must be available in the hub.

**Phase 5: tidy up.** Remove the accordion, the "What's next" bar and the control-page tabs from the member page. `/beta-tournament` becomes a redirect, and the Club Admin "Manage" button opens the hub.

## 6. Acceptance tests
- Generating, regenerating or confirming a draw, generating the next round, generating all rounds, starting a stage or editing a fixture creates no campaign, notification, email, WhatsApp or SMS. These are unit tests with the senders mocked.
- The first draw shows Preview / Send / Later, and "Later" sends nothing.
- A Swiss or knockout round can't be notified before its pairings exist.
- Changing a sent fixture shows "Changes not communicated (N)". "Send changes only" reaches only those N players.
- Channels must be picked every time, unavailable channels can't be picked, and cost and recipient count are shown.
- Test-to-self reaches only the admin. Double-clicking Send produces one campaign.
- History shows each send with who sent it, when, the channels and the delivery results.
- A non-admin opening `/manage` is redirected, and the member page shows no admin controls.
- Every format opens the same hub, and all existing data (registrations, scorecards, bookings, fixtures, results) is unchanged before and after.
- Browser tests only use Riverside test data or intercepted sends. No real member is messaged.

## Technical notes
- Key files: `ClubChampsView.tsx`, `BetaTournamentOperate.tsx`, `TournamentNextActionBar.tsx`, `round-notify.ts`, `ConfirmDrawDialog.tsx`, `AllNextRoundDrawsDialog.tsx`, `use-generate-next-round.ts`, `StepGenerateDrawPanel.tsx`, `StageProgressPanel.tsx`, `StepKnockoutRoundsPanel.tsx`, `StepTournamentManagement.tsx`, `StepRunOverview.tsx`, `ClubChampsTab.tsx`, `lib/comms/send.ts`.
- The backend `notify_champ_round_draw` stays for now. The new flow builds per-player text from the same wording, so messages stay identical across channels. Once the new flow is verified, the backend function stops being called automatically.
- New rule in `AGENTS.md`: draw generation never dispatches messages, and round communications only go out from Manage Tournament → Notifications.

## Tournament Registration, Fees & Partner Selection

### Schema (migration 1)
- Add to `club_champs`:
  - `registration_mode` text default `'open'` check in (`'open'`,`'invite'`)
  - `partner_mode` text default `'admin'` check in (`'admin'`,`'players'`)
  - `registration_opens_at` timestamptz null
  - `registration_closes_at` timestamptz null
  - `entry_fee_cents` integer default 0 check >= 0
  - `payment_methods` text[] default `'{card}'` (any of `card`, `eft`)
  - `payment_required` boolean default true
  - `entries_locked` boolean default false (admin flips when ready to schedule)
- New table `club_champs_registrations`:
  - id, champ_id, club_member_id, partner_member_id, partner_confirmed bool,
  - status text check in (`pending_payment`,`pending_eft`,`paid`,`waived`,`cancelled`),
  - fee_paid_cents int default 0, payment_ref text, paid_at timestamptz,
  - invited_by_admin bool default false, created_at, updated_at
  - unique(champ_id, club_member_id)
  - RLS: members see own + admin sees all in their club
- Extend `yoco_payment_sessions.purpose` check to include `'tournament'`
  add column `champ_registration_id uuid` null

### Tournament create wizard (`ClubChampsTab.tsx`)
- New "Registration & Payment" step in the create-tournament dialog with the seven new fields. Doubles-only shows partner_mode.

### Admin Registrations tab (new dialog or section in ClubChampsTab)
- List of registrations for selected champ: name, status badge, partner, paid amount, actions:
  - Mark EFT paid (creates manual payment record + status=paid)
  - Override partner (picker)
  - Cancel registration / Waive fee
  - Invite member (when registration_mode=invite)
- "Lock entries" button — only paid (or waived) registrations roll into `club_champs_entries` then unlocks scheduling.

### Member registration flow
- New banner on Dashboard + `Tournaments.tsx`: "Tournament XYZ — register by DATE"
- "Register" button creates `club_champs_registrations` row status=`pending_payment`
- If `entry_fee_cents` > 0 → kick off Yoco checkout with `purpose='tournament'` and `champ_registration_id`
- Webhook (`yoco-verify-checkout`) — when purpose=tournament marks registration paid
- Once paid (and partner_mode=players) → partner picker (filter by gender: men's → male only, ladies' → female only, mixed/open → any). Picking sets partner_member_id + sends invite notification. Partner accepts → partner_confirmed=true.
- Admin can always override pairings.

### Notifications
- New notification types: `tournament_registration_open`, `tournament_payment_required`, `tournament_partner_invite`, `tournament_partner_confirmed`, `tournament_registration_closing`

### Build order (this loop)
1. Migration
2. Wizard step in ClubChampsTab
3. Admin Registrations dialog
4. Member registration UI + payment kick-off
5. Yoco webhook extension
6. Partner picker + notifications

### Out of scope
Refunds, multi-currency, discount codes, partner waitlist, PayFast (yoco only — only gateway currently configured).

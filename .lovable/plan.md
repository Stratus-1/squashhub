## Goal

Bulk-register the doubles entrants at Nelspruit and email each new visitor a Nelspruit-branded confirmation with a one-click magic-link. Reusable as more entries come in.

## How sign-in works for the entrant

Admin does the registration — the entrant just clicks a link.

1. Admin pastes/imports the list in the dialog.
2. Server creates the auth user + Nelspruit `club_members` visitor row (partner, division, home club all filled in) before the email is sent.
3. Entrant gets an email from Nelspruit Squash Club with a **Sign in to Nelspruit** button.
4. Clicking it signs them in — no registration form, no password. They land on the Nelspruit page already recognised as a visitor for this tournament.
5. No password is set. Magic-link only. Future logins: they request another magic-link from the login page.

## Approach

### 1. Edge function `bulk-register-visitors` (admin-only)

Input: `club_id`, `tournament_id`, entrants `[{ first_name, last_name, email, phone, gender, home_club_name, division, partner_name }]`.

Per entrant:
1. **Match existing accounts** (`lower(email)` / digits-only phone / `lower(name)`).
2. **Already a Nelspruit member** → skip, status `already_member`.
3. **Exists at another NSA club** → insert a Nelspruit `club_members` visitor row reusing the same `user_id`. Status `linked_visitor`. Still send the confirmation email.
4. **Brand new** → create auth user (email pre-confirmed, no password) + profile + Nelspruit visitor row. Status `created`.
5. Generate a magic-link with `admin.auth.admin.generateLink({ type: 'magiclink' })`.
6. Enqueue confirmation email via `send-transactional-email` using the new template below, passing the magic-link, tournament name, partner, and division.

Returns per-row results the UI renders.

### 2. Email template `tournament-entry-confirmation.tsx`

Nelspruit navy/amber branding. Body: "You're entered in the Nelspruit Doubles Tournament", entry summary (division, partner, start time/venue), big **Sign in to Nelspruit** magic-link button. Registered in the transactional template registry. I'll check `email_domain--check_email_domain_status` first and run infra/scaffold setup only if needed.

### 3. Admin UI: `TournamentBulkImportDialog.tsx` (from `ClubChampsTab`)

- New **Bulk import entrants** button on the tournament editor.
- Textarea that parses the Google-Form paste (pre-filled with Aam's 15 rows) + **Add row** for one-offs.
- Each row shows a badge from the cross-match: *Already a Nelspruit member*, *NSA member at Glenwood — will link as visitor*, or *New — will be created*.
- Editable columns: name, email, phone, division, gender, home club, partner.
- **Import & email** → calls the edge function → shows per-row status + **Copy CSV** (name, email, magic-link, status).
- Per row after import: a **Send WhatsApp** icon (opens `wa.me/<phone>` with a pre-filled message including the magic-link) — admin taps it manually, one at a time. No automated Twilio.

### 4. Pre-filled data for Aam

Once approved I'll open the dialog with the 15 rows populated and cross-match already applied. The already-Nelspruit rows get skipped; the ~15 new-or-visitor rows get processed on click.

## Deliverables

- `supabase/functions/bulk-register-visitors/index.ts`
- `supabase/functions/_shared/transactional-email-templates/tournament-entry-confirmation.tsx` + registry entry
- `src/components/club-admin/TournamentBulkImportDialog.tsx` + wire-up in `ClubChampsTab.tsx`

## Confirmed with you

- Magic-link email to every new/visitor entrant. ✅
- WhatsApp = manual per-row `wa.me` click after import. ✅
- No password fallback — magic-link only. ✅

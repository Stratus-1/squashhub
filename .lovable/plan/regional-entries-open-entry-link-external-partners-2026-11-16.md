# Regional entries: open entry link + external partners

Two linked features for regional tournaments like Uitsig's No Frills Doubles. Most NSA clubs (Kentron, Pierre van Ryneveld, Centurion, etc.) already have NSA player lists on SquashHub, but nobody there has a login, email or phone number. Most players do have an NSA number on file (Kentron 39 of 43, Pierre van Ryneveld 70 of 78).

## A. Open entry link ("Join this tournament")

The organiser gets one link to share, for example in WhatsApp groups or with other clubs: **Invitations → Share open entry link** (copy / WhatsApp / QR). It only appears for Regional or National tournaments.

What a player sees:

```text
1. Tournament card      name, host club, categories, fee, entries close date
2. "Which club do you play for?"   eligible clubs only (e.g. the 22 NSA clubs)
3. Three choices:
   a) I already use SquashHub        -> sign in -> step 4
   b) I'm a member of this club      -> look for myself on the club's list
                                        (NSA number, or name)
        found      -> claim it, create login (email, cell, password)
        not found  -> "Register as an existing member" (not on the list yet,
                      e.g. never played NSA leagues): name, gender, cell, email
   c) I'm not a member of this club  -> new member at this club
4. Enter the tournament  -> the normal personal entry page: categories,
                            partner, payment (methods as per tournament setup)
```

Rules for each path:
- **a) Existing user:** a member at another eligible club (e.g. CSIR) goes straight to entry. Members of several clubs keep all their memberships.
- **b) I'm a member of this club.** The player doesn't need to know whether they're already on SquashHub. They say "I'm a member" and the app searches for them.
- **b1) Found on the list, so they claim it:**
  - If the NSA number matches, the profile is linked straight away, using the existing league-number claim.
  - If it's a name-only match, it's held for the **tournament organiser to approve**. Until then the player can fill in the entry, but it stays "Awaiting organiser". The approval counts for this tournament only and never gives club admin rights.
  - The duplicate-person check runs first, so nobody ends up with two profiles.
- **b2) Not found, so they register as an existing member.** This is for real members who were never on the list, for example because they've never played NSA leagues.
  - **No new-member or joining fees are charged.** They skip the fee-category step of a new application.
  - Saved as "existing member, awaiting club confirmation".
  - **Club on SquashHub:** the club admin confirms or rejects them in Members. The tournament entry can go ahead while that's pending.
  - **Club not on SquashHub:** they're added as a pending member, same as below, and the club confirms them once it signs up.
  - The duplicate-person check runs first, so someone already on another club's list keeps one national profile.
- **c) New member (not a member of this club):**
  - **Club on SquashHub (SLA or trial):** a normal membership application, with entry allowed while it's pending.
  - **Club not on SquashHub (Kentron):** the player is added to that club's list as a **pending, tournament-only member**. They aren't billed or counted, get no club access, and can't book courts. This is a narrow exception to the "no applications at unsigned clubs" rule and covers nothing else. When the club signs up, its admin sees these players flagged "joined via tournament" and can approve or remove them.
- **From registration to entry, one continuous flow:** registering creates the login and signs them in, then they land straight on this tournament's entry page (categories, partner, payment). There's no second link or click.
- **Coming back later:** the same open link recognises a signed-in player and opens their entry. On a new device they sign in first. They also get a personal entry link by email/SMS as a backup.
- Club confirmation of an existing or new member runs in the background and never holds up the entry.
- Each person gets one national profile and one entry per tournament. Re-using the link never duplicates anything.

## B. Inviting listed players who have no contact details

- Regional invites already let you tick clubs, and from the club list you can tick individual players. Players with no email or cell will show a "no contact, share link" marker instead of being silently skipped.
- The send summary will say: "12 can't be reached by message. Share the open entry link with them." For each of those players the organiser can copy a ready-made WhatsApp message containing the open link.

## C. Entering and paying for an external partner

- New tournament setting under **Who may enter**: **"Allow players to enter a partner from outside"**. It's off by default.
- On the partner picker, after "Search invited players…", there's a new option: **"My partner isn't on the list"**:
  1. Pick the partner's club from the eligible clubs, or choose "No club".
  2. Search that club's list (name or NSA number). If they're found, use that profile.
  3. Otherwise type their name and gender, plus an optional cell and email. They become a pending tournament-only member of that club, same as A(c). With "No club" they're saved as a tournament guest of the host club.
  4. The pair is formed and the paying player is charged for both fees. This uses the existing "pay for partner" option, so it is charged once and never twice.
- **No partner confirmation is needed.** The organiser sees the pair marked "entered by <player>" and can remove it.
- If a cell or email was given, the partner gets an optional "You've been entered, claim your SquashHub profile" message. It goes out only through the tournament's chosen channels.
- Minimum personal details: the paying player ticks "My partner agreed to be entered". The partner's phone is never shown to other players.

## Payments

- Payment methods are exactly as set up for the tournament.
- "Charge to my account" only appears for payers who have an account at the host club. A pending Kentron player can't run up a debt at Uitsig.

## What stays unchanged

Existing entries, pairs, payments, games, the invite links already sent and club-only tournaments stay as they are. Nobody is invited or messaged automatically.

## Rollout

Riverside test tournament first (synthetic Kentron-style club), then Uitsig No Frills Doubles once you've signed it off.

## Technical details

- **Route** `/t/:champId/join` (and the `/c/:subdomain/...` twin). It reuses `tournament_public_summary` and `tournament_invite_scope_tree` (scope-filtered clubs), and adds `returnTo` support to `ClubAuth` and the claim flow.
- **New RPCs** (SECURITY DEFINER, rate-limited, audited):
  - `tournament_join_find_member(champ, club, nsa_no | name)`: masked results only, never phone or email.
  - `tournament_join_register_pending(champ, club, details)`: creates a `club_members` row with `is_pending_approval=true`, `billing_exempt=true`, `registration_source='tournament_link'`, `person_id` via the duplicate guard. It's allowed only when the club is eligible for that tournament and the tournament has the open link enabled.
  - `tournament_join_claim_request(...)`: name-only claims, approved via `champ_join_claim_review` by `can_manage_tournament`.
  - `tournament_join_register_existing(champ, club, details)`: "existing member, not listed". It creates `club_members` with `is_pending_approval=true`, `join_kind='existing_unlisted'`, no fee rows, `billing_exempt` until the club confirms, and `person_id` via the duplicate guard. Club Admin confirms with an "Existing member (unlisted)" label. New members use `join_kind='new'` and follow the club's normal fee setup once the club accepts applications.
- **Gating:** `club_accepts_membership_applications` stays as it is. The tournament path is a separate writer that never makes an active member, so normal club signup stays blocked at unsigned clubs.
- **External partner:** `propose_doubles_partner_external(champ, group, club|null, details|member_id, pay_for_partner)` lives beside `propose_doubles_partner`. It's gated by a new `tournaments.allow_external_entries` (default false, set from Who may enter → `persistStepTournament`). It reuses `step_charge_pair_to_account` / pay-for-partner. "No club" guests are host-club `role='visitor'` rows tagged `tournament_guest`, excluded from every picker by the existing visitor-pass rule. The eligibility trigger allows them only when `allow_external_entries` is on.
- **Pending members:** excluded from billing, member counts, booking pickers, comms audiences and ladders. Club Admin → Members gets a "Joined via tournament (pending)" filter with Approve / Remove.
- **Invite panel:** members without a channel are listed as "share link" rows, with copy-message helpers. Nothing is sent automatically.
- **Tests:** join-path decisions (pure), existing-unlisted members get no fee rows, duplicate-person reuse, unsigned-club exception scoped to the tournament path only, name-only claim stays pending, external partner blocked when the setting is off, pay-for-partner charged once, account option hidden for non-host payers.
- AGENTS.md rules and the issue-log entry are added when this is implemented.

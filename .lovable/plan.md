# Tournament WhatsApp groups — findings and plan

## Headline finding (this changes the recommendation)

Meta does have a native WhatsApp Groups API (launched 6 Oct 2025, Cloud API), **but**:

- **Maximum 8 participants per group.** That is a Meta platform limit, not ours.
- Our two live CSIR tournaments have **111 and 49 invited/entered players**. A native group cannot hold them.
- **Twilio does not expose the native Groups API.** Twilio's "WhatsApp group messaging" sample is a Conversations fan-out — parallel 1-to-1 chats behind one business number, 24-hour reply windows, no real group, no invite link, no group icon. Twilio's sample repo is archived. Not equivalent, and we should not ship it as a group.
- Using Meta Cloud API directly would require migrating our number out of Twilio (or registering a second number), plus Official Business Account status. Meta does not support one number being driven by two providers at once.
- Native groups are also invite-link-only (no adding people directly), and block interactive messages, view-once, edit and delete.

**Conclusion:** native tournament WhatsApp groups are not achievable for tournaments of our size on any provider today. The plan below therefore builds everything the user-facing feature needs around an **admin-provided WhatsApp group invite link** (an ordinary WhatsApp group, up to 1024 members, created once on the admin's phone), with the API-native path kept as a clean future swap behind one interface.

## A. Current architecture (verified)

- `supabase/functions/send-whatsapp` — one shared SquashHub sender via the Twilio connector gateway; falls back to a club's own Twilio credentials in `club_secrets`. Honours `clubs.whatsapp_enabled`, per-member `whatsapp_opt_out`, approved templates in `whatsapp_templates`, logs to `whatsapp_send_log`, and bills per message.
- `supabase/functions/whatsapp-inbound` — Twilio webhook; matches a reply to a pending `whatsapp_interactions` row by phone and writes the answer back (RSVP, tournament entry).
- `whatsapp-templates-sync` — registers/approves templates on Twilio Content API.
- Invites already have a canonical tenant-aware link shape: `https://<club>.squashhub.co.za/i/<token>` plus short codes (`src/lib/tournaments/invite-link.ts`).
- Tournaments live in `club_champs` (+ `club_champs_registrations`, `entries_locked`, `registration_closes_at`). Withdrawal logic is centralised in `src/lib/tournaments/withdraw.ts` (walkover to opponent on unplayed games, purge from seeding/draw).

None of this is touched destructively by the plan.

## B/C. Options compared

| | Native Meta Groups API | Twilio Conversations | Admin-pasted group link (recommended now) |
|---|---|---|---|
| Real WhatsApp group | Yes | No | Yes |
| Size limit | 8 | ~50 (simulated) | 1024 |
| Reachable with our Twilio setup | No | Yes | Yes |
| Name / description | API | n/a | Manual |
| Icon | Not documented as settable | n/a | Manual |
| Admin-only posting | "Update group settings" exists; parameter not documented | n/a | Manual toggle in WhatsApp (announcement mode), members can still be allowed to add others |
| Add people | Invite link only | n/a | Invite link |
| Delete/close | API | n/a | Manual |

## D. Recommended architecture

One `tournament_whatsapp_group` record per tournament with a `provider` field (`manual` today, `meta_native` reserved). Everything in the app — settings card, join buttons, deep links, invite tracking — reads that record and does not care which provider produced the link. If Meta lifts the 8-person cap or Twilio ships the API, we add a provider without touching the UI.

## E. Schema

New table `public.tournament_whatsapp_groups`:
`id, champ_id (fk club_champs, unique), club_id, provider ('manual'|'meta_native'), invite_url, group_name, description, announcements_only (bool), created_by, status ('active'|'closed'|'archived'), closed_at, created_at, updated_at`.
GRANTs: select/insert/update/delete to `authenticated`, all to `service_role`; RLS — read by anyone who may view the tournament, write by tournament admins only.

New table `public.tournament_whatsapp_group_invites`:
`id, group_id, champ_id, member_id, phone, sent_at, join_clicked_at, channel, created_at` — tracks who we sent the link to and who tapped it. WhatsApp gives us no join confirmation, so "joined" is inferred from the click only and labelled as such.

## F. UI and flows

**Admin (tournament setup → new "Tournament WhatsApp group" card):**
- Explains the 8-person native limit plainly and asks for a group invite link created on the admin's phone.
- Suggested group name defaults to the tournament name prefixed by the owning tenant (club / association / federation — resolved from `club_champs.owner_org_id`/`club_id`, never hard-coded).
- Copy-ready description text containing the two deep links below, so the admin can paste it into the group description and pin it.
- Checkbox "announcements only" with step-by-step instructions (WhatsApp: Group settings → Send messages → Only admins; "Edit group info/add members" can stay open to everyone, so participants may invite others while only admins post).
- Buttons: send the link to all entrants, close group (stops automation, keeps history), archive.

**Player:** "Join tournament WhatsApp group" on the registration success page and in My Tournaments, shown only when a link exists. Joining is never treated as registration — SquashHub stays the source of truth.

**ENTER deep link** `/t/<champ-short-code>/enter`:
1. Ask membership number + last 4 digits of the registered mobile — lookup only.
2. On match, send a one-tap confirmation link to the full registered number (or use an existing signed-in session) before anything is written. Last-4 is never accepted as authentication on its own.
3. No member record: club championship → that club's registration/onboarding, then straight back to the tournament; regional/national → general SquashHub registration with club selection first, then back.
4. Then the normal entry flow (divisions, partner, fee, payment) unchanged.

**WITHDRAW deep link** `/t/<champ-short-code>/withdraw`:
1. Same lookup, same confirmation-to-full-number step.
2. Before draw/fixtures exist and while entries are open: confirmed self-withdrawal, using the existing `withdraw.ts` path (cancel entry, purge from seeding/draft).
3. After fixtures exist or `entries_locked`: no silent change — create an admin-routed withdrawal request; the organiser applies the existing walkover logic so opponents stay alive.

## G. CSIR backfill (Nelspruit excluded)

Two tournaments at CSIR (`e41098d4-…`):
- `6th vs 7th League Players Bells Get Together at CSIR` — 10 paid, 38 invited.
- `CSIR Doubles Rotation Bells Open - 24 Sep 2026` — 8 paid, 101 invited.

For each: the admin creates the group on their phone, pastes the link, and we send a one-off template message with the join link to every non-cancelled entrant who has not opted out (paid entrants first, invited entrants optional). No one is added automatically — WhatsApp does not allow it, and opt-in is respected. Sends go through the existing `send-whatsapp` function, templates and billing.

## H. Safeguards

- Membership number + last-4 is a lookup, never authentication; the confirming step always goes to the full registered number or an existing session.
- Rate-limit and lock lookups after repeated failures; never reveal whether a membership number exists, and never echo a full phone number or email back to the browser.
- Group links are shown only to people the tournament's own eligibility rules already allow to see it.
- Existing WhatsApp opt-out and club opt-in are honoured for every group-related send.

## I. Fallback

The manual link *is* the fallback and the day-one path, so a missing group never blocks a tournament: every screen hides the join button when no link exists and everything else works unchanged.

## J. Acceptance tests

- Group record saves, is tenant-scoped, and is readable only by people allowed to see the tournament.
- Join button appears on the success page and My Tournaments only when a link exists; joining does not create or change an entry.
- Enter deep link: matched member reaches the correct tournament entry flow after confirmation; unmatched member lands in the right registration path and returns to the same tournament.
- Withdraw deep link: before fixtures → entry cancelled via existing logic; after fixtures → request created, draw untouched.
- Last-4 alone never completes an enter or withdraw.
- Existing WhatsApp sends, templates, opt-outs and billing behave exactly as before.

## Questions

1. Given the 8-participant native cap, confirm we proceed with the admin-pasted group link approach (recommended) rather than pausing the feature.
2. For the two CSIR groups: send the join link to paid entrants only, or to all invited players as well?
3. Should the group link also be included in tournament invite emails, or WhatsApp/in-app only?

# AI Help Assistant BETA — permission-aware, confirmed, audited

## What already exists (to reuse, not duplicate)
- **Help bubble** (`FeedbackFab`): switches between the searchable help/support panel and the club AI assistant.
- **AI assistant** (`ai-assistant` function + `AiAssistantPanel`): answers questions, offers links only from an approved list, and already runs one confirmed action (court booking: propose → Confirm → create). It is controlled per club by `club_ai_settings` (on/off, audience, actions on/off).
- **Support tickets** (`support_threads` / `support_messages` with attachments, `/support` for members, `/admin/support` for Super Admin).
- **Activity log** `audit_events` (who, club, entity, action, before/after, reason).
- **Voice**: Tournament Beta record → transcribe → edit → Send (`VoiceInputButton`, `smart-tournament-transcribe`).
- **Permissions**: club `role='admin'`, granular `club_permissions` slugs, `has_role` for Super Admin, captain = league-scoped only.

## Rollout control
- New beta flag `ai_actions` in the existing `club_beta_features` table (same Super Admin card pattern as Tournament Beta). Start with **Riverside only**.
- Guidance/help keeps following `club_ai_settings` (broader). Data-changing actions only run when the club has `ai_actions` switched on **and** the action is in the approved catalogue.

## Assistant experience (inside the existing bubble)
- Text box + **microphone** (same record → transcript → edit → Send pattern; audio is never stored) + **attach screenshot** (up to 3 images, saved in the existing support attachments storage, sent to the AI as context).
- The app sends page context: club, member, role, current page, and any tournament/match/fixture ID in the URL.
- Replies are answers, links, guided steps, an **action preview card**, or an **escalation card**.

## Action layer (first beta catalogue — deliberately small)
| Action | Who may use it | Reversible |
|---|---|---|
| Create a court booking (existing) | Members at clubs with bookings on | Yes (cancel booking) |
| Cancel my own future booking | The booking owner | Yes (restore booking) |
| Replace a player in a tournament entry, future/unplayed games only | Club admin or Tournaments permission, own club's tournaments | Yes (swap back) |
| Correct my member profile contact details (phone/email) | That member | Yes (restore previous values) |

Every action is a named server operation with: permission check → load records → build plain-language preview → Confirm → execute → verify → audit. The AI can only *propose* an action name + arguments; it never writes data.

**Replace player rules:** finds the tournament, both players and the entry in the caller's club; blocks if the new player is already entered or not a club member; only changes unplayed fixtures and the entry/pairing list; completed results, scores and payments history are listed as "will not change". Same logic used in the Nelspruit Maria → Marina swap.

## Confirmation card (mandatory before any change)
What you asked · What I'm going to change · Records affected · Important consequences · What will NOT change · **Confirm** / **Cancel**. The preview is signed and stored server-side; Confirm only works on that exact stored preview (no edits in between, expires after 15 minutes, one-time use).

## Escalation
Automatically creates a support ticket (existing system) when: no permission, unclear intent, action not in catalogue, sensitive/irreversible (payments, deletions, results, rankings, ladder, devices, fees), or an error/bug. The ticket carries the original text/transcript, screenshots, page, record IDs, what the AI found, the proposed action and the reason. Routed to Super Admin; club admins also get an in-app notice for member-permission requests in their club. The user is told a ticket was opened and gets the link.

## Super Admin oversight
New **"AI Activity"** tab on `/admin/support` next to the existing tickets: date, user, club, role, request/transcript, screenshots, page, AI interpretation, proposed action, confirmed yes/no, action run, before/after, status, escalation/errors, linked ticket. Filters by club, status, action.

## Rollback
Shown only for actions with a defined inverse and only while still safe (e.g. booking not yet played, replaced player has no results recorded since). Super Admin sees a preview of the reversal → Confirm → inverse operation runs → new activity + audit entry linked to the original. Originals are never edited or deleted. Otherwise shows "Manual review required".

## Technical details
- Migration: `ai_assist_interactions` (request, transcript, attachments, context, interpretation, proposal jsonb, preview hash, status, confirmed_at, result, before/after, error, ticket_id, rollback_of). RLS: user sees own rows; Super Admin sees all; writes only via the function (service role). Grants per project rules. Seed `club_beta_features('ai_actions')` for Riverside.
- Security-definer helper `ai_can(action, club_id, target_id)` built on existing role/permission checks.
- Edge function `ai-assistant` extended: `mode: ask | propose | confirm | rollback`; action modules in `supabase/functions/ai-assistant/actions/*.ts`; every execute writes `audit_events` + interaction row. Model stays as currently configured for chat; screenshots sent as image parts.
- Frontend: extend `AiAssistantPanel` (attachments, voice reuse, preview/escalation cards), `useAiAssistant` context (route IDs), `AiActivityTab` in `AdminSupport`, `ai_actions` toggle in the Super Admin beta clubs card.
- Tests: catalogue permissions, preview→confirm integrity, replace-player never touches completed fixtures, rollback availability rules.
- Legacy help panel, existing tickets and the Tournament Beta untouched. Nothing published until asked.

## Still escalates (not executed in v1)
Result/score changes, standings/rankings/ladder, fees, payments/refunds, member deletion or merges, role/permission changes, league lineups, draws/rebuilds, device/door/lights control, anything cross-club, and any request where records are ambiguous.

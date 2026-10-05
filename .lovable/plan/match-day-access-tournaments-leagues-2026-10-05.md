# Match Day Access (tournaments + leagues)

One shared feature: a secure, no-login link and QR that lets court tablets, players and spectators score matches, follow live games and see fixtures, results and standings for one competition. It never shows admin, payments, player management or other club data.

## What admins get
- A **Match Day Access** section in:
  - Manage Tournament (classic Club Champs and the Step-by-Step Beta tournaments)
  - League management, per league season
- Actions: Enable access, Copy link, Show QR, Print QR codes, Revoke, Regenerate.
- Each competition has:
  - **One overall link**, labelled "All Courts – Scoring, Live & Standings"
  - **One permanent link per court** that the competition uses. The Court 3 link always shows Court 3's current or next match.
- **Print QR codes** creates an A4 sheet. The overall code is at the top, with labelled Court 1, Court 2, … codes in cut-out tiles. It reuses the existing poster/PDF style.
- **Regenerate** stops all old links (overall and per-court) working straight away. **Revoke** turns access off.

## How long links last
- Tournament: from the first match date until the last match date, plus a short grace period. This covers multi-week Club Champs.
- League: the season's start and end dates. If those dates aren't set, it uses the first and last fixture plus a grace period.
- The end date is worked out when someone opens the link, so moving dates never requires a new link. After the end, the page shows "This competition has finished" and only results and standings, with no scoring.

## What someone with the link sees
A public page at `/md/<token>`, or `/md/<token>/court/<n>` for a court. It is phone- and tablet-friendly and refreshes automatically. Tabs:
- **Now / Next**: on court links, the current match with a large Score button and then the next match.
- **Fixtures**: today first, then upcoming.
- **Live**: scores updating as they happen.
- **Results** and **Standings**: these reuse the existing standings logic.
- **Score**: opens the same marker/scorecard used today, in token mode. It works only for matches in this competition that are not yet finalised.

## Scoring safety
- Token scoring goes through one server function. It checks:
  - the token is valid and in date
  - the match belongs to that competition (and that court, for court links)
  - the match is not locked or finalised
- It then saves with the same rules the logged-in flow uses. It does not add a second set of scoring rules.
- Every submission is recorded as "Match Day Access (overall / Court N)" with device info. It is never credited to a member.
- Admin pages and routes stay behind login. The token gives no access to anything else.
- The current logged-in scoring flow does not change.

## Emails
- Tournament round/fixture emails and league fixture emails get an "Open scoring" button plus a QR image, but only when Match Day Access is on.
- If the court is known, the email links straight to that match on that court. Otherwise it links to the overall page.
- Emails use the existing permanent links. No new token is created per email.

## Assumptions (please correct if wrong)
- A device holding the token can score any open match in that competition. Court links can only score matches on their own court.
- League "courts" are the home club's courts on fixture night.
- Spectators and scorers share the same link. There is no separate view-only link for now.

## Testing
Automated tests cover:
- the validity window for a weekend tournament, a multi-week Club Champs and a full league season
- court link resolving to the current or next match
- revoke and regenerate
- expiry falling back to read-only
- a token being refused for admin actions, other competitions or locked matches
- email links with and without a known court

Browser checks will use Riverside test competitions only. No real emails will be sent, and nothing will be published until you ask.

## Technical details
- New table `match_day_access` with columns: id, club_id, competition_kind (`tournament` | `league_season`), competition_id, token_hash (sha256), status, created_by, created_at, revoked_at, regenerated_from.
  - GRANTs plus RLS limited to club admins with tournament/league permission.
  - The raw token is shown only to admins via RPC, stored encrypted or rebuildable through a security-definer reveal function.
- Per-court links are `token + court key`, so there is no extra token per court.
- Edge function `match-day`:
  - `GET context` returns read models only (fixtures, live, results, standings), built from existing loaders in `src/lib/tournaments` and `src/lib/leagues`, ported to shared code.
  - `POST score` writes through the existing scoring writes (`club_champs_matches`, `league_match_results`/fixture results, live marker sessions) with service role, after the checks above.
  - Audit rows go to `audit_events` with `actor_kind='match_day_access'`.
- Marker/scorecard components get a `scoringAdapter` prop (authenticated vs token) instead of being duplicated.
- Email: `dispatch-champ-result-messages`, `notify-league-week-kickoff` and `send-comms-campaign` gain a `match_day_link` merge field and a QR image (hosted PNG generated by the function) when access is enabled.
- Domain rule recorded in `src/lib/AGENTS.md`.

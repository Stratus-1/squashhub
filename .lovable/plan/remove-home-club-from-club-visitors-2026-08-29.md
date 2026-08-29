# Remove "home club" from club visitors

A visitor is a local guest who plays a casual game at the club. A player from another club must register on SquashHub under their own club and be invited to regional or national events — they are never captured as a visitor. The home-club field on visitors is retired, with a per-club switch to turn it back on if a club still needs it.

## What changes for users

- Visitor sign-up on a club site no longer asks for (or shows) a home club. It captures name, contact, and category only.
- Club Admin > Visitors: the "Home club" column, the edit field, and the whole "Home clubs" management list are hidden. Adding a visitor no longer requires a home club.
- A new club setting, **Ask visitors for a home club** (off by default), restores the old behaviour for any club that wants it.
- Where a visitor appears in bookings, match results, and the match marker, they show as "Visitor" instead of "Visitor · Randburg".
- Nelspruit and CSIR data is tidied: visitor records that name another club keep their history but stop advertising a club affiliation.

## What is deliberately NOT changed

- No visitor records, matches, bookings, bar tabs, or stats are deleted. Nothing is renamed in a way that breaks a past result.
- The historic club name is preserved in the database (visible to super admin only), so the "Randburg"/"Mittal" league guests in Nelspruit remain traceable.
- Ladder and ranking exclusion of visitors already in place stays exactly as it is.
- Association/NSA home-club fields (used for league affiliation and provisioning) are untouched — those are a different concept and still required.

## Verified current state

- `club_visitors` has 5 rows: 4 at Nelspruit, 1 at CSIR; all carry a home club name (White River, De Kaap, Nelspruit, University of Pretoria).
- 56 `club_members` rows have role `visitor`; 24 of them carry `home_club_name` (Randburg, Mittal, Glenwood, White River, PCC, Maties, etc.). None sit on a ladder.
- `club_visitors.home_club_name` is `NOT NULL`, so the column cannot simply be dropped without a default.
- The curated list lives in `club_visitor_home_clubs` and is read by the visitor sign-up picker and the Visitors tab.

## Technical steps

0. **Fix the in-flight build break first.** `src/lib/tournaments/knockout.ts` currently references `buildGraduatedFirstRound` without importing it (typecheck error from the graduated-knockout work in progress). Restore/complete that import before anything else.

1. **Schema (migration)**
   - `clubs.visitor_home_clubs_enabled boolean NOT NULL DEFAULT false` — the opt-in switch.
   - `ALTER TABLE club_visitors ALTER COLUMN home_club_name SET DEFAULT 'Visitor'` so inserts without the field succeed. Column and data retained.
   - Keep `club_visitor_home_clubs` (no drop) — it is only read when the switch is on.

2. **Data cleanup (run_sql, non-destructive)**
   - Copy the current value into a preserved note before clearing: `club_visitors.home_club_name` → `'Visitor'`, and `club_members.home_club_name` → `NULL` for `role = 'visitor'`, only where the club has the switch off. Prior values are captured in an `audit_events` row per club so nothing is lost.
   - Scope the first run to Nelspruit and CSIR, then apply to remaining clubs once verified.

3. **Front end**
   - `src/pages/ClubAuth.tsx` — drop the home-club step/picker from visitor sign-up unless `visitor_home_clubs_enabled`; remove the picker query in that case. Add a short line: players from another club should register with their own club and be invited.
   - `src/components/club-admin/VisitorsTab.tsx` — hide the home-club column, edit field, add-visitor field, and the "Home clubs" management card behind the same flag; make the add form valid without a home club.
   - `src/pages/Bookings.tsx`, `src/pages/AddMatchResult.tsx`, `src/pages/MatchMarker.tsx`, `src/components/marker/MarkerSetup.tsx` — display just the visitor's name (fall back to "Visitor") when no home club is present; keep the existing search behaviour working.
   - Club Admin settings — add the "Ask visitors for a home club" toggle next to the other visitor settings.

4. **Edge functions**
   - `register-visitor-user` and `bulk-register-visitors` accept a missing `home_club_name` and default it to `Visitor`; keep accepting it when supplied so imports and the association/NSA paths are unaffected.

5. **Checks**
   - Visitor sign-up, admin add-visitor, booking a visitor, entering a visitor result, and marking a visitor game all pass with no home club.
   - Existing Nelspruit visitor matches and stats still resolve to the same people.

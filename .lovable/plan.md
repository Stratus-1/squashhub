# Fix: doubles pairs look like they aren't saving (super admin can't see them)

## What's actually happening

Your pairs **are** being saved. The database currently holds 29 pair rows, all on Riverside Squash Club, the most recent written at 17:42 today ("Doubles Captains"). None of them are duplicates.

The problem is reading them back, not writing them:

- The access rule for viewing pairs requires you to be a **member of that club**. The rules for creating, editing and deleting pairs additionally allow platform-level admins.
- You are the platform super admin and not a `club_members` row of Riverside, so the write succeeds and the read-back returns nothing.
- The dialog inserts without asking for the row back, so it gets no error, shows "Pair created", then refreshes the list — which comes back empty. It looks exactly like "nothing saved".

## The fix

1. **Let platform admins view pairs, not just write them.**
   Align the view rule with the create/edit/delete rules so a super admin sees the same pairs a club admin sees. Club members' visibility is unchanged — no widening for ordinary users.

2. **Make a silent write impossible in future.**
   The Manage Pairs dialog will ask the database to return the created row and treat "saved but not readable" as an error with a clear message, instead of a false success toast. Same for removing a pair.

3. **Audit the same blind spot on the neighbouring league tables.**
   Check the view rules on the other tables the league setup writes (team registrations, league rules, season rows) for the same pattern — write allowed for platform admins, read restricted to club members — and align them the same way. Only rules that already grant platform admins write access get their read aligned; nothing else is loosened.

4. **No data cleanup needed.** The 29 existing pairs are valid and duplicate-free; they will simply become visible.

## Technical detail

- Migration: replace the `Club members can view their club pairs` policy on `public.league_team_pairs` with `USING (public.is_club_member(auth.uid(), club_id) OR public.is_club_admin(auth.uid(), club_id))`. `is_club_admin` already covers the `user_roles` admin/moderator platform roles, so no new helper is required.
- Same review/migration pass for `member_league_registrations`, `league_rules`, `league_seasons`, `leagues` SELECT policies where the write policy uses `is_club_admin` but the read policy uses `is_club_member`.
- `src/components/club-admin/DoublesPairsDialog.tsx`: `insert(...).select("id").single()` and `delete(...).select("id")`, throwing when zero rows come back ("Saved, but this club's pairs aren't visible to your account"), so RLS read gaps surface immediately.
- No change to `validate_league_team_pair_scope` — it correctly derives `club_id`/`season_id` from the league row.

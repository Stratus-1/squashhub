# Federation Tree Build-out via SportyHQ Scraping

Grow the federation tree (National → Association → Club → Player) by discovering clubs per association and their rosters from SportyHQ public pages, into a **staging area** that a super admin reviews before anything touches live `organisations`, `clubs`, or `people`.

## Principles

- Nothing auto-writes into the live federation tree. Scrapes land in staging tables; a human promotes rows.
- Throttled, resumable batches (same pattern as `sportyhq_lookup_attempts`): per-run limits, delays between requests, attempt counters, cooldowns.
- Every discovered entity keeps its SportyHQ id + source path so re-runs update instead of duplicating.
- Existing SquashHub clubs/members stay authoritative — scraped data only fills gaps or proposes links.

## Phase A — Club discovery per association

- New staging table `sportyhq_orgs`: sportyhq id/path, name, kind (governing body / club), parent sportyhq id, region/location, member count, `matched_org_id`, `matched_club_id`, `status` (new / matched / ignored / promoted), timestamps.
- New edge function action `scrape_orgs` on `sportyhq-lookup` (or a dedicated `sportyhq-tree-scrape` function): given a governing-body page, parse its affiliated club list, upsert into `sportyhq_orgs`, and fuzzy-match each club against existing `clubs` and `organisations` by normalised name + location (reuse the `norm`/`clubScore` helpers already in the lookup function).
- Runs are recorded (started/finished, counts, errors) so a partial run can be resumed.

## Phase B — Roster discovery per club

- New staging table `sportyhq_org_members`: sportyhq org id, sportyhq user id, name, profile path, plus `matched_person_id` / `matched_club_member_id` and `status`.
- New action `scrape_org_roster`: walk a club's public member list (paged), upsert rows, and match each player against `people` and `club_members` using the existing deep-match scoring. Full profile fetch stays lazy — only on promote or explicit request — to keep request volume low.
- Reuses `sportyhq_profiles` for anyone already linked; no duplicate profile rows.

## Phase C — Review & promote UI

- New "Federation tree" tab on the Super Admin Rankings/Federation page:
  - Association picker → list of discovered clubs with match state (green = matched to an existing club, amber = probable match, grey = new).
  - Per club: "Link to existing club", "Create organisation node", or "Ignore".
  - Drill into a club → roster list with the same three-state matching and per-player promote/link/ignore, plus a bulk "link all confident matches".
  - Run controls: "Scrape clubs", "Scrape roster", with progress, last-run time and error surface.
- Promotion writes through existing paths: `organisations` + `organisation_relationships` for clubs, `people` (+ `sportyhq_profiles` link) for players. DOB stays private per existing rules.

## Phase D — Refresh & hygiene

- Scheduled weekly low-volume refresh of already-promoted orgs only (detect renames, new members, departures) — flagged as diffs for review, never auto-applied.
- Dedupe guard so a person discovered under two clubs collapses onto one `people` row.

## Technical notes

- Scraping only public pages, with the existing browser UA, sequential requests and ~250–500 ms spacing; per-run caps (e.g. 25 orgs / 200 players) so a single invocation stays inside the edge-function time budget.
- All staging tables get GRANTs + RLS restricted to platform super admins (`has_role(auth.uid(),'admin')`); service role for the edge function.
- Match scoring extracted into `src/lib/federation/sportyhq-match.ts` so UI and function share one implementation, with unit tests for the name/club normalisation cases.
- If SportyHQ page layouts differ from the profile pages already parsed, Phase A starts with a single association (NSA) to validate selectors before widening.

## Order of work

1. Staging schema + RLS (Phase A & B tables in one migration).
2. Scraper actions with run limits and matching, validated against NSA.
3. Review UI + promote actions.
4. Scheduled refresh.

# Diamond League inside the normal tournament setup

## What you'll get
- In the normal tournament setup's first step, **Diamond League (teams)** becomes the second format choice, next to the existing formats. It isn't a separate card any more.
- The rest of the setup is the normal setup, so it gets everything the other formats already have:
  1. **Category / audience:** club, or a regional or association event (same "who may enter" rules as today).
  2. **Structure:** team size (4, 6, …), number of divisions and teams per division, and your options for level ties, tie-breaks and a level final.
  3. **Registration:** entry fee and closing date, using the existing registration and payment rules.
  4. **Courts:** pick Court 1–4. The existing venue and courts step is reused.
  5. **Invites:** send invitations by email or WhatsApp the usual way. Players register and pay as they do now.
  6. **Allocate players:** the section at the bottom of today's Diamond League screen moves here. Each division shows its teams with numbered slots (#1 to #6). As players register, they are **placed in the slots automatically** by strength, using the same ranking choice as the other formats (ladder, club, regional or national ranking, or manual). The admin can **drag players between slots and teams**, or back to an "unallocated" list.
  7. **Schedule:** your dates and times. Weekly ties are generated from the round-robin pairings and spread across the courts you picked.
  8. **Review and create.**
- Once the event is running, the same tables, results, "Create semis" and "Create finals" you liked stay as they are.

## Behaviour rules
- Automatic placement fills only empty slots. It never moves a player the admin has placed by hand.
- If a player withdraws, their slot empties and gets flagged. It is not reshuffled.
- Unticking someone who hasn't registered yet still works as it does now, without a withdrawal.
- Existing Diamond League test events stay openable.

## Still needs your answer later
- The absent-player rule: substitute, or forfeit the game? For now it stays "admin enters the score".

## Technical details
- Add `diamond_league` as a format in `ClubChampsTab` STEPS flow; the structure step renders a Diamond League panel (team size, divisions, teams per division, tie options) stored in the tournament's config.
- Registrations and invites reuse the existing tournament registration/invite tables and host-club payment rules; eligibility/regional scope unchanged.
- New pure helper `autoSlotPlayers(registrations, ranking, teams, lockedSlots)` in `src/lib/tournaments/team-league.ts` (snake across teams by strength, respects locked manual slots), with vitest tests.
- The "players/groups" step renders the extracted allocation grid from `TeamLeagueManager` (drag and drop between slots); allocations are persisted on the tournament (link `team_league_events.tournament_id` via a small migration, keeping existing standalone rows valid).
- Schedule reuses `team-league.ts` pairing + court allocation; running view keeps `TeamLeagueManager` tables/semis/finals, loaded by tournament id.
- Preview only; no publish until asked. Log in the issue log and `AGENTS.md`.

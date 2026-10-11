# Opponent contact sharing (all clubs, preview only)

## What I found
- No screen shows opponent numbers today. That includes league games (Nelspruit too), ladder challenges, tournament My Games and draw emails. So there is no existing Nelspruit opponent-contact screen to copy. The closest pattern is the "Open your fixture in SquashHub" contact route in draw emails.
- Consent today is one general "I accept the Terms and Privacy Policy" date, recorded at signup. Nothing records agreement to share a number with opponents.
- Juniors: age is worked out from date of birth or SA ID, but there is no field for a parent or guardian's contact.
- The Privacy page has a general children clause, but nothing about sharing numbers for matches.

**Privacy conclusion:** the general signup acceptance does not cover showing members' numbers to opponents. Numbers will be shown only for players who have **actively said yes** to sharing. Everyone else stays hidden, along with existing members who haven't been asked yet. Nothing is backdated.

## What players will see
1. **Contact sharing choice** in Settings and in the tournament / league entry forms:
   "Share my mobile number with my scheduled opponents so we can arrange matches." The default is OFF. A short notice explains that it's only for arranging matches and you can change it at any time.
   - For juniors under 18, a parent or guardian enters their own name and mobile, ticks consent, and that number is shared instead. The child's number is never shown.
2. **Opponent contact on my fixtures** (tournament My Games, league game details, ladder challenge card):
   - If the opponent has said yes: their name, a mobile number you can tap to call, and a WhatsApp button. For juniors this shows "Parent/guardian: Name".
   - If they haven't: "Contact via SquashHub" (current route) with no number.
3. **Personal fixture emails and in-app notices**: the opponent's number is added only when that opponent has said yes and the email goes to the actual opponent in that game. The Player Notifications preview shows exactly the same thing.
4. **Never shown:** public tournament/QR pages, public results, the TV display, member directories, the invite directory, or bulk exports.
5. **Privacy page:** a new "Match contact sharing" section covering purpose, who can see your number, opt-in, how to withdraw, and how juniors are handled. Updated date.

## Safety checks
- Numbers come only from a secure backend check that returns contact details for one game at a time, and only if you are a player (or linked family account) in that game, the game isn't finished or cancelled, and the opponent agreed.
- The check is rate-limited per user and every lookup is logged (who, which game, when), not the number itself.
- No change to who can see the existing member and profile records.
- Withdrawing consent hides the number everywhere immediately.

## Technical details
- Migration: `member_contact_sharing` table (one row per person: `person_id`, `share_with_opponents`, `consented_at`, `withdrawn_at`, `guardian_name`, `guardian_phone`, `guardian_consented_at`, `source`), with RLS so you can manage only your own row or a linked family member's row; `opponent_contact_access_log`.
- Security-definer RPC `get_fixture_opponent_contacts(p_kind 'champ'|'league'|'ladder', p_fixture_id)`: resolves caller's member ids via person link and family delegations, verifies participation, returns opponents' `{name, phone, is_guardian}` only where consent exists; minors (via DOB/SA ID age) return the guardian phone or nothing. Rate limit 60/hour.
- Server-side email composer reads the same consent rule; `draw-match-details.ts` gains an optional `contact` per opponent, plus a test that it never appears without consent or for non-opponents.
- Shared `OpponentContact` component used by Tournaments, MyChampionships, LeagueGameDetail and MyChallenges.
- Consent UI: `ContactSharingCard` in Settings; a checkbox in `TournamentInviteRegisterDialog` and `LeagueSignup`.
- Tests: consent off/on, withdrawn, junior with and without guardian, non-participant denied, finished game denied, public pages never call the RPC.
- Record the rule in `src/lib/AGENTS.md`; add an issue-log entry.

## Not doing
No live registration changes, no consent backfill, no notifications sent, no publish.

## Please confirm
- Junior age cut-off: under 18.
- Should numbers stay visible after a game is completed (for reschedules or disputes), or be hidden? The plan hides them once the game is completed.

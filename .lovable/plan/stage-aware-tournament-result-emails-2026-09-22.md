# Stage-aware tournament result emails

## What is happening now

The result email is currently selected only by **win or loss**. It does not inspect the match's stage, even though each fixture already stores labels such as **Quarter-final**, **Semi-final**, and **Final**.

Sherique's match is confirmed in the live data as a completed knockout fixture labelled **Final**. The generic winner wording therefore incorrectly told her that another round was coming.

## Plan

### 1. Establish one server-side result classification

Before an email is queued, classify the completed fixture as one of:

- ordinary pool / round-robin / Bells match
- early knockout round
- quarter-final
- semi-final
- title final
- third-place or other placement play-off

Use the fixture's stored stage and stage label, plus the tournament's winner setting and the surrounding division/pool draw. Do not infer a final from the round number alone.

A match counts as a **title final** only when winning it actually decides the configured champion:

- **one champion per league/division:** only the league-wide final, or the final of a single-pool division
- **one champion per pool:** each pool's true final
- **position play-offs:** only the Position 1 final can award the title; Position 2/3/etc. are placement finals
- **third-place matches:** never award the championship

### 2. Make winner wording match the stage

Examples of the intended tone:

- **Quarter-final:** “Well done on your quarter-final win. You are through to the semi-final.”
- **Semi-final:** “Well done on your semi-final win. You are through to the final.”
- **Title final:** “Congratulations — you are the [league/division/pool] champion of [tournament].”
- **Early knockout:** retain the forward-looking message, without naming a milestone that is not known.
- **Pool / round-robin / Bells:** celebrate the result without saying the player “stays in the draw” or promising a next round.
- **Placement final:** celebrate the placement win without calling the player champion.

The email subject will follow the same rule, so the inbox preview is also accurate.

### 3. Make loser wording stage-aware

- Quarter-final and semi-final losses mention the stage respectfully.
- A final loss recognises the player or pair as runner-up rather than using the ordinary “hard luck” message.
- Pool and timed-format losses remain neutral because one loss may not eliminate the player.
- Doubles partners receive the same stage-correct team outcome.

### 4. Keep tournament formats safe

- Reuse the existing stored stage labels and champion-scope rules rather than creating another independent round system.
- Preserve byes, walkovers, withdrawals, multiple divisions, multiple pools, staged tournaments, and doubles behavior.
- Keep existing email enable/disable settings, deduplication, delivery pacing, reply/contact details, and branding unchanged.
- Do not resend or alter emails that have already been delivered. Sherique's old email remains historical unless a separate corrective resend is requested.

### 5. Add regression coverage

Test at least:

- ordinary round-robin win does not promise another round
- quarter-final winner advances to the semi-final
- semi-final winner advances to the final
- true final winner is called champion
- final loser is called runner-up
- section final that still feeds a league-wide final is not called champion
- per-pool champion mode awards each pool correctly
- Position 1 final versus lower-position finals
- third-place play-off never awards champion status
- doubles sends the same correct outcome to both partners

Update the project issue history with the cause and verified fix. No publishing is included.

## Technical details

- Add a database migration updating the server-side tournament result-email queue function.
- Centralize stage/title classification in a small database helper used by the queue function, so the subject and body cannot disagree.
- Verify against Sherique's recorded Final and representative fixtures from knockout, pool, play-off, Bells, and doubles tournaments.
- Run focused tournament tests, TypeScript checks, and the normal preview build checks.

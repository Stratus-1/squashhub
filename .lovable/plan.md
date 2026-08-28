# Knockout: Survivors + Daily "Well done / Sorry to see you go" digest

## 1. Standings cards in a knockout championship

Today the championship view always shows two cards: "Current Standings — Leaders" and "Current Standings — Bottom".

For a knockout championship:

- Rename the top card to **"Survivors — still in it"** (per league / pool), and keep the existing overall row labelled "Overall (current)".
- **Hide the Bottom / Wooden Spoons card entirely** while the event is a knockout and still running. Nobody wants a public "worst player" table in a knockout.
- Round-robin, Swiss and Bells events keep exactly today's behaviour (Leaders / Bottom, and Winners / Wooden Spoons when complete). Nothing changes for them.
- Wording elsewhere: "those who did not make it" replaces "bottom" anywhere a knockout list of losers is shown.

Survivor = an entrant in that league who has not lost a knockout match (byes and unplayed matches never eliminate). This reuses the existing elimination rule already used to strike through losers in the draw, so the two views can never disagree.

## 2. Daily results digest ("toast")

A once-a-day, per-club-championship message that stays on screen until the person closes it.

- Appears from **22:00 local time** each day, and on the next app open after that if they were not online at 22:00.
- Shown as a **dismissible card at the top of the championship page** (and the member home dashboard) rather than a fading toast, so it cannot disappear before it is read.
- Two sections:
  - **Well done to the winners** — everyone who won a knockout match that day (name + league).
  - **Sorry to see you go** — everyone knocked out that day (name + league).
- **First run special case:** the very first digest lists *everybody who has survived so far* and *everybody knocked out so far*, not just one day, so the club starts from a complete picture.
- Dismissal is remembered per person per day, so it will not come back after being closed, and the next day's digest appears fresh.
- Nothing is sent by email or WhatsApp in this step — it is in-app only.

## Technical notes

- New `src/lib/tournaments/survivors.ts`: pure helpers `survivorsByLeague(matches, entries)`, `eliminatedOn(matches, dateISO)` and `winnersOn(matches, dateISO)`, built on the existing `elimination.ts` rules. Unit tested in `src/test/`.
- `src/pages/ClubChampsView.tsx`: in `renderAllGroups()`, branch on knockout format — swap the winners card title to "Survivors — still in it", populate its rows from `survivorsByLeague`, and skip `woodenSpoonsCard`. Non-knockout paths untouched.
- New `src/components/tournaments/DailyDigestCard.tsx` — computes the day's winners/eliminations from the already-loaded matches (no extra queries), gates on local time >= 22:00, and stores dismissal in `localStorage` under `sh.champ.digest.<champId>.<yyyy-mm-dd>`. A `firstRun` flag (no prior dismissal key for that championship) makes it show the cumulative survivors/eliminated list.
- No database or edge-function changes; no schema migration.

## Open choice

If you also want the digest to reach people who do not open the app that evening, the same content can later be pushed through the Communications engine (in-app notification + optional push) on a nightly job — say the word and I will add it as a follow-up.

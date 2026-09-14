# Persist tournament player selections

## What will change
- Save every player checked on the Players page as part of the tournament draft, even before leagues are allocated.
- Restore those checked players whenever an organiser reopens the tournament setup.
- Keep invitation responses, payments, and final league allocations separate and unchanged.
- Add a regression check for saving and restoring a draft roster.
- Record the fix in the project issue history and verify the focused tests and preview build.

## Technical details
- Add a nullable `draft_player_ids` field to tournament drafts, protected by the existing tournament access rules.
- Write the selected member IDs during Save Progress and normal autosaves.
- On edit, use saved draft IDs when no final entry allocation exists; final entry rows remain authoritative once leagues are allocated.

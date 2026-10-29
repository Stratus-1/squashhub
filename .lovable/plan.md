# Club ladder: clear rules for what moves it

Scope: the club ladder only. Ratings and rankings get the same setup later. Nelspruit's current ladder stays as it is.

## 1. Club-wide ladder settings (Club Admin → Ladder)
One card called "What moves the club ladder". Each source has an on/off switch the admin controls:
- Ladder challenges (on by default)
- Tournaments (off by default)
- Club Leagues (off by default)
- System Leagues (off by default)

For each source the admin also picks the approval mode:
- **Apply automatically**, or
- **Admin approves first**: the change waits in a "Pending ladder changes" list with Approve / Reject.

## 2. Per tournament and per Club League
Each event gets a setting called "Affects club ladder", which starts from the club setting and can be changed per event. When it is on, the organiser chooses when the ladder changes:
- **After each result**, or
- **Only at the end**: uses the final standings once the event is complete. This reuses the existing final-standings preview and apply.

If the club has turned the source off, the event can't move the ladder.

## 3. One gate for every ladder change
Every automatic ladder movement goes through one server-side check. That check reads the source switch, the event setting, the timing and the approval mode, then applies the change, queues it for approval, or ignores it. Pending changes are checked again on approval. If the ladder changed in the meantime, the change is flagged as stale instead of applied blindly.

## 4. Safety
- Ladder positions that already exist are not changed when this goes live.
- Existing events default to "does not affect the ladder" unless the club turns it on, so no surprise reshuffles.
- Every applied change is written to ladder history with its source.

## Technical details
- New per-club settings row: source enabled flags and approval mode per source.
- New columns on tournaments and leagues: `affects_ladder` (nullable means inherit) and `ladder_timing` (`per_result` | `final`).
- New `ladder_moves_pending` usage (the table already exists), plus approve and reject RPCs scoped by club and members permission.
- Current result triggers and RPCs that move `ladder_position` are routed through `ladder_apply_or_queue(source, event_id, ...)`.
- Tests for each switch, timing and approval combination.

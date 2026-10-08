# Court Booking Rules — status check (read-only)

## Finding: no plan for this scope was ever drafted or approved
- No saved or archived plan covers Court Booking Rules. Chat history has no request or plan about late-cancellation fees, no-show fees, takeover liability, moving Member Created Events, or an Edit/Save peak editor.
- So the full scope you listed was never approved, and nothing beyond the items below was built.

## What was actually requested and built (preview code, no plan step)
| Item | Requested | Code state |
|---|---|---|
| Per-day peak hours on real slot times (e.g. 40/45 min) | 6 Oct | Built: per-day storage in the backend, server-side peak cap, `PeakHoursEditor` |
| Remove default weekday/weekend pickers; each day set manually, existing times kept | 8 Oct 02:01 | Built: each day has an on/off switch and a slot range |
| "Allow members to make solo bookings" wording + free visitor bookings per year | 8 Oct | Built |

## Not built (never approved)
- Separate peak-hours block with Edit/Save buttons (the current editor saves with the main form and has no Edit/Save)
- Moving Member Created Events to section 3 (it is still section 4)
- Clearer "Peak start / Peak end" labels and clearer last-slot wording
- Peak-hour late-cancellation toggle and penalty fee, no-show penalty fee, liability for the original booker when someone else takes the slot, and how these post to accounts

## Why the live app doesn't show the changes
- Each change was reported as "preview only, not published."
- One publish was started on 8 Oct during the Heyns fix. It should have included the per-day peak editor, but I couldn't confirm that from here. If the live site still shows the old weekday/weekend pickers, that publish either didn't finish or came before the change.
- Blocker: (1) the wider scope has no approved plan; (2) whether the existing per-day editor was published is unconfirmed.

## Next step (needs your decision)
1. Publish the current preview so the per-day peak editor and solo/visitor wording go live. Check Court Rules on the live site afterwards.
2. Approve a new plan for the items not built yet. The fee items need a design that keeps the accounting audit trail (reversible entries, nothing applied to existing bookings in hindsight) before any building starts.

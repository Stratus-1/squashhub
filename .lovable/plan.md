# Stop the repeating AI alert

## Fix
- Send the alert to the existing Super Admin AI Activity screen instead of the missing page.
- Keep that destination intact when moving from a club view to the root Super Admin area.
- Make **Done** persist reliably by checking the save result before closing the alert.
- Change the hourly reminder so acknowledging an existing batch does not create the same alert again; only a genuinely newer waiting request can trigger another alert.
- Correct the existing unread alert link so the current popup works immediately.

## Checks
- Add focused navigation and reminder-deduplication coverage where practical.
- Verify **View** opens AI Activity and **Done** leaves no unread copy that can immediately return.
- Record the fix in the project issue history and keep it preview-only.

## Technical details
- Legacy `/admin/ai-assistance` notification links will resolve to `/admin/support?view=ai`.
- The scheduled reminder will compare the newest waiting request with the latest prior AI-waiting notification, regardless of whether that notification was read.

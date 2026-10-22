# Club-sponsored stock in the personal-PIN counter
- Add a **Club sponsored** button to the unlocked counter, available without opening a customer tab.
- Open a separate stock-item basket with quantities and a required reason; show the serving staff name.
- Record the whole basket together: reduce stock and book its cost to **Stock club expense**, without sales, customer charges, tips or cash movement.
- Validate the personal PIN session on every submission, derive the club and serving person from it, and prevent duplicate stock deductions on retries.
- Retain existing staff-till and admin entry options; use the same stock-use posting logic.
- Verify using fictional browser records and disposable accounting tests; no real stock use or publication.

## Technical details
- Extract the existing stock-use posting body into a private helper used by both signed-in and PIN-authorised entry points.
- Use a single atomic basket RPC, staff/club scoping and stable per-line request references.
- Keep cash-up changes limited to removing the Undo UI; existing correction safeguards remain.
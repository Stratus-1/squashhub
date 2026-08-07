# Club Setup: guided steps + read-only by default

## Problems today
- Each setup section is one long page of open input fields — too many at once, no clear order.
- Everything is always editable, so a stray click can change data that was already correct.
- No sense of "where am I in the process" or "what does this page actually do".

## The two changes

### 1. Locked by default, explicit Edit
Every setup section renders as a clean **summary view** (labels + saved values, read-only) once data exists.
An **Edit** button unlocks the fields; then **Save** or **Cancel**. Cancel restores the previous values.
Sections with no data yet open straight in edit mode so first-time setup isn't slowed down.

A small shared piece handles this so every section behaves identically:
- `SetupSection` — titled card with a one-line "what this page does" description, a Complete/Incomplete pill, and the Edit / Save / Cancel controls.
- `SetupField` — shows the saved value as text when locked, the input when unlocked, and a muted "Not set" when empty.

### 2. Step tabs inside each section
Each setup section gets its own row of numbered step tabs, each with a plain-language heading of
what is done on that page, plus Back / Next buttons so an admin can be walked through in order — or
jump straight to a step to review or edit one thing.

Proposed steps per section:

```text
Club        1 Identity (name, logo)      2 Contact details      3 Office bearers      4 Currency & display
Courts      1 List your courts           2 Hours & booking rules 3 Lighting            4 Peak times / limits
Fees        1 Membership categories      2 League & national levies  3 Billing cycle & renewals
Banking     1 Bank account               2 Online payment gateway    3 Debit orders
Access      1 Choose access method       2 Device / provider setup   3 Door location & geofence
Comms       1 Sender identity            2 Mail server (SMTP)        3 Signature & disclaimer
Settings    1 Club preferences           2 Visitors                  3 Integrations
```

Each step tab shows its own tick when that step's required fields are filled, so the
"3/4 complete" figure on the admin landing tiles becomes traceable to a specific step.

## Technical notes
- New: `src/components/club-admin/setup/SetupSection.tsx`, `SetupField.tsx`, `SetupSteps.tsx`
  (steps row + Back/Next + per-step complete ticks).
- Refactor in place: `ClubInfoTab`, `CourtsTab`, `BankingTab`, `FeesTab`, `AccessControlTab`,
  `CommunicationsTab`, `SettingsTab` — grouped into steps, wrapped in `SetupSection`.
  No changes to what is saved or to any database table, hook or edge function; purely how the
  existing fields are grouped, displayed and unlocked.
- `use-setup-status.ts` extended to also return per-step completeness, reusing the current rules.
- Active step is kept in the URL (`?tab=courts&step=2`) so a link can point at an exact step.
- Operations tabs (Members, Finance, Tournaments, etc.) are left untouched — they are working lists,
  not setup forms.

## Rollout
Done in one pass, section by section, starting with Club and Courts so you can see the pattern
early and tell me if the step breakdown above matches how you'd walk a new club through it.

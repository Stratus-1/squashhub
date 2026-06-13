## Tournament wizard — fine-tuning changes

Refactor the tournament planning wizard in `src/components/club-admin/ClubChampsTab.tsx` so it matches a more natural admin flow: pick category → lock dates/times and book courts → then invite players. Also make registration & payment optional rather than mandatory.

### 1. Registration is now optional

On the "Registration & Payment" step add a checkbox at the top:

- **"Players need to register / be invited for this tournament"** (default ON for existing tournaments, ON for new).

When **OFF**:
- Hide the "Who can register?" select, invite-source panel, registration-opens / registration-closes datetime fields.
- `missingForStep("registration")` no longer requires `registrationMode`, `registrationOpensAt`, `registrationClosesAt`.
- `registration_opens_at` / `registration_closes_at` saved as `null`.
- Wizard treats this as "admin directly seeds the roster on the Players step" — same effect as today's invite-only flow but without dates.

Persist via a new boolean column `club_champs.registration_required` (default `true` for backward-compat).

### 2. Payment-required toggle (only when there is a fee)

Next to the entry-fee input, when fee > 0, show a checkbox:

- **"Players must pay the entry fee before their entry is confirmed"** (default ON).

When OFF, entries are confirmed immediately and the "unpaid" gate that currently blocks confirmation is bypassed. Persist via new boolean `club_champs.payment_required` (default `true`).

The "Registration opens/closes" datetime fields only render when registration_required = true (point 1).

### 3. Move court booking earlier — new "Courts" step

Insert a new wizard step **after** Category and **before** Registration:

```text
category → courts → registration → players → groups → schedule → review
```

The new Courts step lets the admin:

- Pick the tournament date(s) — start date / end date (moved up from Registration step; Registration step keeps a read-only summary).
- For each date, pick start time + end time and tick which courts are used.
- Press **"Book courts now"** which calls the existing `createCourtBookings` / consolidated-block logic (already in this file) to write tournament-named blocks into `bookings`.

After successful booking the wizard advances. If the admin edits dates/times later (Schedule step), the existing reconciliation logic re-runs and reuses the same `champ:${id}:block:${date}:${court}` external_ids so blocks are upserted, not duplicated.

The existing Schedule step keeps its purpose (slot/match duration, breaks per league, time per court) but its court-picker now defaults to whatever was booked on the Courts step.

### 4. State + persistence

New `club_champs` columns:

- `registration_required boolean not null default true`
- `payment_required boolean not null default true`

(Existing `entry_fee_cents`, `registration_opens_at`, `registration_closes_at` columns are unchanged — they simply become nullable in practice when the toggles are off.)

Load these into wizard state in `openChampForEdit`, default to `true` for legacy rows, and save them in every `saveDraft` / persist branch.

### 5. Validation updates (`missingForStep`)

| Step | Required when |
|---|---|
| courts | `startDate`, `endDate`, at least one (date, court, start, end) row |
| registration | `registrationMode` only if `registration_required` |
| registration | dates only if `registration_required` |
| players | unchanged |

### Files touched

- `supabase/migrations/<new>.sql` — add the two boolean columns.
- `src/components/club-admin/ClubChampsTab.tsx` — wizard restructure, toggles, new Courts step, validation.

### Out of scope (not changing)

- The Bells / Standard format strategies, marker, standings.
- The booking-display fixes already shipped (tournament-name blocks in the bookings grid).
- League fee flow, member fees, etc.

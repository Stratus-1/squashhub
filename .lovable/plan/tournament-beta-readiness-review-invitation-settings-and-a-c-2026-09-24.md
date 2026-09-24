# Tournament Beta: readiness review, invitation settings and a compact Schedule tab

Tournament Beta work only. The legacy Tournaments module and existing tournaments are not touched.

## What I found
- The builder saves one draft (the "definition"). It only holds **structure** (divisions, sections, stages) and per-stage schedule fields.
- It has **no fields** for invitations, channels, manual/automatic sending, registration dates, fees, reminders, the WhatsApp group, result messages, player selection/confirm-availability, seeding source or scoring rules. The AI had nowhere to put those decisions, so they stayed in the chat only. This caused the Riverside gap.
- The Invitations tab is fixed text. Review only shows validation issues and a "Preview only" box. Create stays blocked while any stage can't be mapped.
- Schedule shows one wide card per stage. Each card repeats the full stage label and every control.
- The normal setup already has matching fields: `invite_methods`, `invite_audience`, `invite_short_message`, `registration_mode`, `registration_opens_at` / `registration_closes_at`, `entry_fee_cents`, `payment_required` / `payment_methods` / `payment_timing`, `result_notify_scope` / `result_notify_channels`, `start_date` / `end_date`, and the `tournament_whatsapp_groups.invite_url` link.

## What changes

### 1. One draft holds every decision
I'll add optional sections to the same draft. Older drafts keep loading with safe defaults.
- **players**: how people enter (self-entry, selected/invited, or both), audience, whether selected players only confirm availability, division allocation rule, seeding source (ranking, ladder, manual or none), minimum/maximum entries.
- **scoring** per stage: points per game, best of, play all games, win by 2 or sudden death. Unset stages inherit the tournament default.
- **schedule** at tournament level: date range, default day/time, venues, courts, session and match minutes, provisional bookings yes/no. Each stage inherits these unless it overrides them.
- **comms**:
  - invitations manual or automatic (default **manual**)
  - channels: in-app, email, WhatsApp, SMS
  - registration open/close
  - invitation wording
  - reminders
  - fee, payment required, payment methods
  - WhatsApp group: yes, no or undecided, plus the invite link
  - result messages: all, play-offs only, or none, plus channels

The AI, the tabs and Review all read and write this one object. Nothing is kept separately.

### 2. The AI fills these sections
- I'll teach the interpreter the new sections, with explicit rules. For example: "manual invitations, email + WhatsApp" goes into comms; "no congratulations messages" sets result messages to none; "selected players only confirm" goes into players.
- Each turn also returns the **next required missing item**, taken from the readiness check, so the builder asks for it itself.
- I'll add a test that builds the Riverside decisions and checks they appear in the draft.

### 3. Readiness check (new, deterministic)
A pure function returns, for each of Design, Players, Schedule, Invitations and Structure support:
- **Complete**, **Missing** (required) or **Optional / warning**
- a list of items, each with a plain message and a link to the right tab and field

Required items:
- **Design:** at least one division and stage; stage sizes known or marked dynamic; no validation errors; open structural questions answered.
- **Players:** entry method; eligibility per division; seeding source if a stage uses seeding.
- **Schedule:** a date range; a scheduling mode per stage (own or inherited); venue and courts when a stage uses fixed dates or admin scheduling; match minutes when capacity is checked. Session minutes are optional.
- **Invitations:** manual or automatic; at least one channel if invitations are used; registration close for self-entry; fee decision; WhatsApp group decision; result-message choice (None counts as a choice).

### 4. Invitations tab becomes a real form
It edits comms and players directly. Settings agreed in chat show up here immediately.
- It asks: "Do you want to add a WhatsApp group for this tournament?" Choosing Yes shows a field for the invite link. The link is checked with the existing WhatsApp link checker.
- A permanent note says nothing is sent from the builder or on creation.

### 5. Review becomes a readiness review
- One card per section with a Complete / Missing / Warning badge. Clicking an item switches tab and highlights the field.
- It summarises the **actual saved settings**: format, divisions, entry, dates, venues, channels, sending mode, WhatsApp, result messages.
- **Executability**, shown beside Create:
  1. **Ready to create**: every stage maps onto today's engine.
  2. **Creatable as planning-stage, later stages need the new engine**: the first stage of each division maps, and later stages can't run yet. Create is allowed after a second confirmation. It lists exactly which stages are not created, and the full design stays saved in the draft so nothing is lost.
  3. **Blocked**: a division's first stage can't be represented, or validation has errors. Create is disabled, with the reason.
- The fixed line **"Creating this tournament will NOT send invitations."** appears whenever sending is manual. Creation never sends in any case.

### 6. Compact Schedule tab
- A tournament defaults bar at the top: dates, day/time, venues, courts, match and session minutes.
- Stages are grouped under collapsible division headings, with Expand all / Collapse all.
- Each stage is one row: short name (for example "Div 1 · A/B Singles Pools") | dates | day/time | venue | courts | duration | status dot.
- Rows show "inherited" in grey when they use the defaults. A red "Missing" chip appears on anything required.
- Clicking a row opens its editor. Every field is labelled Required, Optional, Inherited or Not needed (for example, match minutes are not needed for self-booking stages).
- Full format and scoring descriptions stay on Design only. On mobile the row stacks into two lines.

### 7. Create Tournament
The same insert path as now, plus the new settings mapped to existing fields:
- invitation methods, audience source and short message
- registration mode and dates
- fee and payment fields
- result-message scope and channels
- start and end dates

It writes the WhatsApp link to the tournament's WhatsApp group record (manual provider). It sets **no send triggers** and makes no calls to messaging services.

## Technical details
- `src/lib/smart-builder/definition.ts`: add `players`, `comms`, `scheduleDefaults`, and `scoring` on the stage, all with zod defaults. The version number stays the same.
- New `src/lib/smart-builder/readiness.ts`: `assessReadiness(def, validation, mapping)` returns `{ sections[], executability: "ready" | "partial" | "blocked", nextMissing }`.
- `to-existing.ts`: map the first stage per division when later stages are unsupported. Return `executability`, `deferredStages[]` and the comms/players field mappings.
- `smart-tournament-interpret`: extend the system prompt and definition shape; add `next_question` to the output.
- `SmartTournamentBuilder.tsx`: controlled tab state so Review can jump to a tab; split into `InvitationsTab`, `ScheduleTab` (compact, grouped) and `ReviewTab` (readiness), probably as new files in `src/components/smart-builder/`.
- Tests in `src/test/smart-builder*.test.ts`: readiness states, Riverside comms persistence, the partial-executability mapping, and that stages carrying defaults inherit correctly.
- No database migration is needed; the draft is already stored as JSON.

## Report after building
I'll answer your seven questions:
1. which decisions were previously lost
2. the readiness logic
3. how invitations are represented
4. the WhatsApp group flow
5. how preview-only stages affect Create
6. what changed on Schedule
7. confirmation that Create doesn't send anything

Nothing gets published unless you ask.

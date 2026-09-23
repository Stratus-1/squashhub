# Smart Tournament Builder — BETA (Super Admin only)

A separate builder that runs next to today's tournament setup. It turns a description into a tournament design you can edit, checks it, and only creates a real tournament when you press "Create Tournament". Existing setup, tournaments and data stay as they are.

## What you will see
- Super Admin → Tournaments: the existing planner, unchanged, plus a card "✨ Smart Tournament Builder — BETA · Super Admin testing only".
- Builder page (`/admin/tournaments/smart`, plus `/admin/tournaments/smart/:draftId`):
  - Start: choose **Guide me** or **I know what I want**. Saved drafts are listed.
  - Chat on the left, with "Here's what I understood" cards and the buttons **Build structure** and **Change something**.
  - Tabs on the right: DESIGN | PLAYERS | SCHEDULE | INVITATIONS | REVIEW.
    - DESIGN: a visual flow of phases → divisions/sections → stages. Each block can be selected and edited, with "+ Add Stage" between blocks. You can rename, reorder and remove blocks.
    - PLAYERS: a preview of how many players or pairs each stage expects, and where they come from.
    - SCHEDULE: set per stage (fixed date / play by / self-booking window / admin). Venues come from the existing clubs and courts, with a rotation option.
    - INVITATIONS: shows who can enter. It reuses the existing audience rules and sends nothing in beta.
    - REVIEW: validation results, then **Create Tournament** (with a confirmation step).

## How it works
```text
Organiser -> AI interpretation -> Tournament Definition (JSON, source of truth)
          -> deterministic validator -> preview -> [Create Tournament] -> existing engine
```
- The AI never touches live data. It returns only a structured update to the draft: facts, open questions, "not understood" notes, and changes to the definition. Code applies that update and then runs the validator.
- Chat edits after the build (e.g. "Change Section 2 to 5 pools") go through the same path. If a change breaks a later stage, the builder shows the consequences and suggested fixes before applying it.

## Technical details
**Schema (new, additive only):** table `smart_tournament_drafts` with these columns:
- id, created_by, owner_kind (club/association/federation), owner_id
- title, mode, definition jsonb, conversation jsonb, validation jsonb
- status (draft/created/archived), created_tournament_id → tournaments
- timestamps

Grants and access rules on the table:
- Readable and writable only when `has_role(auth.uid(),'admin')`, the existing super-admin check. I will confirm that check before writing the migration.
- No access for guests (`anon`).

**Access gate:**
- A single `canUseSmartBuilder()` helper in `src/lib/smart-builder/access.ts` controls access. Today it means "super admin".
- It is applied to the route, the entry card and the database access rules, so opening access to club, association or federation admins later is a one-place change.

**Definition model** (`src/lib/smart-builder/definition.ts`, zod): Tournament → phases → divisions/sections → stages. Stage kinds:
- `round_robin` (pools, size)
- `knockout` (size, seeding, byes)
- `swiss`
- `placement`
- `split` (Championship/Plate/Shield)
- `transform`, including the generic `pair_from_positions` mapping, e.g. [[1,2],[3,4],[5,6]] → levels
- `custom`

Each stage also carries:
- input: entrants or derived from `{stage, positions}`
- output: advancing count and role (qualification or seeding)
- discipline: singles or doubles
- eligibility: gender/category/open-any-pair
- seeding bands
- dynamic flag (resolves when registration closes)
- schedule block
- knockout names use the stage label ("League X Semi Final"), never "Pool A …"

**Validator** (`validate.ts`, pure functions and fully tested). It checks:
- counts
- advancement maths (empty playoff slots, duplicate progression)
- draw sizes and byes
- minimum games
- unresolved or dynamic stages
- eligibility conflicts
- stage dependency order
- date order (e.g. QF due date before a pool's end date)
- venue/court capacity per session, against existing court counts
- whether a stage expects more entrants than earlier stages can supply

Messages are in plain English, e.g. "Pool A sends 2 … 4 positions are empty". It also derives facts, e.g. "6 per pool → 5 matches/player, 15/pool" and "all advance → round robin sets seeding only; suggest 1v4, 2v3".

**AI:**
- New edge function `smart-tournament-interpret`, Lovable AI, default model on the Responses API.
- Structured output: `{understood[], ambiguities[{term, question, options}], not_understood[], patch}`.
- The system prompt tells the model to clarify ambiguous terms such as "1st and 2nd", "groups" and "rotate", never to re-ask known facts, and to stop structural questions once the design is complete.
- The function checks the caller is super admin.
- 402/429 errors are shown in the chat.

**Create Tournament:** `toExistingTournament.ts` maps the validated definition onto today's fields (divisions, pools, formats, playoff modes, knockout qualifiers, rounds, venues). It uses the existing `sanitizeDraftPayload` and `tournament_venues` sync, and creates a **draft** tournament through the same insert path the planner uses. The new tournament then opens in the existing editor.
- Structures that don't map to today's fields are blocked with an explanation, not saved in a lossy way: split competitions and cross-pool derived doubles levels. They stay previewable in the beta.

**Tests (vitest):**
- The 4 acceptance tests run as definition + validator fixtures:
  - 48-player sections → derived doubles levels
  - doubles knockout with strength bands and 3-venue Thursday capacity
  - simple 16-player knockout needing zero questions
  - Section 2 → 5 pools raising downstream warnings
- A mapping test for the simple knockout. The AI prompt is checked separately with a live call.

## What stays mocked or limited in the beta
- Invitations are preview only.
- Fixture preview uses the existing generators where the structure maps, and shows a count-only preview otherwise.
- No emails, WhatsApp messages or bookings are sent from the builder.

## Risks before widening access
- Owner-scope rules for club/association admins.
- Mapping coverage for split and derived-doubles structures.
- AI cost per conversation.
- Capacity checks use court counts, not live bookings.

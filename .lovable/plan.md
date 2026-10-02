# Tournament Beta — template entry points

## What exists today (findings)

- **Two builder models already exist.**
  - **Step-by-Step** (the landing card): answers are kept on the organiser's device (`StepAnswers`), then handed over to a real tournament on "Complete setup & continue".
  - **Older Beta builder** (reachable only with `?legacy=1`): saves drafts in the database (`smart_tournament_drafts`, a `TournamentDefinition`). **Diamond League lives only here.** It's a team-style format (singles pools, then pairs formed from positions, cross-pool doubles, crossover play-offs). Step-by-Step can't represent that today.
- **A templates table already exists**: `tournament_templates` (club_id, template_key, name, definition). It's per club and only club admins (or Super Admin) can use it. It's only used by the Diamond League panel's "Save as club template" button, and no rows exist.
- **No system-template concept exists.** Every template row must belong to a club.

## Proposed behaviour

Landing screen: the existing "Build your tournament step by step" card stays on the left. Two new cards go on the right:

1. **My templates**: lists this club's saved templates. Picking one starts a fresh Step-by-Step setup pre-filled from a copy of the template. The template itself is never edited.
2. **Pre-built templates**: SquashHub formats shipped in the app code, so they're read-only by design and no master copy can be overwritten. The first one is Diamond League; more can be added to the list later.

**Save as template**
- Shown on the Step-by-Step Summary step, and on Tournament Management for tournaments set up with Step-by-Step.
- It asks for a name and saves to `tournament_templates` with `template_key = 'step_by_step'`.

**Starting from a template**
- Any setup already in progress on this device is never silently overwritten. If one exists, the organiser is asked whether to replace it.
- Event-specific steps are cleared and flagged "Review for this event":
  - name and dates
  - day/court availability
  - picked players and pairs
  - fee amounts
  - WhatsApp link
  - expected entries

**What a template keeps**
- event kind and play type (singles, doubles, both)
- categories and subcategories, and the discipline for each
- eligibility and placement rules, entry source, and invitation and message settings
- partner rules and doubles entry/payment permissions
- the fee structure: payment methods, timing and partner-pay, without amounts
- scoring, format, playoff and seeding plans, each with its overrides
- Club Champs stage plan (relative shape only, no dates)
- after-match notification settings

**What it never keeps:** tournament id, plan id, players, pairs, registrations, payments, draws, fixtures or results.

## Diamond League — the key decision (needs your choice)

Because Diamond League only exists in the older Beta builder model, "pre-populate the builder" can mean one of two things:

- **A (recommended for now):** Picking Diamond League creates a new draft in the existing older Beta builder, pre-filled with the Diamond League structure, and opens it there. This reuses the proven Diamond engine as it is, and the master template is untouched. Downside: the organiser lands in a different-looking builder from Step-by-Step, and Generate Draw & Fixtures (Step-by-Step) doesn't apply to it; that builder has its own Create Tournament path.
- **B:** Teach Step-by-Step to express Diamond League (position-pair stages, cross-pool doubles, crossover play-offs). This is a much larger engine-bridging job, best done as its own build.

Unless you say otherwise, I'll build **A**.

## "My templates" scope — ambiguity to confirm

- The existing table and permissions are **per club, club admins only**.
- Association/league organisers and federation organisers have no template home. Templates can't be shared across clubs.
- Tournament directors who aren't club admins can't save or see them.
- Plan: keep it **per club, managed by club admins** (matching the current permissions), with no database change. Association/federation-level templates would need a new owner column and policies, so they would be a separate decision.

## Technical details

- New `src/lib/smart-builder/step-templates.ts` (pure):
  - `toStepTemplate(answers)` strips event-specific and transactional fields.
  - `fromStepTemplate(tpl)` returns fresh `StepAnswers` with a `reviewFields` list.
  - `PREBUILT_TEMPLATES` registry entries: `{ key, name, description, target: 'legacy_draft' | 'step' }`.
- New `StepTemplatePicker.tsx` (the My templates and Pre-built lists). `ClubTournamentBeta.tsx` gets the two cards on the right of the existing card.
- `StepByStepBuilder` gets an optional `seed` prop. When it's given, it replaces the local answers after confirmation and shows "Review for this event" badges.
- Diamond (option A): insert into `smart_tournament_drafts` with a definition built by the existing `diamondTemplate()`. Then render the existing `SmartTournamentBuilderCore` with that draft id inside the Beta host, which is the same component `?legacy=1` uses. The Current Builder code is not changed.
- Save/list use `tournament_templates`, filtered by `club_id` and `template_key = 'step_by_step'`. Delete/rename is allowed on My templates only.
- Tests: the stripping keeps structure and drops all transactional/event fields; the original template is unchanged after starting from it; the Diamond draft gets a fresh id each time.
- Record the rule in `src/components/smart-builder/AGENTS.md`. Nothing will be published.

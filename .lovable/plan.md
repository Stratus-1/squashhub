# Clarify the Distribution method step

Small copy-only change to `src/components/club-admin/StepByStepLeagueSetup.tsx` (step "f. Distribution method", around lines 530–550).

## What to add
Directly under the `Label` for "f. Distribution method", insert one muted helper line:

> Only affects the initial auto-draft of players into team slots from the ranked pool. It does **not** decide fixtures or which team plays which week — that's handled later by the fixture scheduler.

## Style
- Use `text-[11px] text-muted-foreground` to match the existing dense wizard styling.
- No layout changes, no logic changes, no new props.
- Keep the three radio options exactly as they are.

## Out of scope
- Hiding the step behind an "Auto-allocate" toggle (option 2) — not chosen.
- Any change to fixture generation or draft order math.

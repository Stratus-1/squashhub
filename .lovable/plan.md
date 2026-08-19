# Tournament workflow: duplication audit and streamlined wizard

Audit of the whole create/edit workflow as it stands (wizard steps Category, Courts, Structure & capacity, Registration, Players, Groups, Schedule, Review; plus the Governance, Rules, Registrations and Import dialogs on each tournament card). Nothing is changed yet — this is the design.

Guiding rule used throughout: one authoritative editing place per concept, later steps may *show* earlier decisions but never ask again, and controls that don't apply to the chosen structure stay hidden.

---

## A. Duplication findings

### A1. Number of leagues — asked twice
- **Now:** the Structure & capacity step's builder is where leagues are created (each with format, category, pools, expected players). The Groups step then opens with a card titled "Number of Leagues" and a dropdown "Divide N players into how many leagues?" that rewrites `numGroups` and re-shuffles every group assignment.
- **Authoritative:** Structure & capacity.
- **Change:** remove the dropdown. The Groups step keeps only allocation — drag/drop players or pairs between the leagues that already exist, reorder within a league, pool headers, category mismatch warnings. Add a one-line read-only header ("3 leagues · League 1 Men's RR, League 2 Ladies' RR, League 3 Mixed Bells") with an "Edit structure" link back.
- **Risk:** the dropdown's `onValueChange` is currently the only thing that seeds `groupAssignments` / `pairGroupAssignments` on this screen. The existing snake-distribution seeding must move to an effect that runs when entrants or league count change, otherwise a fresh tournament lands on an empty Groups step. Rename the step to **Allocate players**.

### A2. Playoffs — controlled at two levels
- **Now:** a master checkbox `Include playoffs (set per league below)` in the structure builder header, whose handler also wipes `leaguePlayoffs` to `{}`; plus a `Playoffs / finals for this league` control on each league card; plus playoff break/date options in a third place (the Courts step's "Scheduling & playoffs" section); plus a Review line "Playoffs: Yes/No".
- **Authoritative:** per-league on the league card. Playoff inclusion genuinely varies (a Bells league usually has none, a round-robin league does).
- **Change:** drop the master checkbox from the header and replace it with a derived summary ("Playoffs: leagues 1 and 2"). Keep `enablePlayoffs` in state and in the tournament row, but compute it as "any league has playoffs" so schedule generation, the playoff timing block and the Review line keep working unchanged. Add "All / None" quick-set buttons if the bulk gesture is missed — those write to the per-league map, not to a separate flag.
- **Edge case:** the master checkbox currently doubles as a reset ("every league follows it again"). That reset behaviour is what makes it confusing — per-league values silently vanish. The quick-set buttons replace it explicitly.
- **Risk:** anything reading `enablePlayoffs` directly (playoff timing block, generation, review) must read the derived value; check no save path writes the raw checkbox state.

### A3. Playoff timing sits on the wrong step
- **Now:** "Playoff finishing options" (break after last pool match, finals date) lives on the Courts step, but whether playoffs exist is decided on Structure, one step later.
- **Change:** move the timing block to the Schedule step, where the rest of the generator settings live (fill/spread, slot timing, back-to-back, court rotation), and show it only when playoffs are on. The fill/spread choice on the Courts step should move to the Schedule step for the same reason.

### A4. Participants managed in two surfaces
- **Now:** the Players step writes `club_champs_entries` (and auto-creates registrations), while the **Registrations** button opens a second dialog that edits `club_champs_registrations` (invite, mark paid, waive, cancel, partner override, entries lock). Live data shows they drift: 365 non-cancelled registrations with no entry row, 51 entry rows with no registration.
- **Authoritative:** the Players step.
- **Change:** see section B for the full roster design; the Registrations button becomes a shortcut that opens Edit on the Players step, and the dialog is deleted once parity is confirmed.

### A5. Registration dates scattered from the other dates
- **Now:** tournament start/end, daily times, play days and courts are on Courts; registration opens/closes are on the Registration step inside a section oddly titled "No-shows & registration window".
- **Change:** move `registration_opens_at` / `registration_closes_at` next to the play dates and rename the step **Dates & Courts**; keep them conditional on `registrationWindowApplies`. Move the No-show / injured points rule out of that section — it is a scoring rule and belongs with match rules on Structure.

### A6. Governance vs wizard
- **Now:** Governance owns owning body, competition level, sanctioning, eligibility (who may enter, age limits, licence), fee shares, refunds, venues, audit. The wizard's Category step also asks **Who may enter**, and the Registration step owns the entry fee that Governance splits.
- **Authoritative:** Governance for eligibility scope, owning body, sanctioning, shares and refunds; wizard for the entry fee itself.
- **Change:** the Category step's "Who may enter" becomes a read-only line with an "Edit in Governance" link. The Registration step gains a read-only line showing the fee split and refund policy. No governance controls move into the wizard.

### A7. Match rules restated
- **Now:** Structure has a grey box whose only content is a sentence saying format/category/best-of/win condition are set on the league cards below — pure restatement of what is visible. The separate **Rules** dialog on the card edits scoring format, draw type and standard of play, which the league cards also cover.
- **Change:** delete the grey box. Fold the Rules dialog's remaining unique fields (standard of play, draw type where not per-league) into the Structure step and drop the card button, or keep the dialog strictly for post-creation edits and hide it while the wizard is open. Recommended: fold in, one place.

### A8. Handicap scoring is on the wrong step
- **Now:** "Handicap scoring" is a section of the Registration step. It is a scoring rule with no connection to entry or payment, and it references league strength across the leagues defined on Structure.
- **Change:** move it to Structure & capacity, under match rules.

### A9. Explanatory text that restates the UI
- The removed "Invitations & entry list" wrapper (already done).
- The structure builder's long header paragraph repeats what the palette and cards show.
- Groups step paragraph explaining drag and drop can shrink to a single hint line.
- Review's "Rebuild Schedule recreates…" note is useful; keep.

### A10. Derived values presented as inputs
- **Expected players per league** on each league card is typed by hand, then the Capacity check recalculates against actual entrants. Once entrants exist, show actual counts and treat expected as a planning-only value that greys out.
- **`num_groups`** on the tournament card summary is stored; it should always equal the builder's league count.
- **Review step** lists name, type, period, days, times, courts, format, playoffs — all derived, correct as-is, and it should stay read-only with jump links rather than gaining any editable field.

### A11. Legacy fields to keep in schema, hide in UI
- `roundFormat` at tournament level (superseded by per-league formats, still read by generation and the Review line) — keep writing it as a derived value, remove any UI that sets it directly.
- `club_champs_registrations.status` overloading payment and participation — keep the column, stop showing it raw.
- `entries_locked` — surface once, on the Players step header, not in a dialog.

---

## B. Unified Players roster (detail)

Two state axes replace the single overloaded status.

Participation: `invited`, `pending_approval`, `confirmed`, `declined`, `withdrawn`.
Payment (only when a fee applies): `not_required`, `unpaid`, `pending_card`, `pending_eft`, `paid`, `waived`.

Legacy mapping, read-only:

| Legacy row | Participation | Payment |
| --- | --- | --- |
| `paid` | confirmed | paid if fee > 0, else not_required |
| `waived` | confirmed | waived |
| `invited` | invited | unpaid |
| `pending_payment`, no `confirmed_at`, invited by admin | invited | unpaid |
| `pending_payment`, `confirmed_at` set | confirmed | pending_card |
| `pending_eft` | confirmed | pending_eft |
| `cancelled` after confirming | withdrawn | unchanged |
| `cancelled`, never confirmed | declined | n/a |
| entry row, no registration | confirmed | not_required |

With `approval_gate = 'admin_accept'` and self entry, an unconfirmed row reads as `pending_approval`.

The Players step becomes one table — every entrant, whatever route they came by — with filter chips (All / Confirmed / Awaiting / Needs approval / Payment outstanding / Out), per-row actions (approve, reject, mark paid, waive, view proof, remove, re-invite, set partner), bulk actions, counters, and the entries lock. A registration row is created the moment anyone enters; an `club_champs_entries` row is created only when a confirmed player is placed into a league or pair.

Migration is additive only: nullable `participation_status` and `withdrawn_at` on `club_champs_registrations`, backfilled from the mapping. The legacy `status` column keeps being written exactly as today, so payment webhooks, `accept_tournament_invite`, notification triggers and the invite dialog are untouched.

---

## C. Final wizard: steps and ownership

```text
1. Basics          Name, category (gender, singles/doubles), visitors,
                   entrant limits, seeding source.
                   Read-only: who may enter (→ Governance).

2. Structure       Leagues via the builder: per-league format, category,
                   pools, playoffs, best-of, win condition, par.
                   Match rules, handicap scoring, no-show rule.
                   Capacity check.

3. Entry & fees    Who enters · confirmation/approval · fee and payment
                   timing · payment methods · invites and messaging ·
                   doubles partner behaviour.
                   Read-only: fee split and refunds (→ Governance).

4. Dates & Courts  Tournament start/end, daily times, play days, courts,
                   per-day overrides, and (conditionally) registration
                   opens/closes.

5. Players         The single roster: participation + payment state,
                   approvals, payments, invites, partners, entries lock.

6. Allocate        Drag entrants into the already-defined leagues and
                   pools; reorder for seeding/handicap.

7. Schedule        Fill vs spread, slot and bell timing, break, avoid
                   back-to-back, court rotation, playoff timing.

8. Review          Read-only summary with jump links; generate/rebuild.
```

Order note: Dates & Courts must come after Entry & fees, because the registration-window fields are gated on the entry source chosen there. Keep the internal step id `courts` and change only the label, so the Schedule step's "Edit on Courts step" shortcut, autosave keys and draft restore keep working.

Tournament card buttons after the cleanup: **View · Players · Import entrants · Edit · Governance · Close**. Registrations and Rules disappear (Registrations becomes Players; Rules folds into Structure).

---

## D. Cross-cutting risks

- **Validation dependencies.** Each removal has a matching check in the step validator: the registration-window checks move from the `registration` case to the `courts` case; the Groups case must not require a manually chosen league count; `enablePlayoffs` checks must read the derived value.
- **Abbreviated flows.** The self-pair flows hardcode step arrays (`["category","courts","structure","registration","players","review"]`) in two places and must be reordered with the main list or the wizard jumps backwards.
- **Doubles pairing.** `syncDoublesRegistrationsForPairs` rewrites registrations from pairs while self-pairing writes partners from the player side; a roster edit must never clear a player-confirmed partner. Pair edits keep going through the existing helper only.
- **Destructive entry rewrites.** `saveEntriesDraft` deletes and re-inserts all entries for a tournament. Unchanged, but the roster read model must not assume entries persist between saves.
- **Notification triggers** fire on an `invited_by_admin` INSERT. Allocation must keep that flag false; only an explicit invite sets it.
- **Live tournaments.** Every mapping is read-only and every schema change is additive, so an in-progress event shows the same roster and schedule it does now, just better labelled.

## Suggested sequencing

1. Structure/Groups deduplication (league count, playoffs authority) — self-contained, immediate clarity win.
2. Step reorder and Dates & Courts consolidation, including handicap and no-show relocation.
3. Unified Players roster plus additive migration.
4. Retire the Registrations dialog and the Rules dialog button; trim restated copy.

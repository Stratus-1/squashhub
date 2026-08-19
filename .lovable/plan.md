# Tournament entry & payment setup — review and simplification spec

Review only. No code or database changes proposed for this turn; this is the product/UX specification.

## 1. What exists today (verified)

The whole entry configuration lives in one wizard step, **Registration & Payment**, inside `ClubChampsTab`, and writes to `tournament_governance` (through the `club_champs` view). Riverside's four tournaments confirm the fields in use.

Controls currently on the page:

| Control | Values | Stored as |
|---|---|---|
| Entry model presets (4 cards) | open+paid, open+free, admin+free, admin+paid | none — they just set the toggles below |
| "Players need to register / be invited" | on / off | `registration_required` |
| Entry fee (ZAR) | number, 0 = free | `entry_fee_cents` |
| Accepted payment methods | card / EFT / cash (gated on club banking setup) | `payment_methods` |
| "Player must pay before they qualify" | on / off | `payment_required` |
| "How do players enter?" | open sign-up / invite-only | `registration_mode` |
| "Who puts a player on the list?" | player / organiser / team manager | `entry_source` |
| "Organiser must accept each entry" | on / off | `approval_gate` |
| Initial invite list comes from… | manual tick-list / by league | `invite_source`, `source_league_ids` |
| Invite methods | app / email | `invite_methods` |
| Registration window | opens / closes datetimes | `registration_opens_at`, `registration_closes_at` |
| Partner selection (doubles) | admin pairs / players choose | `partner_mode` |
| Who may enter (step 1, elsewhere) | club / association / open | `eligibility_scope` |
| Fee shares, refunds (read-only here) | federation/association share, refund policy + cut-off | Governance dialog |

Participant states actually present in `club_champs_registrations` today: `pending_payment`, `pending_eft`, `paid`, `waived`, `cancelled`, plus the booleans `invited_by_admin`, `partner_confirmed`, and the EFT proof columns. There is **no** distinct "invited but not yet answered", "accepted" or "approved" state — `pending_payment` is overloaded to mean all three, and `paid` is overloaded to mean "in the field" even for free events (99+67 free entries sit at `paid` today).

## 2. Why the page feels messy

1. **Two competing layers.** The four preset cards and the eight raw toggles below both claim to set the same thing. Presets only highlight when a fragile four-way condition matches, so an admin who nudges one toggle sees every card go dark and assumes something broke.
2. **Three fields answer nearly the same question.** `registration_mode` (open vs invite), `entry_source` (player vs organiser) and `registration_required` overlap almost completely — invite-only + self-entry, or open sign-up + organiser-enters, are contradictory combinations the UI still allows.
3. **Payment timing is implicit.** `payment_required` reads "must pay before they qualify", but there is no way to say "pay only after I accept you". With `approval_gate` now present, payment-before vs payment-after-approval is undefined.
4. **Free events are misrepresented.** A free tournament still stores `payment_required: true` (all four Riverside rows do) and lands entrants in `paid`, which is meaningless wording for a free club night.
5. **Eligibility lives on another step** while a helper paragraph on this step explains the difference — a sign the model is being explained instead of being obvious.
6. **Dead options in context.** Payment methods, EFT panels, registration windows and invite sources stay visible in configurations where they do nothing.

## 3. Proposed model — three questions, conditional disclosure

Replace the preset grid and eight toggles with three sequential questions. Everything else appears only when the answers demand it.

**Q1 — Who gets into this tournament?**
- *Players enter themselves* (open sign-up)
- *I choose the field* (organiser selects)
- *Team managers enter their squads* (regional/national only; hidden at club scope)

**Q2 — Does an entry need to be confirmed?**
Shown for all three answers, with wording that adapts:
- Self-entry: *No confirmation — entering is final* | *I review and accept each entry*
- Organiser-selected: *No confirmation — the player is simply in* | *The player must accept the invitation*
- Team-manager: *No confirmation* | *I review and accept each squad*

**Q3 — Is there an entry fee?**
- *Free*
- *R___ payable* → then, and only then, a single radio for **when**: *Payment due immediately on entry* | *Payment due only once the entry is accepted*, plus accepted payment methods.

Everything downstream is conditional: the registration window appears only for self-entry or team-manager entry; the invite list source and invite methods appear only when the organiser chooses the field; payment methods, EFT bank panel and refund summary appear only when a fee is set; partner selection stays where it is (doubles only).

### The five required scenarios

| Scenario | Q1 | Q2 | Q3 |
|---|---|---|---|
| A — internal, free, admin selects | I choose the field | No confirmation | Free |
| B — internal, free, admin invites, must confirm | I choose the field | Player must accept | Free |
| C — club, free, self-register | Players enter themselves | No confirmation | Free |
| D — paid, self-register with payment | Players enter themselves | No confirmation | R__, due on entry |
| E — invite/approval, pay after acceptance | Either | Accept required | R__, due after acceptance |

### Mapping onto existing storage (no data loss)

| New answer | Existing columns written |
|---|---|
| Q1 = players enter themselves | `registration_mode='open'`, `entry_source='self'`, `registration_required=true` |
| Q1 = I choose the field | `registration_mode='invite'`, `entry_source='admin'` |
| Q1 = team managers | `registration_mode='invite'`, `entry_source='team_manager'` |
| Q2 = no confirmation | `approval_gate='none'`; for organiser-selected also `registration_required=false` |
| Q2 = accept/confirm required | `approval_gate='admin_accept'` (self/team) or `registration_required=true` (invitation acceptance) |
| Q3 = free | `entry_fee_cents=0`, `payment_required=false` |
| Q3 = paid, due on entry | fee > 0, `payment_required=true`, new meaning "before acceptance" |
| Q3 = paid, due after acceptance | fee > 0, `payment_required=true` + `approval_gate='admin_accept'`; ordering carried by a single new flag `payment_timing` ('on_entry' \| 'after_acceptance') |

Only one new field (`payment_timing`) is needed; everything else is a re-read of columns already populated. Existing tournaments map cleanly: current rows with `payment_required=true` and a zero fee are read as **Free** regardless of the flag, which fixes the four Riverside rows without touching data.

## 4. Participant state machine

One status column, explicit states, replacing today's overloaded `pending_payment` / `paid`:

```text
                 (organiser picks)              (player enters)
                      selected                     registered
                         |                              |
              [invitation sent]                  [accept gate?]
                         v                              v
                      invited  --declined-->  withdrawn / declined
                         |
                  (player accepts)
                         v
                     accepted  --organiser rejects--> declined
                         |
                 [fee due? / timing]
                         v
                    payment_due --paid/waived--> confirmed (in the field)
                         |
                    (no payment)  ------------> confirmed
```

States: `selected`, `invited`, `accepted`, `registered`, `payment_due`, `confirmed`, `withdrawn`, `declined`, `cancelled`. Compatibility: today's `pending_payment` splits into `invited` / `payment_due`, `pending_eft` becomes `payment_due` with proof attached, `paid` and `waived` both become `confirmed` (payment recorded separately), `cancelled` stays.

## 5. Admin-facing wording

- Step title: **Who plays and what it costs** (replaces "Registration & Payment").
- Summary line under the step: "Riverside Open — I choose the field · players must accept · free".
- Entry list badges: *Selected*, *Invited*, *Accepted*, *Payment due*, *Confirmed*, *Withdrawn*, *Declined*.
- Player-facing button text follows the same states: "Accept invitation", "Register", "Register & pay", "Pay entry fee".
- Never show "Paid" for a free tournament; show "Confirmed".

## 6. What stays where

Fee splits (federation/association share), refund policy and cut-off, sanctioning and eligibility scope stay in the Governance dialog and remain read-only on this step — one place to edit, one place to see.

# NSA league fee charging rules (per club)

## Recommendation
Put the charging rule **inside the fee itself** (the "Northern Squash Association" row under Fees payable to the club), not in a separate NSA settings screen. Each club already has its own NSA fee row, so each club sets its own rule there. The same rule can then be used for any league fee (RIL, RDL, etc.), not only NSA.

## What the club picks when editing the fee: "How is this fee charged?"
1. **Fixed annual amount** (today's behaviour): one amount, billed on the due date.
2. **When joining the league**: billed once when the player is placed in a team or reserve list for that season.
3. **Per game played**: amount × games played in the season (for example R40 per game), with an optional maximum (cap).
4. **Share of season games played (Uitsig sheet)**: brackets are a percentage of the league's season fixtures, so they work for 18, 16, 15, 14 or 12-round leagues:

| Share of season games | Fee | 18 rounds | 12 rounds |
|---|---:|---:|---:|
| 60%–100% | 100% | 12+ games: R750 | 8+ games: R650 |
| 40%–60% | 70% (rounded) | 8+ games: R600 | 6+ games: R500 |
| 20%–40% | 50% (rounded) | 4+ games: R350 | 3+ games: R300 |
| 0%–20% | nil | under 4: R0 | under 3: R0 |

The club can type the exact rand amount per bracket per league size (the sheet's amounts are rounded, not exact percentages), with separate Men / Ladies full fees.

**Cap rule:** a member never pays more than the full fee for their own category. A lady who also plays in a men's team is charged on all her games combined, but never above the ladies' maximum (e.g. R650) — playing extra games never raises the charge. Same cap per member if they play in more than one team.

## Billing
- Annual invoices get an **"NSA / league fees"** tick option. When chosen, the app calculates each member's amount from the fee's rule and shows a **preview list** (member, games counted, bracket, amount) before anything is billed.
- Games counted = league games actually played in that league's season (walkovers/unplayed excluded unless the club chooses otherwise).
- Bills once per member per season; re-running never charges twice, only tops up or shows a difference for approval.
- The money still flows as today: member pays club, club owes the association.

## Needed from you before building
- Uitsig's actual brackets (games ranges and amounts for men and ladies).
- Which games count: league only, or also reserves/subbing; walkovers yes or no.
- Season dates the games are counted over, and when the invoice is raised (end of season or annually).

## Technical details
- Extend the fee schedule row with a charging mode, gender amounts, cap and bracket list (additive; existing fees default to Fixed annual, so nothing changes for current clubs).
- One read-only calculation that both the preview and the billing step use, plus tests per rule (per-game, bracket edges, cap, men/ladies, no double billing).

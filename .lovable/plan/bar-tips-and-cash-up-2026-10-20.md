# Bar tips and cash-up

## Settings
- Add separate **Enable tips** and **Enable cash-up** switches in Bar setup, both initially off. Cash-up means end-of-shift cash reconciliation, not Cash App.
- Existing sales, tabs and balances remain unchanged; enabling tips never adds tips to previous transactions.

## Adding a tip
- Add an optional tip step when settling a QR/visitor tab, member tab or counter order/tab.
- Choices: **No tip**, **10%**, **Tip amount (R)** or **Total to pay (R)**. Show the sale amount, tip and total separately before confirmation.
- A R900 sale with a total of R1,000 records R100 as the tip. Reject totals below the sale amount and invalid amounts; calculate money to two decimal places.
- For self-service settlement, customers choose the serving staff person from the club's configured counter staff. Counter settlement uses the existing named staff assignment, with no anonymous recipient.
- Include the tip in the chosen cash, terminal-card, online or member-account settlement. Pending or failed online payments do not create an earned tip; provider confirmation remains authoritative. Member-account tips must follow existing credit checks and must not be treated as cash received.

## Staff balances and payouts
- Show each staff person's tips earned, cash paid out and remaining unpaid balance in the Bar area and authorised Counter view.
- Allow authorised staff to record full or partial **cash-only** payouts, with confirmation and an audit record. No card payout or transfer to a member account.
- R100 earned less R50 paid leaves R50 owing. Prevent payouts above the available staff balance and duplicate payouts on retries.
- Unpaid tips carry forward under that staff person's name; no automatic salary payment or salary integration in this phase.

## Reporting
- Separate named **Tip income — Grant** lines from product sales in Bar statistics and the income statement.
- Cash payouts appear as **Tips paid — Grant** under **Cost of sales — Bar**, never general expenses and never Shop costs.
- Preserve balanced accounting, existing cash/member-account recognition rules, stock movements and payment receipts. Tip balance and income recognition are separate where a member-account charge is still unpaid.
- Include the same treatment in printed and exported reports.

## Cash-up scope
- Add the independent enable switch now. The detailed cash-counting/reconciliation workflow will be designed separately; the switch must not expose a non-working action or alter existing settlements.
- Cash tip payouts remain available when tips are enabled, independent of the future cash-up workflow.

## Technical implementation
- Reuse existing settlement and payment authority across Counter, ScanPay and member flows; do not introduce an alternate payment engine.
- Add additive, club-scoped tip allocation and payout records, with server-side permissions, valid staff-recipient checks, immutable audit history and idempotent settlement/payout operations.
- Attach tips to persisted settlement records, not cart totals or client-supplied staff names. Preserve personal-PIN attribution and operator handovers.
- Retain receipt/refund/reopen safety so tips cannot be credited twice or paid out after an unsettled transaction.

## Verification and release
- Add focused tests for 10%, R900 → R1,000, partial payouts, invalid totals, disabled settings, staff/club isolation, duplicate callbacks and Bar reporting classification.
- Verify counter and self-service flows with synthetic Riverside data, including failure paths; do not initiate real payments or operate hardware.
- Keep both switches off for existing clubs. Do not publish or deploy payment functions without explicit release approval; no historical/live sales will be edited.
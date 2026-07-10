# Restore currency symbols on club-admin money displays

## Problem (confirmed)
The recent currency migration removed hardcoded "R" prefixes from many money-display sites in 4 club-admin files, but did NOT wire in `useClubCurrency().format()`. Admins now see bare numbers like `1500.00` on Finance, Members, Association Payables, and Honesty Bar screens.

Verified: `rg formatMoney|useClubCurrency` returns 0 hits in `FinanceTab.tsx`, `AssociationPayablesPanel.tsx`, `HonestyBarTab.tsx`; MembersTab imports the hook but doesn't use it consistently.

## Scope
~67 money-display sites across 4 files (~5,300 lines total):
- `src/components/club-admin/FinanceTab.tsx` — summary cards (Income/Expenses/Bank/Cash), by-account debit/credit, trial-balance, GL preview strings, gateway-fee helper, member statement Billed/Paid/Outstanding
- `src/components/club-admin/MembersTab.tsx` — `MemberPaymentStatus` fee lines and totals, header `{totalPaid} paid / {totalExpected} total / {outstanding} outstanding`, add/edit fee-category dropdowns, preview totals
- `src/components/club-admin/AssociationPayablesPanel.tsx` — fee badges, outstanding column, generate/settle dialog totals, per-member table
- `src/components/club-admin/HonestyBarTab.tsx` — supplier invoices, admin sale entries, ItemManager prices, PurchaseInvoice line totals, admin-add-charge item picker

## Approach
1. In each file, `import { useClubCurrency } from "@/hooks/use-currency"` and call `const { format } = useClubCurrency()` at the top of the component (already done in MembersTab).
2. Replace every bare `{amount.toFixed(2)}` / `{amount}` money render with `{format(amount)}`.
3. For inputs (fee-category dropdowns, price inputs), keep the raw number but show `{format(value)}` alongside labels only.
4. For dialogs rendered outside the component tree, pass `format` down as a prop (or call the hook inside the subcomponent).
5. Skip anywhere the number is not currency (percentages, member counts, ordinal ranks).

## Risk
Low behavioural risk — pure presentation. Must be careful in `MemberPaymentStatus` and nested dialogs that already receive props (may need to lift the hook into each subcomponent). Testing by loading each of the 4 tabs and confirming symbols appear.

## Verification
- `rg "toFixed\(2\)" src/components/club-admin/{FinanceTab,MembersTab,AssociationPayablesPanel,HonestyBarTab}.tsx` — remaining hits should only be non-currency numerics.
- Manual check of each tab in the preview.

# Tournament “Add to my account” payment option

## What will change

- Add **Add to my account** to the organiser’s per-tournament accepted payment methods.
- Show the option only when the organiser enabled it and the tournament has an entry fee.
- After a member accepts, show **Add R… to my account** alongside the enabled card and EFT choices.
- Make the result explicit: the fee remains outstanding on My Account and the member can settle it later.
- Keep the existing single fee record created during acceptance, so choosing this option never duplicates the charge.
- Keep card and EFT settlement unchanged, including doubles partner/payer handling.

## Safety and compatibility

- Existing tournaments keep their current payment methods; account charging is not silently enabled for them.
- The payment choice remains club- and member-scoped and uses the existing secured tournament acceptance operation.
- Public invite acceptance continues to reserve the entry and create the same outstanding fee; signed-in members can explicitly choose to leave it on their account where enabled.

## Verification

- Add focused tests for payment-method availability and account-option wording/behavior.
- Check tournament setup save/edit, member invite acceptance, My Account visibility, TypeScript, and the production build.
- Record the change in the project issue history. No publish or deployment.

# Nelspruit top-up: Card / EFT findings and proposed fix

## What the code and records show

**Vian's R300 top-up was paid.** Stitch payment `vJm4EbiXRnyFK1n739kDoW` was created at 08:22 SA time and marked **completed at 08:38**. The R300 credit is on his account. So the first attempt failed with "Invalid configuration", but a retry on the same Stitch page went through about 16 minutes later.

**1. Why "Card" gave "Invalid configuration"**
- In the top-up box, the **Card** button doesn't ask Stitch for card. It sends the default method `paybybank` (in `MyAccount.tsx` the card handler is still named `startYocoCheckout`, and it passes no method).
- Nelspruit's direct Stitch login is rejected, so every payment uses the simpler Stitch payment-link fallback. That fallback doesn't pass any method, so Stitch's page shows whatever is switched on for Nelspruit's account (including Capitec Pay).
- **What changed recently:** since the 5 Oct return-to-SquashHub fix, Nelspruit links now include a `redirect_url` (the return address). The 3 Oct payments that worked didn't have it. Vian's payment is the first Nelspruit payment that had it.
- **Not proven:** the "Invalid configuration" message comes from inside Stitch's page. SquashHub never receives it, and the payment completed later on the same link. The code doesn't show whether the cause was the return address, Capitec Pay's own redirect, or a short problem on Stitch's side.

**2. Why "EFT" goes to admin approval**
- This is how it was designed. In the top-up box, "EFT" means a **manual bank transfer**. It shows the club's bank details and saves a pending top-up. It emails finance (`notify-pending-topup`), and an admin confirms once the money arrives. It never sends anyone to Stitch or a bank.
- On Stitch's page, "EFT / pay by bank" is a different thing. The top-up box has no button that goes there, except Card, which secretly does exactly that.
- Vian also has two pending manual EFT requests (R347 and R100) from this flow.

**3. Intended or bugs?**
- Manual EFT going to admin: works as intended, but the label is confusing next to Stitch's own EFT.
- "Card" sending `paybybank`: a bug. It's mislabelled and the code is misnamed.
- Card text says "Your top-up will be confirmed by the admin after payment is verified": wrong for Stitch, which confirms automatically.
- "Invalid configuration": cause unconfirmed.

**4. Do we need the Stitch reference?**
We already have it: `vJm4EbiXRnyFK1n739kDoW`. The code can't show what Stitch did on its own page. Only Stitch's records can (which method failed, the exact config error, and whether the return address was the issue). Ask Stitch (Beon) to look up that payment's **first failed attempt** around 08:22–08:38 on 6 Oct.

## Proposed fix (needs your approval; nothing changed yet)

1. **Rename the top-up choices** so they're clear:
   - "Pay online (card / Capitec Pay / instant EFT) via Stitch": opens Stitch, confirmed automatically.
   - "Manual bank transfer (admin confirms)": the current EFT behaviour, unchanged.
2. **Pass the method on purpose** (`paybybank` for Stitch online), rename `startYocoCheckout`, and fix the "admin will confirm" text for online payments.
3. **Hide manual bank transfer** when the club has no bank details saved (Nelspruit has them, so it stays).
4. **Return address:** no change until Stitch confirms what caused the error. If Stitch says the `redirect_url` caused it, make Nelspruit use bare links again (payer stays on Stitch's success page, and SquashHub still confirms the payment in the background).
5. Leave the other flows alone: webhook, settlement, credentials, recurring payments and fee payment.

## Technical details
- Files: `src/pages/MyAccount.tsx` (top-up dialog, lines ~543–596 and ~1038–1094), and `src/lib/club-payments.ts` only if the method needs passing through.
- No database or server changes. Preview only, not published.

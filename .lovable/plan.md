# Stitch return-to-club: findings and smallest safe fix

## Short answer

Your reading is right and the previous diagnosis was wrong. Nothing about Nelspruit's test credentials
prevents a redirect. The payment service was changed on 17 Aug to throw away the club's own return
address and always send one shared address, `https://www.squashhub.co.za/pay/return`. That address is
not registered in any club's Stitch portal, so Stitch rejects it, and the code then deliberately opens
the payment page with no return address at all. That is why payers are parked on Stitch's success page.

This affects every club, not just Nelspruit. Gordon's Bay is in exactly the same state today.

## Evidence

- Last payment link that carried a working club return address: Gordon's Bay, 17 Aug,
  `.../pay/<id>?redirect_url=https://gb.squashhub.co.za/my-account`.
- Every payment link created since (Gordon's Bay 5 Sep–12 Sep, Nelspruit 15 Sep, including today's
  successful test payments) is a bare link with no return address at all.
- The one link created with the shared address (19 Aug) used `www.squashhub.co.za/pay/return`.
- The issue log's 9 Aug "confirmed working, do not change" entry states the non-negotiables plainly:
  the return host must be the club subdomain; the return address is sent as a query parameter on the
  hosted link; apex and `www` are rejected.

## Root cause

In `supabase/functions/stitch-create-payment/index.ts`:

1. `sanitizeReturnUrl()` ignores its argument entirely and returns the hard-coded shared
   `https://www.squashhub.co.za/pay/return`. The 9 Aug version rewrote the incoming address onto the
   club's own subdomain.
2. `appendRedirectIfReachable()` then probes the hosted link carrying that shared address. Stitch
   answers 404 because the address is not in that club's redirect list, and the helper falls back to
   the bare link, silently dropping the return address.

So the payer completes payment and has nowhere to be sent back to. The "Express fallback is required
because of test credentials" conclusion is not the cause of the missing redirect: the Express hosted
link does support a return address, and it worked on the Express path on 9 and 17 Aug.

On the credentials question: Nelspruit's `test-` client ID with client secret is the correct pairing
for the Express endpoints (`express.stitch.money/api/v1/token` and `/payments`), which is the path
being used successfully — today's test payments completed. The `invalid_client` seen earlier comes
from the newer payment-request route at `secure.stitch.money/connect/token`, which needs separate
client-portal credentials. That route failing is expected and harmless; the issue log already records
the same for Gordon's Bay. It is not the reason redirects are missing.

## Smallest safe fix

Restore the 9 Aug behaviour in the once-off payment function only:

1. `sanitizeReturnUrl(raw, clubSubdomain)` — accept the caller's return URL, fold `www` to apex, then
   rewrite apex / preview hosts to `https://<club subdomain>.squashhub.co.za`, default path
   `/my-account`, strip query and hash. This is the same function that already exists and works in
   `stitch-create-mandate`; copy its shape rather than inventing a new one.
2. Pass the club's `subdomain` (already loaded from `clubs`) into it.
3. Keep appending `redirect_url=<club URL>` to the Express hosted link. Keep the reachability probe as
   a safety net, but the probe should now pass, since `https://nsc.squashhub.co.za/*` is registered in
   Nelspruit's Stitch portal.
4. Also pass the club return URL as `redirectUrl` on the payment-request route, so clubs on
   client-portal credentials return to their own subdomain too.
5. Leave the body-level `merchantRedirectUrl`/`redirectUrl` keys on the Express create call as-is
   (harmless; Express ignores them).

Nothing changes in the mandate/recurring flow, the bar flow, or any other gateway.

## On the shared `pay/return` address

It should stay available as the fallback only. Club-registered subdomain URLs are what Stitch actually
validates against, and Stitch's five-URL limit is per club account, not platform-wide — so each club
registering `https://<sub>.squashhub.co.za/*` costs one of their own five slots. Registering that
wildcard per club is the correct long-term setup; the shared callback is used only when a club has no
usable subdomain.

## Verification before calling it fixed

- Create a fresh Nelspruit test payment and confirm the stored link ends in
  `?redirect_url=https%3A%2F%2Fnsc.squashhub.co.za%2Fmy-account`.
- Confirm the reachability probe returns 200 for that fresh link (not a consumed one).
- Complete a test payment and confirm the payer lands on `nsc.squashhub.co.za/my-account` and the
  credit posts.
- Repeat once for Gordon's Bay to confirm no regression there.
- Append the finding to `docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md`.

## Files touched by the fix

- `supabase/functions/stitch-create-payment/index.ts` (`sanitizeReturnUrl`, its call site, the
  payment-request `redirectUri`)
- `docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md`

No database, RLS or frontend changes. Deployment only on your explicit go-ahead.

# Help Center ticket publisher deployment

The canonical publisher source is `supabase/functions/help-center-ticket-feed` in `Stratus-1/squashhub`. Deploy it through the manually dispatched GitHub Actions workflow `.github/workflows/deploy-help-center-publisher.yml` from `main`. The workflow pins its checkout action and Supabase CLI version, targets the SquashHub project, and deploys only this function.

## One-time GitHub setup

The `squashhub-support-publisher` GitHub Actions environment is configured for `main` only. It requires review by the repository's Daniel-Rentoza owner account, prevents self-review, and does not allow administrators to bypass review. The only remaining GitHub setup is adding `SUPABASE_ACCESS_TOKEN` as an environment secret. It must be a Supabase personal access token whose account can deploy functions to project `bzbuppwzljadulwntjys`. Do not use a database password, service-role key, or `HELP_CENTER_HMAC_KEY` for this secret.

The Lovable database connector is for SQL queries and does not supply Edge Function deployment access. Lovable's code/deploy operation may be used when workspace credits are available; otherwise this workflow avoids requiring those credits. The current CLI identity has received HTTP 403 for the managed project, so it must not be substituted for the environment token until project access is granted.

## Release procedure

1. Merge the reviewed publisher source to canonical `main`.
2. In GitHub Actions, dispatch **Deploy Help Center ticket publisher** against `main` and complete the configured release-owner review.
3. Confirm the run succeeded and inspect the Supabase function deployment state/log metadata. Never log the access token or event payloads.
4. Verify the deployed function revision before changing either product or central delivery gates. Deployment alone must leave `help_center_delivery_mode()` paused and `PRODUCT_SUPPORT_INGRESS_ENABLED=false` until the pilot scope, central operator mapping, retention, deployed publisher and end-to-end authorization have been verified.

This workflow does not change database rows, invoke the function, enable retries, unpause the product feed, create product registry entries, or enable the central receiver. It is a deployment path only.

## Delivery response handling

The publisher treats any 2xx response as accepted. The Help Center returns 200 when the same event ID and exact body were already accepted, so idempotent replay remains successful. A 409 is a permanent conflict (for example, the event ID was reused with a different body, the ticket scope changed, or the case is a retained deletion tombstone); the current claimed outbox row is dead-lettered immediately with a safe conflict code. Do not treat HTTP 409 as proof of delivery. Other HTTP errors and network failures retain the bounded retry policy.

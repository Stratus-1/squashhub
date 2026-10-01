# Help Center ticket publisher deployment

The canonical publisher and the on-demand case-context endpoint are `supabase/functions/help-center-ticket-feed` and `supabase/functions/help-center-case-context` in `Stratus-1/squashhub`. Deploy them through the manually dispatched GitHub Actions workflow `.github/workflows/deploy-help-center-publisher.yml` from `main`. The workflow pins its checkout action and Supabase CLI version, targets the SquashHub project, and deploys only these two named functions.

## On-demand case-context endpoint

`help-center-case-context` is a read-only GET endpoint. It verifies the Google-signed central workload ID token (exact audience and service-account email), the signed IAP operator assertion (exact IAP audience, issuer, signature and time bounds), a configured operator email allowlist, and the exact tenant-scope header. It then resolves the event UUID through the service-only outbox, requires the case to be currently allowlisted, active and at the latest event revision, and reads only the subject and at most ten recent message bodies (2,000 characters each), reducing the returned message count if needed to keep the JSON under 15 KB. Database-side functions cap text before it leaves Postgres. It does not return requester/sender identifiers, attachments, profile records, or internal maintenance/AI context, and it does not write or log case content. Responses use `no-store` headers. The Help Center performs its own exact product/tenant and IAP role checks and writes only a metadata audit event. Message text can still contain personal details entered by a customer; access is limited to the approved support operators and current allowlisted cases, and no model receives this context.

The endpoint fails closed unless these Supabase function secrets are set from reviewed central configuration: `HELP_CENTER_READ_AUDIENCE` (the exact endpoint URL used as the Google ID-token audience), `HELP_CENTER_CALLER_SERVICE_ACCOUNT` (`stratus-help-center-runtime@stratus-website-496818.iam.gserviceaccount.com`), `HELP_CENTER_IAP_AUDIENCE` (the staff service's exact signed-header audience), `HELP_CENTER_OPERATOR_EMAILS` (a JSON array of explicitly authorized support operators), and `HELP_CENTER_TENANT_SCOPE` (the exact SquashHub pilot scope). These values are not present in source control. Their deployment and operator/scope approval remain separate gates; do not copy the HMAC key, dispatch secret, service-role key or customer data into these settings.

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

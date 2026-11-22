# Committee Approval Requests

An office bearer (e.g. the Treasurer) asks selected committee members to approve something: a payment, an expense, a decision. Each approver signs. When everyone has approved, the requester is told and the request is kept as a permanent record.

## Where it lives
- New Club Admin item **Approvals** under **Club operations**, with the description "Committee sign-off on transactions and decisions".
- A small "Waiting for your approval" count on the Club Admin home and in notifications, so approvers find their requests quickly.
- Who can see it: office bearers and full club admins of that club only. Each club's requests stay inside that club.

## Screens
1. **Requests list** with tabs **Waiting for me**, **My requests**, **Open**, **Approved**, **Declined**, plus a search box. The Approved tab is the permanent log.
2. **New request**
   - Topic and Description
   - Optional amount (R)
   - Attach files (PDF, image, invoice, quote), more than one allowed
   - **Approvers**: a dropdown with the club's current office bearers (name and office). Pick one or more; the requester can't pick themselves.
   - **Your signature**: draw it with a finger or mouse, upload an image, or reuse your saved signature
   - Submit
3. **Request detail** (works like a ticket)
   - Topic, description, amount, files, the requester's signature and date
   - Each approver's status: Waiting, Approved (with signature and time) or Declined (with reason)
   - For an approver who hasn't answered: **Approve and sign** (draw, upload or reuse a saved signature) or **Decline** (reason required)
   - The requester can **Withdraw** the request while it is still open
   - A short comment thread for questions

## Signatures
- Signing the first time offers "Save as my signature". After that, signing is one tap: **Use my saved signature**.
- A saved signature belongs to that person only and can be replaced in My Account.
- Each approval stores a copy of the signature as it was when signed, so changing your signature later never changes old approvals.

## Notifications (in-app and email, sent from the SquashHub main address)
- New request: every selected approver gets "Approval needed: {Topic}" with a link that opens the request.
- Fully approved: the requester gets "Approved: {Topic}".
- Declined: the requester gets "Declined: {Topic}" with the reason.
- No reminders and no other automatic messages.

## Rules
- A request is **Approved** only when every selected approver has approved.
- One decline sets the request to **Declined** straight away.
- After it is decided, a request can't be changed. It can be viewed and downloaded as a PDF summary with all signatures.
- Every step (created, viewed, approved, declined, withdrawn) is recorded with who did it and when.
- This is a sign-off record only. It never posts or changes any transaction or balance by itself.

## Technical details
- Tables: `club_approval_requests` (club_id, requester member, topic, description, amount, status open/approved/declined/withdrawn, requester signature path, decided_at), `club_approval_approvers` (request, member, status, signature path, signed_at, decline_reason), `club_approval_attachments`, `club_approval_events` (append-only audit), `member_signatures` (one saved signature per member). Each table gets GRANTs and RLS, and every row is scoped by club_id.
- The private storage bucket `club-approvals/<club>/<request>/…` keeps a snapshot copy of every signature. Storage policies mirror the table access rules.
- `can_use_club_approvals(club)` limits access to office bearers and admins. Approvers come from current `club_offices`.
- SECURITY DEFINER RPCs `approval_create`, `approval_sign`, `approval_decline`, `approval_withdraw` change the status atomically. Status is never written directly by the client.
- Notifications use the existing in-app notification table and the platform email path (`PLATFORM_ORIGINATED_TYPES`), with idempotency keys per request and recipient.
- Signature pad: a canvas component exporting PNG, with a file-upload fallback.
- Tests cover the status rules (all must approve, one decline ends it, decided requests can't change) and the requester being excluded from approvers.
- Record this module in `ARCHITECTURE.md`/`AGENTS.md` and the issue log.

## Assumptions (tell me if any are wrong)
- Every selected approver must approve. There is no "any 2 of 3" option.
- Only office bearers and full admins can create requests or be chosen as approvers.
- Decline is available as well as Approve.

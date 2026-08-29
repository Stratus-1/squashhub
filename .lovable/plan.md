# Search-first club registration (no duplicate clubs)

We now hold 169 tenants, of which 120 clubs are pre-loaded shells from the federation tree with slugs already assigned and no members yet. Anyone hitting "Register your club" today can create a second copy of a club that already exists. Registration becomes search-first: find the club, claim it, and only create when it genuinely does not exist.

## The flow

```text
Register your club
   |
   1. Search: type club name / town
   |
   +-- Match found, club has NO admin yet  -> "This is my club — claim it"
   |        -> claim request -> Super Admin approves -> claimer becomes club admin
   |
   +-- Match found, club ALREADY claimed   -> "Join <Club> as a member"
   |        -> sent to that club's sign-up page (normal member flow)
   |
   +-- No match ("My club isn't listed")   -> create form unlocks
            -> new club created, slug auto-suggested from initials
```

## 1. Search step (replaces the current name field)

- One search box across every club and association in the system (promoted federation clubs, seeded NSA clubs, live clubs), matching on name, town/address and slug, with fuzzy/partial matching so "alberton" finds "Alberton Squash Club".
- Each result shows club name, region/association it sits under, its slug, and a status badge:
  - **Available to claim** — no admin yet
  - **Already active** — has an admin
- The "Create a new club" form stays hidden until the user searches and explicitly presses "My club isn't listed".

## 2. Claiming an existing club

- Claim form asks for: the claimer's role at the club (chairman/secretary/captain/treasurer/other), contact number, and a short note proving affiliation.
- Creates a **claim request** in a pending state. The user sees a "waiting for approval" screen and gets an email confirming the request was received.
- Super Admin gets an in-app notification plus email, and reviews claims in a new **Club claims** section under Super Admin. Approve grants the claimer club admin on that existing club (no new tenant, slug unchanged) and emails them their workspace link. Reject sends a polite decline with a reason.
- A club can only have one open claim at a time; a second person claiming the same club is told a claim is already under review.

## 3. Already-claimed clubs

- No admin request path. The result card offers "Join as a member", linking to that club's sign-up on its own subdomain, where the existing club admin approves them through the normal member flow.

## 4. Creating a genuinely new club

- Same form as today (name, abbreviation, address, email, phone) but reached only after a search.
- Slug is auto-suggested from the club's initials (Alberton Squash Club -> `asc`), falling back to a numbered variant if taken, and stays editable with the existing live availability check.
- Before insert, a server-side near-duplicate check runs again; if it finds a close name match the user is shown it once more and must confirm.
- New clubs keep the existing trial subscription + Super Admin notification behaviour.

## Technical notes

- New table `club_claim_requests` (club_id, requester user id, claimed role, contact, note, status, reviewer, review note, timestamps) with RLS: requester reads their own rows, Super Admins read/manage all, inserts scoped to `auth.uid()`.
- New security-definer RPC `search_registerable_clubs(_q text)` returning id, name, slug, region/parent association, and a computed `is_claimable` flag (no admin member exists) — safe for anonymous callers, exposing no member or contact PII.
- New RPC `approve_club_claim(_request_id)` / `reject_club_claim(_request_id, _reason)`, Super Admin only: approve inserts the `club_members` admin row, sets `club_captain_member_id` if empty, marks the claim approved and queues the emails.
- `src/pages/RegisterClub.tsx` restructured into three states (search / claim / create); the current NSA seeded-match warning is absorbed into the search results.
- `useCreateClub` keeps working for the create branch; the "user already belongs to a club" guard in `create-club` stays as-is.
- Emails go through the existing transactional email queue (claim received, claim approved, claim rejected, plus the Super Admin alert).

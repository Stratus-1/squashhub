# Standard Family Memberships — analysis and implementation plan

Analysis only at this stage. No fee amounts, member records, invoices, payments or existing membership types (Spouse, Scholar, Junior, Student, Pensioner) change as a result of this plan.

**Decided:** the two types use fixed system names — "Family Package" and "Additional Family Member" — across every club; only the amounts and the package settings stay club-configured. Family members can be added during registration **or** added one at a time later, including for members who are already registered.

## (a) What already exists and can be reused

- **Club fee setup** — each club has its own list of membership categories (`member_fee_categories`: name, description, annual amount, pro-rata, due month, billing period, debit-order settings), managed in the club admin Fees screen. Categories already carry a *class* label, and "family" is already one of the allowed classes — three categories use it today.
- **Real family-style pricing already in the wild**, priced very differently per club: Gordons Bay "Family Plan" R1,600 with "Member of family" R120 (description says "up to 4 people"); Harlequins "Family (1 league player)" R3,100 with "Family extra league player" R1,530; Highveld "Full member/Main Member" R160 with "Family members - no fee" R0. CSIR by contrast has a standalone "Family Discounted (Spouse) – External" — a separate membership type, not an add-on.
- **Member fee charging** — each member's own charges live on their own member account with a season year, invoice number and paid flag, and post to the ledger. Automatic seeding only raises the member's own club membership category charge.
- **Shared access / linked accounts** — a member can already grant another member of the same club access to their fees (request by member number + cell, the other person accepts or declines, revocable, max 5). This is the natural base for "primary family member pays for the linked family members".
- **Family logins already supported** — several members may share one email/login and switch profiles, while each remains a separate member record.
- **Joining flow** — the member onboarding wizard lets a joiner pick their fee category and shows what will be charged; an existing function can generate a personal sign-in/registration link for a member, which is what family invitations would use.

## (b) Risks and backward-compatibility concerns

1. **Never reprice.** Standardising names must not touch amounts, pro-rata settings, due dates or debit-order settings. Mapping is a *label/type* change only.
2. **Ambiguity.** "Spouse", "Scholar", "Junior", "Student" must stay standalone types. Only clearly-named main/additional family categories get proposed for mapping, and only with admin confirmation.
3. **Existing charges already raised** for this season must keep their current label and amount; standardisation applies to the category, not to charges already invoiced.
4. **Auditability.** One payer settling several people's charges must not move the charge off the person it belongs to.
5. **No name-based merging.** Existing members are never linked into a family on surname/address similarity — only on explicit admin or member confirmation.
6. **Capacity vs reality.** A club may already have more people informally on a family plan than the new limit allows; the limit must warn, not block or delete.

## (c) Proposed schema/data changes

- `member_fee_categories`: add `family_role` (null | `primary` | `additional`) — the system-standard type marker; plus on primary categories `family_max_additional` (integer), `family_allowed_relationships` (text array, e.g. spouse/partner, child/dependent), `family_dependent_max_age` (nullable integer), and `family_additional_category_id` pointing at the club's Additional Family Member category. Name/amount stay club-owned; the standard *type* is the `family_role`, and the UI presents the standard names.
- New `club_family_groups`: club, primary member, season year, status, timestamps — one row per family package instance.
- New `club_family_members`: family group, member, relationship, status (`invited` / `active` / `removed`), invited_at, confirmed_at — a member belongs to at most one active family group per club.
- `club_member_fee_payments`: add nullable `paid_by_member_id` and `family_group_id` so a combined settlement stays attributable to each person (same pattern already used for paying tournament entries for others).
- Optional `family_mapping_review` flag/table to hold "needs club-admin review" suggestions from migration.
- All new tables get grants + RLS scoped to the club, admins and the family's own members.

## (d) UI changes

**Club fee setup (Fees tab)** — a "Family package" section: mark one category as the Family Package and one as Additional Family Member (names fixed by the system, amounts free), set how many additional members are included, which relationships qualify, and an optional dependent age limit. Existing categories are untouched unless the admin maps them.

**New registration** — when a joiner picks Family Package they become the primary holder. Adding family members at this point is **optional**: they may add all of them now, some of them, or none and do it later. For each person added now we capture name, surname, email, the normal required joining fields and relationship. The combined total is shown (e.g. R1,600 + 2 × R120 = R1,840) and paid once by the primary member. Each added person gets their own member record and an invitation link to activate their own login and set a password.

**Add family member later (one at a time)** — the same capability is available any time after registration, for new and existing members alike, from an "Add family member" button on the member's account (and from the member's row in club admin). One person per use:

1. Choose *existing club member* (found by member number) or *new person* (name, surname, email, relationship, plus the club's required joining fields).
2. The app checks capacity and eligibility against the club's Family Package settings (max additional members, allowed relationships, optional dependent age limit) and warns clearly if the family is already full — it never silently blocks or deletes anything.
3. The person is added as `invited`; an existing member must accept (reuses the existing shared-access accept/decline), a new person gets their own invitation link to set up their login.
4. Their Additional Family Member charge is raised on their own account, pro-rated by the club's existing rules for the remaining season, with the primary member recorded as payer. The primary can settle it immediately or with their next payment.

Adding later never re-raises or changes anything already invoiced.

**Existing member** — a "My family" card on the member's account: switch to the Family Package where the club allows it, add family members one by one as above, see who is linked and their status, remove a member (their membership is not deleted — see open question 3), and pay everyone's fees in one go.

**Club admin** — a family review screen listing suggested category mappings and suggested family links with Confirm / Reject per row, plus a families roster showing each package, its members and capacity usage.

## (e) Migration strategy

1. **Read-only report first**: scan every club's categories and classify each as likely-primary, likely-additional, or leave-alone, with the evidence (name and description wording). Nothing is written.
2. **Admin-confirmed mapping**: each club admin reviews the suggestions and confirms. Only on confirmation is `family_role` set. Amounts, pro-rata, due dates and debit-order settings are never written.
3. **Existing links**: propose family links only from hard evidence — an existing accepted shared-access grant between two members, or members already on the club's additional-family category. Everything else is flagged for review. Nothing links automatically on shared surname, address or email.
4. **Charges stay as they are.** Historical and current-season charges keep their labels and amounts; new behaviour applies to charges raised after the change.
5. **Reversible**: clearing `family_role` and deleting the family group rows returns a club to exactly its current behaviour.

## Decisions (previously open)

1. **Charges sit on each person's own account**, with the primary member recorded as the payer. One combined payment settles them all, and every charge stays attributable to the person it belongs to.
2. **R0 additional members still get a zero-value charge line** each season, so the record shows they were covered by the package.
3. **Leaving a family converts the person to the club's standard membership category**, but not silently: the change is proposed for the next renewal and a club admin must approve it before it takes effect. Their history and past charges are untouched.

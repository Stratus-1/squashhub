# Junior provincial associations and the Northerns Junior Squash zone

## What we are building
Two new levels on top of today's regional associations. They are used only for grouping: no club moves, gets copied or loses its regional association.

```text
Squash South Africa                    (national)
 └── Northerns Junior Squash           (zone)
      ├── Mpumalanga Junior Squash     (provincial association)
      │    ├── Mpumalanga Highveld, Mpumalanga East, Mpumalanga West (whole associations)
      │    └── individually added clubs/schools
      ├── Limpopo Junior Squash
      ├── North West Junior Squash
      └── Vaal Triangle Junior Squash
```

Agreed rules:
- A junior can belong to two associations at once. For example, a Pretoria junior plays NSA league through his club and also plays junior competitions through his provincial junior association. Nothing has to be chosen or switched: his club membership covers both.
- Juniors stay in their own clubs. Their age (from the private date of birth) makes them junior. Only the age group is ever shown.
- Riverside and Lakeside stay under Regional test and are left out.
- Vaal Triangle Junior Squash is part of the Northerns zone. The senior Vaal Triangle association and its clubs stay exactly as they are. The rest of Gauteng is not in the zone for now.
- Northerns Junior Squash is a different body from the Northern Squash Association (NSA, Pretoria only). The two are never merged or confused.
- Adding a whole association brings in all its clubs, including clubs that join it later. Single clubs or schools can also be added or left out.

## Step 1: Structure (Super Admin only)
- Create Northerns Junior Squash (zone) under Squash SA.
- Create Mpumalanga Junior Squash, Limpopo Junior Squash, North West Junior Squash and Vaal Triangle Junior Squash under it.
- Link each regional association to its province, using the matching associations from the structure document (shown to you for approval before saving).
- A small Super Admin screen to add or remove associations and single clubs, with a preview of the clubs and junior counts before saving.

## Step 2: Admins
- Each provincial association and the zone get their own admins.
- Those admins see only junior competition data: entries, results and age groups. They never see club money, the bar, contact details or dates of birth.

## Step 3: Tournaments
- Two new choices under "Who may enter": Provincial (for example Mpumalanga Junior Squash) and Zone (Northerns Junior Squash), each with an age-group limit.
- Provincial Junior Champs then feed Northerns Junior Squash Champs.
- If a junior is a member at clubs in two provinces, they choose one province per season.

## Step 4: Updated structure document and PDF
- Add the new levels to the Squash SA structure document and make a new PDF.

## Data corrections (approved)
- **Sasol Recreation Club** stays under Mpumalanga Highveld, so it is in Mpumalanga Junior Squash.
- **Sasolburg Squash Club** stays under Vaal Triangle (Free State), as you said.
- **"Sasol"** (5 members, no association yet) gets added to Mpumalanga Junior Squash as a single club. Its regional association is still to be decided.
- **Highveld Squash Club** keeps both links: Mpumalanga Highveld (senior) and Mpumalanga West Junior Squash (junior). Mpumalanga West Junior Squash goes under Mpumalanga Junior Squash.
- **Glenwood (Pretoria)** moves from KZN Squash Union to the Northern Squash Association. This is the first step, with an audit record and no other changes.

## Not included
- No fees or licence billing for juniors.
- No changes to existing leagues, ladders, club memberships or member records.
- Built for any age group, but only the junior versions are created now. Riverside pilot rules don't apply because this doesn't change how tournaments run.

## Technical details
- Extend `org_kind` with `zone` and `provincial`. Use `organisation_relationships` with a new relationship value (e.g. `junior_grouping`) so an association keeps its existing `affiliation` parent while also sitting under a provincial grouping. Include and exclude rows for single clubs.
- Add a security-definer helper that resolves the clubs in a grouping (associations plus direct clubs, minus exclusions). Reuse `org_descendants`, `can_view_org` and `has_org_role` for admin scope.
- Add tournament eligibility scopes `provincial` and `zone` next to club/association/federation, resolving clubs through the helper. Junior eligibility uses `age_group_for_age`.
- A table to store each multi-club junior's chosen province per season.
- Migrations with grants and RLS; types sync; tests for club resolution, exclusions, the age gate and admin data isolation. Update `ARCHITECTURE.md` and `docs/SQUASH_SA_STRUCTURE.md`.

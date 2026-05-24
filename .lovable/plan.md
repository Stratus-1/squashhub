## Fix: Jason Stoltz should be a member, not a visitor

### Root cause
In `club_members` for NSC, Jason Stoltz (`294c3a0e-e4c9-44eb-bca0-ef39115a4c5b`) has `role = 'visitor'`. The Visitors tab (`src/components/club-admin/VisitorsTab.tsx`) joins anyone with `role='visitor'` into the visitor list — that's why he shows up there with the "Member record" badge even though he already has a ladder position (#43) and a NIL registration.

### Change
One-row update via migration:

```sql
UPDATE public.club_members
SET role = 'member'
WHERE id = '294c3a0e-e4c9-44eb-bca0-ef39115a4c5b';
```

### What this affects
- ✅ Removed from Visitors tab
- ✅ Appears in the regular Members roster
- ✅ Ladder position #43 preserved (separate column)
- ✅ NIL league affiliation & registration preserved (lives in `member_association_affiliations` / `member_league_registrations`, not on the role)
- ✅ Phone `0728204236` and email `jason9stoltz@gmail.com` unchanged

No code changes needed — just the data fix.
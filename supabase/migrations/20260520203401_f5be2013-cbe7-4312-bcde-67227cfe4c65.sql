
DELETE FROM bar_tab_entries
WHERE id IN ('2063c3ea-14c6-4dd0-aa14-c31ba69b85b4','26a0e31c-2898-444b-9059-2d321bf5a583');

UPDATE club_member_fee_payments p
SET paid = true, paid_at = COALESCE(paid_at, now())
FROM club_members cm
WHERE cm.id = p.club_member_id
  AND cm.club_id = '061e6dd9-0ec2-4427-a939-3f18ad0884c8'
  AND p.paid = false;

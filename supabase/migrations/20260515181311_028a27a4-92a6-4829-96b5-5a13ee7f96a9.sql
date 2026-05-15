UPDATE public.club_members cm
SET role = 'visitor'::public.club_member_role,
    club_member_number = NULL,
    plays_league = false
FROM public.member_fee_categories fc
WHERE cm.fee_category_id = fc.id
  AND lower(trim(fc.name)) = 'visitor'
  AND cm.role <> 'admin';

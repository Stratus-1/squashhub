SELECT cm.name, c.name AS club_name, maa.league_association_number
FROM public.club_members cm
LEFT JOIN public.clubs c ON c.id = cm.club_id
LEFT JOIN public.member_association_affiliations maa ON maa.club_member_id = cm.id
WHERE lower(coalesce(cm.name,'')) IN ('johan liebenberg','izak lamprecht')
ORDER BY cm.name, c.name;
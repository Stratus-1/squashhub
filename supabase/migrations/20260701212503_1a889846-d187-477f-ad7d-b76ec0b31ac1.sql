DELETE FROM public.notifications n
USING public.notifications n2
WHERE n.type = 'tournament_invite'
  AND n2.type = 'tournament_invite'
  AND n.data->>'champ_id' = '056992f7-38b5-4d9f-a276-71b27c8b51b0'
  AND n2.data->>'champ_id' = '056992f7-38b5-4d9f-a276-71b27c8b51b0'
  AND n.club_member_id = n2.club_member_id
  AND n.created_at > n2.created_at;
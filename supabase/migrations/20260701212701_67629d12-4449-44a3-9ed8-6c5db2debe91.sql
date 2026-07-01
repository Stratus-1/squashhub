UPDATE public.notifications
SET read = false
WHERE type = 'tournament_invite'
  AND club_member_id = '815bf120-6261-4455-b9ad-837313233a88'
  AND data->>'champ_id' IN ('056992f7-38b5-4d9f-a276-71b27c8b51b0','49f501d1-c799-48d6-9a5e-8c32e16cb735')
  AND id IN (
    SELECT DISTINCT ON (data->>'champ_id') id
    FROM public.notifications
    WHERE type = 'tournament_invite'
      AND club_member_id = '815bf120-6261-4455-b9ad-837313233a88'
    ORDER BY data->>'champ_id', created_at DESC
  );
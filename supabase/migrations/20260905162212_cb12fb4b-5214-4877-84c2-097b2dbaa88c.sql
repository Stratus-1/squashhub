-- Second sweep: also clear invites addressed to the REGISTRANT whose own entry is resolved
UPDATE public.notifications n
   SET read = true
  FROM public.club_champs_registrations r
 WHERE NOT n.read
   AND n.type IN ('tournament_invite', 'tournament_partner_invite', 'tournament_doubles_pair')
   AND n.data->>'champ_id' = r.champ_id::text
   AND n.club_member_id = r.club_member_id
   AND r.status IN ('paid','waived','declined','cancelled');
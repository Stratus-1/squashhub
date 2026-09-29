CREATE OR REPLACE FUNCTION public.tournament_member_names(p_champ_id uuid)
RETURNS TABLE(id uuid, name text, club_member_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_tournament(auth.uid(), p_champ_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT cm.id, COALESCE(NULLIF(cm.name,''), pr.name)::text, cm.club_member_number::text
  FROM public.club_members cm
  LEFT JOIN public.profiles pr ON pr.id = cm.user_id
  WHERE cm.id IN (
    SELECT r.club_member_id FROM public.club_champs_registrations r WHERE r.champ_id = p_champ_id
    UNION SELECT r.partner_member_id FROM public.club_champs_registrations r WHERE r.champ_id = p_champ_id
    UNION SELECT m.player_a_member_id FROM public.club_champs_matches m WHERE m.champ_id = p_champ_id
    UNION SELECT m.player_b_member_id FROM public.club_champs_matches m WHERE m.champ_id = p_champ_id
    UNION SELECT m.partner_a_member_id FROM public.club_champs_matches m WHERE m.champ_id = p_champ_id
    UNION SELECT m.partner_b_member_id FROM public.club_champs_matches m WHERE m.champ_id = p_champ_id
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.tournament_member_names(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_member_names(uuid) TO authenticated;
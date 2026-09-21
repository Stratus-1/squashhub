CREATE OR REPLACE FUNCTION public.tournament_pair_list(p_champ_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF NOT public.can_view_tournament(p_champ_id) THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'group_number', p.group_number,
           'status', p.status,
           'member_a', p.member_a,
           'member_a_name', a.name,
           'member_b', p.member_b,
           'member_b_name', b.name
         ) ORDER BY p.group_number, p.created_at), '[]'::jsonb)
    INTO v_rows
    FROM public.champ_doubles_pairs p
    JOIN public.club_members a ON a.id = p.member_a
    JOIN public.club_members b ON b.id = p.member_b
   WHERE p.champ_id = p_champ_id
     AND p.status IN ('pending', 'awaiting_payment', 'confirmed');
  RETURN v_rows;
END $function$;

GRANT EXECUTE ON FUNCTION public.tournament_pair_list(uuid) TO anon, authenticated, service_role;
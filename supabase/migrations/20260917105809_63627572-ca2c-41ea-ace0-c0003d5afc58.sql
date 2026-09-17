CREATE OR REPLACE FUNCTION public.list_family_doubles_players(
  p_champ_id uuid,
  p_group_number integer,
  p_token text DEFAULT NULL,
  p_verify text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payer uuid;
  v_rows jsonb;
BEGIN
  v_payer := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF NOT public.champ_is_family_doubles(p_champ_id) THEN
    RAISE EXCEPTION 'Family pair entry is not enabled for this tournament';
  END IF;
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN
    RAISE EXCEPTION 'This division is not a doubles division';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'member_id', m.id,
           'display_name', m.name,
           'club_id', m.club_id,
           'club_name', c.name,
           'gender', m.gender,
           'ladder_position', m.ladder_position,
           'fee_paid', public.champ_member_fee_paid(p_champ_id, m.id),
           'is_payer', m.id = v_payer,
           'paired', EXISTS (
             SELECT 1 FROM public.champ_doubles_pairs p
              WHERE p.champ_id = p_champ_id
                AND p.group_number = p_group_number
                AND p.status IN ('pending','awaiting_payment','confirmed')
                AND m.id IN (p.member_a, p.member_b)
           )
         ) ORDER BY m.name), '[]'::jsonb)
    INTO v_rows
    FROM public.club_champs_registrations r
    JOIN public.club_members m ON m.id = r.club_member_id
    LEFT JOIN public.clubs c ON c.id = m.club_id
   WHERE r.champ_id = p_champ_id
     AND lower(COALESCE(r.status, '')) NOT IN ('cancelled','declined','withdrawn')
     AND r.declined_at IS NULL
     AND r.invite_revoked_at IS NULL
     AND (p_group_number = ANY (COALESCE(r.division_choices, '{}'))
          OR COALESCE(array_length(r.division_choices, 1), 0) = 0)
     AND (r.invited_at IS NOT NULL
          OR r.confirmed_at IS NOT NULL
          OR r.invite_token IS NOT NULL);

  RETURN v_rows;
END;
$$;
ALTER FUNCTION public.get_tournament_invite(text) RENAME TO get_tournament_invite_base;
REVOKE ALL ON FUNCTION public.get_tournament_invite_base(text) FROM PUBLIC, anon, authenticated;

-- Same payload as before, plus what an organiser-entered player needs to see:
-- that the entry already exists, their category and their assigned partner.
CREATE OR REPLACE FUNCTION public.get_tournament_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_base jsonb;
  v_reg record;
  v_champ record;
  v_partner text;
  v_cat text;
  v_token text := trim(COALESCE(p_token, ''));
BEGIN
  v_base := public.get_tournament_invite_base(p_token);
  IF NOT COALESCE((v_base->>'found')::boolean, false) THEN RETURN v_base; END IF;

  IF length(v_token) < 32 THEN
    SELECT isc.invite_token INTO v_token FROM public.invite_short_codes isc
     WHERE isc.code = regexp_replace(lower(v_token), '[^a-z0-9]+$', '');
  END IF;
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = v_token;
  IF NOT FOUND THEN RETURN v_base; END IF;
  SELECT group_labels INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;

  IF v_reg.partner_member_id IS NOT NULL THEN
    SELECT NULLIF(trim(name), '') INTO v_partner FROM public.club_members WHERE id = v_reg.partner_member_id;
    IF v_partner IS NOT NULL AND position(' ' IN v_partner) > 0 THEN
      v_partner := split_part(v_partner, ' ', 1) || ' ' || upper(left(split_part(v_partner, ' ', 2), 1)) || '.';
    END IF;
  END IF;
  IF COALESCE(array_length(v_reg.division_choices, 1), 0) > 0 THEN
    v_cat := NULLIF(v_champ.group_labels ->> (v_reg.division_choices[1])::text, '');
  END IF;

  RETURN v_base || jsonb_build_object(
    'admin_entered', COALESCE(v_reg.invited_by_admin, false)
        AND (v_reg.registration_source = 'admin' OR v_reg.confirmation_source = 'admin'),
    'partner_name', v_partner,
    'entry_category', v_cat
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tournament_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tournament_invite(text) TO anon, authenticated, service_role;
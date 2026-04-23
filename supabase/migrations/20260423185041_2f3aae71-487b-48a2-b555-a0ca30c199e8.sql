-- Drop the old signature explicitly so the new defaults can apply
DROP FUNCTION IF EXISTS public.claim_member_by_league_number(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.claim_member_by_league_number(uuid, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.claim_member_by_league_number(
  _club_member_id uuid,
  _league_number text,
  _email text,
  _phone text DEFAULT NULL::text,
  _club_id uuid DEFAULT NULL::uuid,
  _club_member_number text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_norm_number text := upper(btrim(coalesce(_league_number, '')));
  v_norm_email text := lower(btrim(coalesce(_email, '')));
  v_norm_member_no text := nullif(btrim(coalesce(_club_member_number, '')), '');
  v_match_id uuid;
  v_assoc_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _club_member_id IS NULL OR v_norm_number = '' THEN
    RAISE EXCEPTION 'Missing club member or league number';
  END IF;

  SELECT cm.id, maa.association_id
    INTO v_match_id, v_assoc_id
  FROM public.club_members cm
  JOIN public.member_association_affiliations maa ON maa.club_member_id = cm.id
  WHERE cm.id = _club_member_id
    AND cm.user_id IS NULL
    AND maa.active = true
    AND upper(btrim(maa.league_association_number)) = v_norm_number
  LIMIT 1;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'No unlinked member matches that league number';
  END IF;

  UPDATE public.club_members
  SET user_id                      = v_uid,
      email                        = COALESCE(NULLIF(v_norm_email, ''), email),
      phone                        = COALESCE(NULLIF(btrim(_phone), ''), phone),
      club_member_number           = COALESCE(v_norm_member_no, club_member_number),
      plays_league                 = true,
      enable_league_association_id = COALESCE(enable_league_association_id, v_assoc_id),
      updated_at                   = now()
  WHERE id = v_match_id;

  RETURN v_match_id;
END;
$function$;

-- Reset Samuel for re-testing: clear linkage AND auth row
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'samuelvansittert1995@gmail.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_uid;
    DELETE FROM public.profiles WHERE id = v_uid;
    UPDATE public.club_members SET user_id = NULL, email = NULL, phone = NULL, club_member_number = NULL WHERE user_id = v_uid;
    DELETE FROM auth.users WHERE id = v_uid;
  END IF;
  UPDATE public.club_members
    SET user_id = NULL, email = NULL, phone = NULL, club_member_number = NULL
    WHERE id = 'd44a9c91-9028-4a70-aa0f-fe4aef5025ab';
END $$;
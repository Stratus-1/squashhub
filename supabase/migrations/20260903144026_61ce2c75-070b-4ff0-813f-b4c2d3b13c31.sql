
CREATE OR REPLACE FUNCTION public.store_bar_otp(_club_member_id uuid, _code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_recent int;
BEGIN
  SELECT * INTO v_member FROM public.club_members WHERE id = _club_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF _code !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'Invalid code'; END IF;

  SELECT count(*) INTO v_recent FROM public.member_bar_otps
   WHERE club_member_id = _club_member_id AND created_at > now() - interval '15 minutes';
  IF v_recent >= 5 THEN RAISE EXCEPTION 'Too many codes requested — please try again later'; END IF;

  UPDATE public.member_bar_otps SET consumed_at = now()
   WHERE club_member_id = _club_member_id AND consumed_at IS NULL;

  INSERT INTO public.member_bar_otps (club_member_id, club_id, code_hash, expires_at)
  VALUES (_club_member_id, v_member.club_id, crypt(_code, gen_salt('bf')), now() + interval '10 minutes');

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.store_bar_otp(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_bar_otp(uuid, text) TO service_role;

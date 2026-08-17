CREATE POLICY "Club members can view their club QR codes"
ON public.qr_short_codes
FOR SELECT
TO authenticated
USING (active AND is_club_member(auth.uid(), club_id));

CREATE OR REPLACE FUNCTION public.get_or_create_venue_qr_code(_club_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_alphabet text := 'abcdefghijkmnpqrstuvwxyz23456789';
  i int;
BEGIN
  IF NOT (public.is_club_member(auth.uid(), _club_id)
          OR public.is_club_admin(auth.uid(), _club_id)
          OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Not a member of this club';
  END IF;

  SELECT code INTO v_code
  FROM public.qr_short_codes
  WHERE club_id = _club_id AND kind = 'venue' AND active
  LIMIT 1;

  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  v_code := '';
  FOR i IN 1..8 LOOP
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  END LOOP;

  INSERT INTO public.qr_short_codes (club_id, bar_item_id, kind, code)
  VALUES (_club_id, NULL, 'venue', v_code);

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_venue_qr_code(uuid) TO authenticated;
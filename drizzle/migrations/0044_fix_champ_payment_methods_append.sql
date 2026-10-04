CREATE OR REPLACE FUNCTION public._champ_payment_methods(p_champ_id uuid)
 RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c record; cl record; v_bank boolean; v_ok text[] := ARRAY[]::text[]; v_acc text[]; v_out text[];
BEGIN
  SELECT * INTO c FROM public.club_champs WHERE id = p_champ_id;
  IF NOT FOUND THEN RETURN ARRAY[]::text[]; END IF;
  SELECT payment_gateway, accepted_payment_methods INTO cl FROM public.clubs WHERE id = c.club_id;
  v_acc := coalesce(cl.accepted_payment_methods, ARRAY['cash','eft','online']);
  SELECT EXISTS (SELECT 1 FROM public.club_secrets s WHERE s.club_id = c.club_id
                  AND (nullif(trim(s.bank_account_number),'') IS NOT NULL OR nullif(trim(s.bank_name),'') IS NOT NULL)) INTO v_bank;
  IF 'online' = ANY(v_acc) AND nullif(trim(coalesce(cl.payment_gateway,'')),'') IS NOT NULL THEN v_ok := array_append(v_ok, 'card'::text); END IF;
  IF 'eft' = ANY(v_acc) AND v_bank THEN v_ok := array_append(v_ok, 'eft'::text); END IF;
  IF 'cash' = ANY(v_acc) THEN v_ok := array_append(v_ok, 'cash'::text); END IF;
  v_ok := array_append(v_ok, 'account'::text);
  IF coalesce(cardinality(c.payment_methods),0) = 0 THEN RETURN v_ok; END IF;
  SELECT coalesce(array_agg(m ORDER BY array_position(v_ok, m)), ARRAY[]::text[]) INTO v_out
    FROM unnest(v_ok) m WHERE m = ANY(c.payment_methods);
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public._champ_payment_methods(uuid) FROM PUBLIC, anon, authenticated;
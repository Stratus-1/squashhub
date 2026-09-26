ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS suspended_until date;

DROP FUNCTION IF EXISTS public.admin_set_member_standing(uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.admin_set_member_standing(_member_id uuid, _status text, _rule text DEFAULT NULL, _reason text DEFAULT NULL, _until date DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE m record; txt text;
BEGIN
  IF _status NOT IN ('active','suspended','resigned') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  SELECT * INTO m FROM public.club_members WHERE id = _member_id;
  IF m IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT public.is_club_admin_or_permitted(auth.uid(), m.club_id, 'members') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _status = 'suspended' AND _until IS NOT NULL AND _until <= (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN
    RAISE EXCEPTION 'Suspension end date must be in the future';
  END IF;
  txt := NULLIF(trim(concat_ws(' — ', NULLIF(trim(coalesce(_rule,'')),''), NULLIF(trim(coalesce(_reason,'')),''))), '');

  IF _status = 'suspended' THEN
    UPDATE public.club_members SET status = 'suspended', suspension_manual = true,
      suspension_status = 'manual_hold', suspension_reason = coalesce(txt, 'Suspended by club committee'),
      suspended_at = now(), suspended_until = _until
    WHERE id = _member_id;
  ELSIF _status = 'resigned' THEN
    UPDATE public.club_members SET status = 'resigned', suspended_until = NULL WHERE id = _member_id;
  ELSE
    UPDATE public.club_members SET status = 'active', suspension_manual = false,
      suspension_status = 'active', suspension_reason = NULL, suspended_at = NULL, suspended_until = NULL
    WHERE id = _member_id;
  END IF;

  INSERT INTO public.member_suspension_log(club_id, club_member_id, previous_status, new_status, reason, changed_by, automatic)
  VALUES (m.club_id, _member_id, m.suspension_status,
          CASE WHEN _status='suspended' THEN 'manual_hold'::member_suspension_status
               WHEN _status='active' THEN 'active'::member_suspension_status
               ELSE m.suspension_status END,
          concat('[', _status, '] ', coalesce(txt,''), CASE WHEN _status='suspended' AND _until IS NOT NULL THEN ' (until ' || _until || ')' ELSE '' END),
          auth.uid(), false);
  RETURN jsonb_build_object('ok', true, 'club_id', m.club_id);
END $function$;
REVOKE ALL ON FUNCTION public.admin_set_member_standing(uuid, text, text, text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_member_standing(uuid, text, text, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.lift_expired_member_suspensions()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id, club_id, suspension_status FROM public.club_members
    WHERE status = 'suspended' AND suspended_until IS NOT NULL
      AND suspended_until <= (now() AT TIME ZONE 'Africa/Johannesburg')::date
  LOOP
    UPDATE public.club_members SET status = 'active', suspension_manual = false, suspension_status = 'active',
      suspension_reason = NULL, suspended_at = NULL, suspended_until = NULL, suspension_cleared_at = now()
    WHERE id = r.id;
    INSERT INTO public.member_suspension_log(club_id, club_member_id, previous_status, new_status, reason, changed_by, automatic)
    VALUES (r.club_id, r.id, r.suspension_status, 'active', '[active] Suspension period ended', NULL, true);
    n := n + 1;
  END LOOP;
  RETURN n;
END $function$;
REVOKE ALL ON FUNCTION public.lift_expired_member_suspensions() FROM public, anon, authenticated;

SELECT cron.schedule('lift-expired-suspensions-hourly', '5 * * * *', 'SELECT public.lift_expired_member_suspensions()');
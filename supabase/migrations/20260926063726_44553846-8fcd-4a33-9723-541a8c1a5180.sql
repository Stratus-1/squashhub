
CREATE OR REPLACE FUNCTION public.member_access_blocked(_user_id uuid, _club_id uuid, _member_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members m
    WHERE m.club_id = _club_id
      AND ((_member_id IS NOT NULL AND m.id = _member_id) OR (_member_id IS NULL AND m.user_id = _user_id))
      AND (m.status IN ('suspended','resigned')
           OR (m.suspension_manual AND m.suspension_status IN ('suspended','manual_hold')))
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.club_members m2
    WHERE m2.club_id = _club_id AND _member_id IS NULL AND m2.user_id = _user_id
      AND m2.status = 'active'
      AND NOT (m2.suspension_manual AND m2.suspension_status IN ('suspended','manual_hold'))
  );
$$;
REVOKE EXECUTE ON FUNCTION public.member_access_blocked(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_access_blocked(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_open_club_door(_user_id uuid, _club_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.is_club_admin_or_permitted(_user_id, _club_id, 'devices')
     OR public.is_club_admin_or_permitted(_user_id, _club_id, 'access')
     OR (
       NOT public.member_access_blocked(_user_id, _club_id, NULL)
       AND EXISTS (
         SELECT 1 FROM public.clubs c
         WHERE c.id = _club_id
           AND c.door_show_on_dashboard
           AND public.is_club_member(_user_id, _club_id)
           AND public.member_in_permission_roles(_user_id, _club_id, c.door_dashboard_role_ids)
       )
     );
$function$;

CREATE OR REPLACE FUNCTION public.guard_suspended_member_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.club_id IS NULL OR COALESCE(NEW.booking_type,'') IN ('ops','event','blocked') OR NEW.event_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND public.is_club_admin(auth.uid(), NEW.club_id) THEN
    RETURN NEW;
  END IF;
  IF (NEW.club_member_id IS NOT NULL AND public.member_access_blocked(NULL, NEW.club_id, NEW.club_member_id))
     OR (NEW.club_member_id IS NULL AND NEW.user_id IS NOT NULL AND public.member_access_blocked(NEW.user_id, NEW.club_id, NULL)) THEN
    RAISE EXCEPTION 'Your membership is suspended — court bookings are not available. Please contact the club committee.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_suspended_member_booking ON public.bookings;
CREATE TRIGGER trg_guard_suspended_member_booking
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_suspended_member_booking();

CREATE OR REPLACE FUNCTION public.admin_set_member_standing(_member_id uuid, _status text, _rule text DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; txt text;
BEGIN
  IF _status NOT IN ('active','suspended','resigned') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  SELECT * INTO m FROM public.club_members WHERE id = _member_id;
  IF m IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT public.is_club_admin_or_permitted(auth.uid(), m.club_id, 'members') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  txt := NULLIF(trim(concat_ws(' — ', NULLIF(trim(coalesce(_rule,'')),''), NULLIF(trim(coalesce(_reason,'')),''))), '');

  IF _status = 'suspended' THEN
    UPDATE public.club_members SET status = 'suspended', suspension_manual = true,
      suspension_status = 'manual_hold', suspension_reason = coalesce(txt, 'Suspended by club committee'),
      suspended_at = now()
    WHERE id = _member_id;
  ELSIF _status = 'resigned' THEN
    UPDATE public.club_members SET status = 'resigned' WHERE id = _member_id;
  ELSE
    UPDATE public.club_members SET status = 'active', suspension_manual = false,
      suspension_status = 'active', suspension_reason = NULL, suspended_at = NULL
    WHERE id = _member_id;
  END IF;

  INSERT INTO public.member_suspension_log(club_id, club_member_id, previous_status, new_status, reason, changed_by, automatic)
  VALUES (m.club_id, _member_id, m.suspension_status,
          CASE WHEN _status='suspended' THEN 'manual_hold'::member_suspension_status
               WHEN _status='active' THEN 'active'::member_suspension_status
               ELSE m.suspension_status END,
          concat('[', _status, '] ', coalesce(txt,'')), auth.uid(), false);

  RETURN jsonb_build_object('ok', true, 'club_id', m.club_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_member_standing(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_member_standing(uuid, text, text, text) TO authenticated;

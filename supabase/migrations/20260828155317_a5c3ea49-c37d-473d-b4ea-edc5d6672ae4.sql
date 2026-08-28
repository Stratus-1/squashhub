CREATE OR REPLACE FUNCTION public.notify_club_admins_of_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_pending_approval THEN
    INSERT INTO public.notifications (user_id, type, title, message, url)
    SELECT cm.user_id, 'membership_application',
           'New membership application',
           COALESCE(NEW.name, 'A new applicant') || ' has applied to join the club.',
           '/club-admin?tab=members&filter=pending'
    FROM public.club_members cm
    WHERE cm.club_id = NEW.club_id
      AND cm.role = 'admin'
      AND cm.user_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_membership_application(_member_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
  v_user uuid;
  v_name text;
BEGIN
  SELECT club_id, user_id, name INTO v_club, v_user, v_name
  FROM public.club_members WHERE id = _member_id;

  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  IF NOT public.is_club_admin(auth.uid(), v_club) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  IF _approve THEN
    UPDATE public.club_members
       SET is_pending_approval = false,
           approved_at = now(),
           approved_by = auth.uid()
     WHERE id = _member_id;

    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, url)
      VALUES (v_user, 'membership_approved', 'Membership approved',
              'Your club membership has been approved. Welcome aboard!', '/');
    END IF;
  ELSE
    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, url)
      VALUES (v_user, 'membership_declined', 'Membership application declined',
              'Your membership application was not approved. Please contact the club for details.', '/');
    END IF;
    DELETE FROM public.club_members WHERE id = _member_id AND is_pending_approval = true;
  END IF;
END;
$$;
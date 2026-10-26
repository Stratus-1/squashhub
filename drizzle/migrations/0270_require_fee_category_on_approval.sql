CREATE OR REPLACE FUNCTION public.review_membership_application(_member_id uuid, _approve boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_club uuid; v_user uuid; v_name text; v_cat uuid;
BEGIN
  SELECT club_id, user_id, name, fee_category_id INTO v_club, v_user, v_name, v_cat
  FROM public.club_members WHERE id = _member_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT (public.is_club_admin(auth.uid(), v_club)
          OR public.has_club_permission(auth.uid(), v_club, 'members')) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF _approve THEN
    IF v_cat IS NULL AND EXISTS (SELECT 1 FROM public.member_fee_categories WHERE club_id = v_club) THEN
      RAISE EXCEPTION 'Choose a membership fee category before approving';
    END IF;
    UPDATE public.club_members SET is_pending_approval = false, approved_at = now(), approved_by = auth.uid()
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
$function$;
CREATE OR REPLACE FUNCTION public.family_activate_approved(_family_member_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.club_family_members%ROWTYPE;
  v_group public.club_family_groups%ROWTYPE;
  v_member public.club_members%ROWTYPE;
  v_primary public.club_members%ROWTYPE;
  v_cat public.member_fee_categories%ROWTYPE;
  v_add_cat public.member_fee_categories%ROWTYPE;
  v_year int := EXTRACT(year FROM now())::int;
  v_amount numeric;
  v_months int;
BEGIN
  SELECT * INTO v_row FROM public.club_family_members WHERE id = _family_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_row.status <> 'invited' THEN RAISE EXCEPTION 'This request is no longer pending'; END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = v_row.club_member_id;
  IF v_row.approval_status <> 'approved' OR v_row.accepted_at IS NULL THEN
    RAISE EXCEPTION 'Family addition needs acceptance and admin approval';
  END IF;
  SELECT * INTO v_group FROM public.club_family_groups WHERE id = v_row.family_group_id;
  SELECT * INTO v_primary FROM public.club_members WHERE id = v_group.primary_member_id;
  SELECT * INTO v_cat FROM public.member_fee_categories WHERE id = v_primary.fee_category_id;
  IF NOT FOUND OR COALESCE(v_cat.family_role,'') <> 'primary' THEN
    RAISE EXCEPTION 'The family package is no longer active';
  END IF;
  SELECT * INTO v_add_cat FROM public.member_fee_categories WHERE id = v_cat.family_additional_category_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club has not set an Additional Family Member category'; END IF;

  UPDATE public.club_family_members
     SET status = 'active', confirmed_at = now(), updated_at = now()
   WHERE id = _family_member_id;

  IF v_row.is_new_member THEN
    UPDATE public.club_members SET is_pending_approval=false, approved_at=v_row.approved_at, approved_by=v_row.approved_by WHERE id=v_member.id;
  END IF;

  UPDATE public.club_members SET fee_category_id = v_add_cat.id, updated_at = now()
   WHERE id = v_member.id;

  v_amount := COALESCE(v_add_cat.annual_fee, 0);
  IF COALESCE(v_add_cat.pro_rate, false) AND v_amount > 0 THEN
    v_months := GREATEST(1, 12 - EXTRACT(month FROM now())::int + 1);
    v_amount := round(v_amount * v_months / 12.0, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_member_fee_payments f
     WHERE f.club_member_id = v_member.id AND f.fee_type = 'club' AND f.season_year = v_year
  ) THEN
    INSERT INTO public.club_member_fee_payments
      (club_member_id, fee_type, fee_label, amount, paid, season_year, paid_by_member_id, family_group_id)
    VALUES (v_member.id, 'club', 'Club – Additional Family Member', v_amount, false, v_year,
            v_primary.id, v_group.id);
  ELSE
    UPDATE public.club_member_fee_payments
       SET paid_by_member_id = v_primary.id, family_group_id = v_group.id
     WHERE club_member_id = v_member.id AND fee_type = 'club' AND season_year = v_year AND paid = false;
  END IF;

  INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url)
  VALUES (v_primary.user_id, v_primary.id, 'Family package request accepted',
          COALESCE(v_member.name,'That member') || ' accepted and is now on your family package.',
          'general', '/my-account');

  RETURN true;
END;
$function$


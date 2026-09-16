CREATE OR REPLACE FUNCTION public.family_add_member(_primary_member_id uuid, _existing_member_id uuid DEFAULT NULL::uuid, _name text DEFAULT NULL::text, _email text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _relationship text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_primary public.club_members%ROWTYPE;
  v_cat public.member_fee_categories%ROWTYPE;
  v_add_cat public.member_fee_categories%ROWTYPE;
  v_group public.club_family_groups%ROWTYPE;
  v_year int := EXTRACT(year FROM now())::int;
  v_member_id uuid;
  v_count int;
  v_row_id uuid;
  v_amount numeric;
  v_months int;
  v_target public.club_members%ROWTYPE;
BEGIN
  SELECT * INTO v_primary FROM public.club_members WHERE id = _primary_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Primary member not found'; END IF;

  IF NOT (v_primary.user_id = auth.uid() OR public.is_club_admin(auth.uid(), v_primary.club_id)) THEN
    RAISE EXCEPTION 'Not allowed to manage this family';
  END IF;

  SELECT * INTO v_cat FROM public.member_fee_categories WHERE id = v_primary.fee_category_id;
  IF NOT FOUND OR COALESCE(v_cat.family_role,'') <> 'primary' THEN
    RAISE EXCEPTION 'This member is not on a Family Package';
  END IF;

  SELECT * INTO v_add_cat FROM public.member_fee_categories
   WHERE id = v_cat.family_additional_category_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club has not set an Additional Family Member category'; END IF;

  SELECT * INTO v_group FROM public.club_family_groups
   WHERE club_id = v_primary.club_id AND primary_member_id = _primary_member_id AND season_year = v_year;
  IF NOT FOUND THEN
    INSERT INTO public.club_family_groups (club_id, primary_member_id, season_year)
    VALUES (v_primary.club_id, _primary_member_id, v_year)
    RETURNING * INTO v_group;
  END IF;

  SELECT count(*) INTO v_count FROM public.club_family_members
   WHERE family_group_id = v_group.id AND status <> 'removed';
  IF v_cat.family_max_additional IS NOT NULL AND v_count >= v_cat.family_max_additional THEN
    RAISE EXCEPTION 'This family package already includes % additional members', v_cat.family_max_additional;
  END IF;

  IF _existing_member_id IS NOT NULL THEN
    SELECT id INTO v_member_id FROM public.club_members
     WHERE id = _existing_member_id AND club_id = v_primary.club_id;
    IF v_member_id IS NULL THEN RAISE EXCEPTION 'Member not found in this club'; END IF;
  ELSE
    IF COALESCE(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
    INSERT INTO public.club_members (club_id, name, email, phone, role, fee_category_id)
    VALUES (v_primary.club_id, trim(_name), NULLIF(trim(_email),''), NULLIF(trim(_phone),''), 'member', v_add_cat.id)
    RETURNING id INTO v_member_id;
  END IF;

  IF v_member_id = _primary_member_id THEN RAISE EXCEPTION 'The primary member is already on the package'; END IF;

  IF EXISTS (SELECT 1 FROM public.club_family_members WHERE club_member_id = v_member_id AND status <> 'removed') THEN
    RAISE EXCEPTION 'That person is already linked to a family package';
  END IF;

  INSERT INTO public.club_family_members (family_group_id, club_member_id, relationship, status, confirmed_at)
  VALUES (v_group.id, v_member_id, NULLIF(trim(_relationship),''),
          CASE WHEN _existing_member_id IS NULL THEN 'active' ELSE 'invited' END,
          CASE WHEN _existing_member_id IS NULL THEN now() ELSE NULL END)
  RETURNING id INTO v_row_id;

  -- An existing member is only INVITED: nothing on their account changes until
  -- they accept. Notify them and stop here.
  IF _existing_member_id IS NOT NULL THEN
    SELECT * INTO v_target FROM public.club_members WHERE id = v_member_id;
    INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url)
    VALUES (v_target.user_id, v_member_id,
            'Family package request',
            COALESCE(v_primary.name,'A member') || ' would like to add you to their family package and pay your club fee. Open My Account to accept or decline.',
            'general', '/my-account');
    RETURN v_row_id;
  END IF;

  UPDATE public.club_members SET fee_category_id = v_add_cat.id, updated_at = now()
   WHERE id = v_member_id;

  v_amount := COALESCE(v_add_cat.annual_fee, 0);
  IF COALESCE(v_add_cat.pro_rate, false) AND v_amount > 0 THEN
    v_months := GREATEST(1, 12 - EXTRACT(month FROM now())::int + 1);
    v_amount := round(v_amount * v_months / 12.0, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_member_fee_payments f
     WHERE f.club_member_id = v_member_id AND f.fee_type = 'club' AND f.season_year = v_year
  ) THEN
    INSERT INTO public.club_member_fee_payments
      (club_member_id, fee_type, fee_label, amount, paid, season_year, paid_by_member_id, family_group_id)
    VALUES (v_member_id, 'club', 'Club – Additional Family Member', v_amount, false, v_year,
            _primary_member_id, v_group.id);
  ELSE
    UPDATE public.club_member_fee_payments
       SET paid_by_member_id = _primary_member_id, family_group_id = v_group.id
     WHERE club_member_id = v_member_id AND fee_type = 'club' AND season_year = v_year AND paid = false;
  END IF;

  RETURN v_row_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.family_respond_invite(_family_member_id uuid, _accept boolean)
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
  IF NOT (v_member.user_id = auth.uid() OR public.is_club_admin(auth.uid(), v_member.club_id)) THEN
    RAISE EXCEPTION 'Only the invited member can respond to this request';
  END IF;

  SELECT * INTO v_group FROM public.club_family_groups WHERE id = v_row.family_group_id;
  SELECT * INTO v_primary FROM public.club_members WHERE id = v_group.primary_member_id;

  IF NOT _accept THEN
    UPDATE public.club_family_members
       SET status = 'removed', removed_at = now(), updated_at = now()
     WHERE id = _family_member_id;
    INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url)
    VALUES (v_primary.user_id, v_primary.id, 'Family package request declined',
            COALESCE(v_member.name,'That member') || ' declined to join your family package.',
            'general', '/my-account');
    RETURN false;
  END IF;

  SELECT * INTO v_cat FROM public.member_fee_categories WHERE id = v_primary.fee_category_id;
  IF NOT FOUND OR COALESCE(v_cat.family_role,'') <> 'primary' THEN
    RAISE EXCEPTION 'The family package is no longer active';
  END IF;
  SELECT * INTO v_add_cat FROM public.member_fee_categories WHERE id = v_cat.family_additional_category_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club has not set an Additional Family Member category'; END IF;

  UPDATE public.club_family_members
     SET status = 'active', confirmed_at = now(), updated_at = now()
   WHERE id = _family_member_id;

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
$function$;

GRANT EXECUTE ON FUNCTION public.family_respond_invite(uuid, boolean) TO authenticated;
drop function if exists public.family_add_member(uuid,uuid,text,text,text,text);

create function public.family_add_member(_primary_member_id uuid, _existing_member_id uuid, _name text, _email text, _phone text, _relationship text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  v_total numeric;
  v_needed numeric;
  v_cap numeric;
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

  -- If the family grew past what the primary's active monthly card payment
  -- covers, notify the primary once so they can approve the higher amount.
  SELECT count(*) INTO v_count FROM public.club_family_members
   WHERE family_group_id = v_group.id AND status <> 'removed' AND club_member_id <> _primary_member_id;
  v_total := COALESCE(v_cat.annual_fee, 0) + COALESCE(v_add_cat.annual_fee, 0) * v_count;
  v_needed := round(v_total / 12.0, 2);

  SELECT max(m.max_amount_cents / 100.0) INTO v_cap
    FROM public.stitch_mandates m
   WHERE m.club_member_id = _primary_member_id AND m.status = 'active';

  IF v_cap IS NOT NULL AND v_needed > v_cap + 0.01 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.club_member_id = _primary_member_id
         AND n.type = 'mandate_increase'
         AND n.read = false
    ) THEN
      INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url)
      VALUES (v_primary.user_id, _primary_member_id,
              'Increase your monthly card payment',
              'Your family fees grew to R' || to_char(v_total, 'FM999990.00') || ' for the season, which needs R' || to_char(v_needed, 'FM999990.00') || ' per month, but your monthly card payment is capped at R' || to_char(v_cap, 'FM999990.00') || '. Open My Account and tap "Increase monthly payment" to approve the new amount once — everything after that runs automatically.',
              'mandate_increase', '/my-account');
    END IF;
  END IF;

  RETURN v_row_id;
END;
$function$;
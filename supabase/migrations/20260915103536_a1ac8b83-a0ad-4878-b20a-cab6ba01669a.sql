
-- 1. Fee category family settings -------------------------------------------
ALTER TABLE public.member_fee_categories
  ADD COLUMN IF NOT EXISTS family_role text,
  ADD COLUMN IF NOT EXISTS family_max_additional integer,
  ADD COLUMN IF NOT EXISTS family_allowed_relationships text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS family_dependent_max_age integer,
  ADD COLUMN IF NOT EXISTS family_additional_category_id uuid REFERENCES public.member_fee_categories(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.member_fee_categories
    ADD CONSTRAINT member_fee_categories_family_role_check
    CHECK (family_role IS NULL OR family_role IN ('primary','additional'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Family groups -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_family_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  primary_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  season_year integer NOT NULL DEFAULT EXTRACT(year FROM now())::int,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_family_groups_status_check CHECK (status IN ('active','closed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS club_family_groups_primary_season_idx
  ON public.club_family_groups (club_id, primary_member_id, season_year);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_family_groups TO authenticated;
GRANT ALL ON public.club_family_groups TO service_role;
ALTER TABLE public.club_family_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view family groups in their club"
  ON public.club_family_groups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = club_family_groups.club_id AND m.user_id = auth.uid()));

CREATE POLICY "Club admins manage family groups"
  ON public.club_family_groups FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

-- 3. Family members ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_group_id uuid NOT NULL REFERENCES public.club_family_groups(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  relationship text,
  status text NOT NULL DEFAULT 'invited',
  invited_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  removed_at timestamptz,
  pending_standard_category_id uuid REFERENCES public.member_fee_categories(id) ON DELETE SET NULL,
  pending_change_status text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_family_members_status_check CHECK (status IN ('invited','active','removed')),
  CONSTRAINT club_family_members_change_check CHECK (pending_change_status IN ('none','pending','approved','rejected'))
);
CREATE UNIQUE INDEX IF NOT EXISTS club_family_members_active_idx
  ON public.club_family_members (club_member_id)
  WHERE status <> 'removed';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_family_members TO authenticated;
GRANT ALL ON public.club_family_members TO service_role;
ALTER TABLE public.club_family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view family members in their club"
  ON public.club_family_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_family_groups g
    JOIN public.club_members m ON m.club_id = g.club_id AND m.user_id = auth.uid()
    WHERE g.id = club_family_members.family_group_id));

CREATE POLICY "Club admins manage family members"
  ON public.club_family_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_family_groups g WHERE g.id = club_family_members.family_group_id AND public.is_club_admin(auth.uid(), g.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_family_groups g WHERE g.id = club_family_members.family_group_id AND public.is_club_admin(auth.uid(), g.club_id)));

CREATE POLICY "Family member can accept or decline own invite"
  ON public.club_family_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = club_family_members.club_member_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = club_family_members.club_member_id AND m.user_id = auth.uid()));

CREATE TRIGGER update_club_family_groups_updated_at BEFORE UPDATE ON public.club_family_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_club_family_members_updated_at BEFORE UPDATE ON public.club_family_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Payer attribution on member fees ----------------------------------------
ALTER TABLE public.club_member_fee_payments
  ADD COLUMN IF NOT EXISTS paid_by_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS family_group_id uuid REFERENCES public.club_family_groups(id) ON DELETE SET NULL;

-- 5. Helper: may the caller manage this family? ------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_family_group(_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_family_groups g
    LEFT JOIN public.club_members pm ON pm.id = g.primary_member_id
    WHERE g.id = _group_id
      AND (pm.user_id = auth.uid() OR public.is_club_admin(auth.uid(), g.club_id))
  );
$$;

-- 6. Add a family member ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.family_add_member(
  _primary_member_id uuid,
  _existing_member_id uuid DEFAULT NULL,
  _name text DEFAULT NULL,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _relationship text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  UPDATE public.club_members SET fee_category_id = v_add_cat.id, updated_at = now()
   WHERE id = v_member_id;

  -- Additional-member charge on that person's own account, payer recorded.
  -- R0 categories still get a zero-value line for auditability.
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
$$;

-- 7. Remove a family member --------------------------------------------------
CREATE OR REPLACE FUNCTION public.family_remove_member(
  _family_member_id uuid,
  _standard_category_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.club_family_members%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.club_family_members WHERE id = _family_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Family member not found'; END IF;
  IF NOT public.can_manage_family_group(v_row.family_group_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this family';
  END IF;

  UPDATE public.club_family_members
     SET status = 'removed', removed_at = now(),
         pending_standard_category_id = _standard_category_id,
         pending_change_status = 'pending'
   WHERE id = _family_member_id;

  -- Unpaid future charges stop being the primary's responsibility.
  UPDATE public.club_member_fee_payments
     SET paid_by_member_id = NULL
   WHERE club_member_id = v_row.club_member_id AND paid = false AND family_group_id = v_row.family_group_id;
END;
$$;

-- 8. Admin approves the conversion back to a standard category ---------------
CREATE OR REPLACE FUNCTION public.family_resolve_category_change(
  _family_member_id uuid,
  _approve boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.club_family_members%ROWTYPE;
  v_club uuid;
BEGIN
  SELECT * INTO v_row FROM public.club_family_members WHERE id = _family_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Family member not found'; END IF;
  SELECT club_id INTO v_club FROM public.club_family_groups WHERE id = v_row.family_group_id;
  IF NOT public.is_club_admin(auth.uid(), v_club) THEN
    RAISE EXCEPTION 'Only a club admin can approve this change';
  END IF;

  IF _approve AND v_row.pending_standard_category_id IS NOT NULL THEN
    UPDATE public.club_members
       SET fee_category_id = v_row.pending_standard_category_id, updated_at = now()
     WHERE id = v_row.club_member_id;
  END IF;

  UPDATE public.club_family_members
     SET pending_change_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END
   WHERE id = _family_member_id;
END;
$$;

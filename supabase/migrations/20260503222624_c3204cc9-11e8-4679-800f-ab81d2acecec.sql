DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'club_members'
      AND policyname = 'Platform admins can view all club members'
  ) THEN
    CREATE POLICY "Platform admins can view all club members"
    ON public.club_members
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_associations'
      AND policyname = 'Platform admins can view all league associations'
  ) THEN
    CREATE POLICY "Platform admins can view all league associations"
    ON public.league_associations
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_association_affiliations'
      AND policyname = 'Platform admins can view all member affiliations'
  ) THEN
    CREATE POLICY "Platform admins can view all member affiliations"
    ON public.member_association_affiliations
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'club_member_fee_payments'
      AND policyname = 'Platform admins can view all club member fee payments'
  ) THEN
    CREATE POLICY "Platform admins can view all club member fee payments"
    ON public.club_member_fee_payments
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END
$$;
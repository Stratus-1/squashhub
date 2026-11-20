-- Clubs whose journal the signed-in user may read (same predicates as the previous per-row SELECT policies).
CREATE OR REPLACE FUNCTION public.journal_read_club_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  IF public.has_role(_uid, 'admin'::public.app_role) OR public.has_role(_uid, 'moderator'::public.app_role) THEN
    RETURN QUERY SELECT c.id FROM public.clubs c;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT DISTINCT cm.club_id
  FROM public.club_members cm
  WHERE cm.user_id = _uid
    AND cm.club_id IS NOT NULL
    AND (
      public.is_club_admin(_uid, cm.club_id)
      OR public.is_club_admin_or_permitted(_uid, cm.club_id, 'finance')
      OR public.is_club_finance_writer(_uid, cm.club_id)
      OR public.is_club_chairman(_uid, cm.club_id)
      OR public.nsc_treasurer_domain_access(_uid, cm.club_id, 'finance')
    );
END $function$;

-- The signed-in user's own member records (for "members read their own journal lines").
CREATE OR REPLACE FUNCTION public.my_club_member_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT cm.id FROM public.club_members cm WHERE auth.uid() IS NOT NULL AND cm.user_id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.journal_read_club_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_club_member_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.journal_read_club_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_club_member_ids() TO authenticated, service_role;

-- Replace the per-row SELECT policies with one set-based policy (same readers).
DROP POLICY IF EXISTS "Club admins can read journal entries" ON public.club_journal_entries;
DROP POLICY IF EXISTS "Members can read own journal entries" ON public.club_journal_entries;
DROP POLICY IF EXISTS "Finance staff view club journal entries" ON public.club_journal_entries;
DROP POLICY IF EXISTS "NSC treasurer reads journal" ON public.club_journal_entries;
DROP POLICY IF EXISTS "Chairman views club journal" ON public.club_journal_entries;

CREATE POLICY "Journal readers view club journal entries"
  ON public.club_journal_entries FOR SELECT TO authenticated
  USING (
    club_id IN (SELECT public.journal_read_club_ids())
    OR club_member_id IN (SELECT public.my_club_member_ids())
  );

-- Platform admins: same rule, evaluated once per statement.
DROP POLICY IF EXISTS "Super admins manage journal entries" ON public.club_journal_entries;
CREATE POLICY "Super admins manage journal entries"
  ON public.club_journal_entries FOR ALL TO public
  USING ((SELECT public.has_role(auth.uid(), 'admin'::public.app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::public.app_role)));

-- Finance writers: same write rules; reading is covered by the policy above.
DROP POLICY IF EXISTS "Finance staff manage club_journal_entries" ON public.club_journal_entries;
CREATE POLICY "Finance staff insert club_journal_entries"
  ON public.club_journal_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_club_finance_writer(auth.uid(), club_id));
CREATE POLICY "Finance staff update club_journal_entries"
  ON public.club_journal_entries FOR UPDATE TO authenticated
  USING (public.is_club_finance_writer(auth.uid(), club_id))
  WITH CHECK (public.is_club_finance_writer(auth.uid(), club_id));
CREATE POLICY "Finance staff delete club_journal_entries"
  ON public.club_journal_entries FOR DELETE TO authenticated
  USING (public.is_club_finance_writer(auth.uid(), club_id));

-- Supports newest-first ledger paging.
CREATE INDEX IF NOT EXISTS idx_journal_club_created ON public.club_journal_entries (club_id, created_at DESC, id);
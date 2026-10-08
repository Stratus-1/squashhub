CREATE OR REPLACE FUNCTION public.admin_resolve_duplicate_member(
  _source_id uuid,
  _target_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  t record;
  f record;
  jr uuid;
  moved_login boolean := false;
  cleared_fees int := 0;
BEGIN
  IF _source_id = _target_id THEN
    RAISE EXCEPTION 'Source and target must be different members';
  END IF;

  SELECT * INTO s FROM public.club_members WHERE id = _source_id;
  IF s IS NULL THEN RAISE EXCEPTION 'Duplicate member not found'; END IF;
  SELECT * INTO t FROM public.club_members WHERE id = _target_id;
  IF t IS NULL THEN RAISE EXCEPTION 'Target member not found'; END IF;
  IF s.club_id <> t.club_id THEN
    RAISE EXCEPTION 'Both members must belong to the same club';
  END IF;
  IF NOT public.is_club_admin_or_permitted(auth.uid(), s.club_id, 'members') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF s.user_id IS NOT NULL THEN
    UPDATE public.club_members SET user_id = s.user_id WHERE id = t.id;
    moved_login := true;
  END IF;

  UPDATE public.club_members SET
    email      = CASE WHEN NULLIF(trim(coalesce(email, '')), '') IS NULL THEN s.email ELSE email END,
    phone      = CASE WHEN NULLIF(trim(coalesce(phone, '')), '') IS NULL THEN s.phone ELSE phone END,
    id_number  = CASE WHEN NULLIF(trim(coalesce(id_number, '')), '') IS NULL THEN s.id_number ELSE id_number END,
    avatar_url = CASE WHEN NULLIF(trim(coalesce(avatar_url, '')), '') IS NULL THEN s.avatar_url ELSE avatar_url END,
    person_id  = coalesce(person_id, s.person_id),
    updated_at = now()
  WHERE id = t.id;

  FOR f IN
    SELECT * FROM public.club_member_fee_payments
    WHERE club_member_id = s.id AND paid = false
  LOOP
    IF EXISTS (SELECT 1 FROM public.club_journal_entries WHERE fee_payment_id = f.id AND reverses_journal_ref IS NULL) THEN
      jr := gen_random_uuid();
      INSERT INTO public.club_journal_entries
        (club_id, journal_ref, account, debit, credit, description, club_member_id, fee_payment_id, reverses_journal_ref, custom_account_id)
      SELECT j.club_id, jr, j.account, j.credit, j.debit,
             'Reversal: duplicate member merge — ' || j.description,
             j.club_member_id, j.fee_payment_id, j.journal_ref, j.custom_account_id
      FROM public.club_journal_entries j
      WHERE j.fee_payment_id = f.id AND j.reverses_journal_ref IS NULL;
    END IF;
    DELETE FROM public.club_member_fee_payments WHERE id = f.id;
    cleared_fees := cleared_fees + 1;
  END LOOP;

  UPDATE public.club_members SET
    status = 'resigned',
    user_id = NULL,
    is_pending_approval = false,
    suspension_reason = concat('Merged into ', coalesce(t.club_member_number::text, t.name), ' (duplicate resolved)',
                               CASE WHEN NULLIF(trim(coalesce(_reason, '')), '') IS NOT NULL THEN ' — ' || trim(_reason) ELSE '' END),
    updated_at = now()
  WHERE id = s.id;

  INSERT INTO public.audit_events
    (club_id, actor_user_id, entity_type, entity_id, action, reason, before_data, after_data)
  VALUES
    (s.club_id, auth.uid(), 'club_member', s.id, 'resolve_duplicate_merge',
     _reason,
     jsonb_build_object('source', jsonb_build_object('id', s.id, 'name', s.name, 'number', s.club_member_number, 'user_id', s.user_id, 'email', s.email),
                        'target', jsonb_build_object('id', t.id, 'name', t.name, 'number', t.club_member_number)),
     jsonb_build_object('moved_login', moved_login, 'cleared_unpaid_fees', cleared_fees, 'source_status', 'resigned'));

  RETURN jsonb_build_object('ok', true, 'club_id', s.club_id,
                            'moved_login', moved_login,
                            'cleared_unpaid_fees', cleared_fees);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_duplicate_member(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_duplicate_member(uuid, uuid, text) TO authenticated;
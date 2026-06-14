
-- 1. Track reversals
ALTER TABLE public.club_journal_entries
  ADD COLUMN IF NOT EXISTS reverses_journal_ref uuid NULL;

CREATE INDEX IF NOT EXISTS idx_journal_reverses_ref
  ON public.club_journal_entries(reverses_journal_ref)
  WHERE reverses_journal_ref IS NOT NULL;

-- 2. Audit log
CREATE TABLE IF NOT EXISTS public.ledger_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  journal_ref uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('edit','reverse','delete','create')),
  actor_user_id uuid,
  before_json jsonb,
  after_json jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ledger_audit_log TO authenticated;
GRANT ALL ON public.ledger_audit_log TO service_role;

ALTER TABLE public.ledger_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club admins can read ledger audit" ON public.ledger_audit_log;
CREATE POLICY "Club admins can read ledger audit"
ON public.ledger_audit_log FOR SELECT
TO authenticated
USING (public.is_club_admin(auth.uid(), club_id));

-- (Writes happen only via SECURITY DEFINER RPC; no INSERT policy for users.)

CREATE INDEX IF NOT EXISTS idx_audit_club_ref
  ON public.ledger_audit_log(club_id, journal_ref);

-- 3. RPC: delete a balanced journal group + linked fee row (if any)
CREATE OR REPLACE FUNCTION public.admin_delete_journal_group(
  _journal_ref uuid,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club_id uuid;
  _before jsonb;
  _fee_payment_ids uuid[];
BEGIN
  SELECT club_id INTO _club_id
  FROM public.club_journal_entries
  WHERE journal_ref = _journal_ref
  LIMIT 1;

  IF _club_id IS NULL THEN
    RAISE EXCEPTION 'Journal group not found';
  END IF;

  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- Snapshot
  SELECT jsonb_agg(to_jsonb(j))
  INTO _before
  FROM public.club_journal_entries j
  WHERE j.journal_ref = _journal_ref;

  -- Collect linked fee payments
  SELECT array_agg(DISTINCT fee_payment_id)
  INTO _fee_payment_ids
  FROM public.club_journal_entries
  WHERE journal_ref = _journal_ref AND fee_payment_id IS NOT NULL;

  -- Delete the journal group
  DELETE FROM public.club_journal_entries WHERE journal_ref = _journal_ref;

  -- Delete linked unpaid fee rows (only if they have no other journal refs)
  IF _fee_payment_ids IS NOT NULL THEN
    DELETE FROM public.club_member_fee_payments f
    WHERE f.id = ANY(_fee_payment_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.club_journal_entries j2
        WHERE j2.fee_payment_id = f.id
      );
  END IF;

  -- Audit
  INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, before_json, after_json, note)
  VALUES (_club_id, _journal_ref, 'delete', auth.uid(), _before, NULL, _note);

  RETURN jsonb_build_object('ok', true, 'journal_ref', _journal_ref);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_journal_group(uuid, text) TO authenticated;

-- 4. RPC: post a reversal of a journal group
CREATE OR REPLACE FUNCTION public.admin_reverse_journal_group(
  _journal_ref uuid,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club_id uuid;
  _new_ref uuid := gen_random_uuid();
  _exists_reversal boolean;
BEGIN
  SELECT club_id INTO _club_id
  FROM public.club_journal_entries
  WHERE journal_ref = _journal_ref
  LIMIT 1;

  IF _club_id IS NULL THEN
    RAISE EXCEPTION 'Journal group not found';
  END IF;

  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.club_journal_entries
    WHERE reverses_journal_ref = _journal_ref
  ) INTO _exists_reversal;

  IF _exists_reversal THEN
    RAISE EXCEPTION 'This entry has already been reversed';
  END IF;

  INSERT INTO public.club_journal_entries(
    club_id, journal_ref, account, debit, credit, description,
    club_member_id, fee_payment_id, transaction_id, reverses_journal_ref, created_at
  )
  SELECT
    club_id, _new_ref, account,
    credit AS debit,  -- swap
    debit AS credit,
    'Reversal: ' || description || COALESCE(' (' || _note || ')', ''),
    club_member_id, NULL, NULL, _journal_ref, now()
  FROM public.club_journal_entries
  WHERE journal_ref = _journal_ref;

  INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, note)
  VALUES (_club_id, _journal_ref, 'reverse', auth.uid(), _note);

  RETURN jsonb_build_object('ok', true, 'new_journal_ref', _new_ref);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reverse_journal_group(uuid, text) TO authenticated;

-- 5. RPC: bill a member for an ad-hoc fee (Dr Debtors / Cr Income) + create fee row
CREATE OR REPLACE FUNCTION public.admin_bill_member_fee(
  _club_member_id uuid,
  _amount numeric,
  _fee_label text,
  _income_account text,
  _fee_type text DEFAULT 'club',
  _date timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club_id uuid;
  _ref uuid := gen_random_uuid();
  _fee_id uuid;
  _desc text;
BEGIN
  SELECT club_id INTO _club_id FROM public.club_members WHERE id = _club_member_id;
  IF _club_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be > 0';
  END IF;

  IF _income_account NOT IN ('membership_income','league_fees_income','national_body_income','tournament_income','light_fees_income','fee_income','bar_income') THEN
    RAISE EXCEPTION 'Invalid income account: %', _income_account;
  END IF;

  _desc := 'Fee raised: ' || _fee_label;

  -- Create fee row (best-effort; unique violation -> just skip the row, still post journal)
  BEGIN
    INSERT INTO public.club_member_fee_payments(
      club_member_id, fee_type, fee_label, amount, paid, season_year
    ) VALUES (
      _club_member_id, _fee_type, _fee_label, _amount, false,
      EXTRACT(year FROM _date)::int
    )
    RETURNING id INTO _fee_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO _fee_id FROM public.club_member_fee_payments
    WHERE club_member_id = _club_member_id
      AND fee_type = _fee_type
      AND fee_label = _fee_label
      AND season_year = EXTRACT(year FROM _date)::int;
  END;

  INSERT INTO public.club_journal_entries(
    club_id, journal_ref, account, debit, credit, description,
    club_member_id, fee_payment_id, created_at
  ) VALUES
    (_club_id, _ref, 'debtors',        _amount, 0, _desc, _club_member_id, _fee_id, _date),
    (_club_id, _ref, _income_account::gl_account, 0, _amount, _desc, _club_member_id, _fee_id, _date);

  INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, after_json, note)
  VALUES (_club_id, _ref, 'create', auth.uid(),
    jsonb_build_object('member_id', _club_member_id, 'amount', _amount, 'label', _fee_label, 'income', _income_account),
    'Manual bill via admin UI');

  RETURN jsonb_build_object('ok', true, 'journal_ref', _ref, 'fee_payment_id', _fee_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bill_member_fee(uuid, numeric, text, text, text, timestamptz) TO authenticated;

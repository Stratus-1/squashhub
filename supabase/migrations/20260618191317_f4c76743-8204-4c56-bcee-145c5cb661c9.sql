
-- Account delegation: a "delegate" can view & pay fees on behalf of a "grantor"
CREATE TABLE public.member_account_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  grantor_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  delegate_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'fees' CHECK (scope IN ('fees')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','declined','revoked')),
  requested_by_user_id uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delegation_distinct CHECK (grantor_member_id <> delegate_member_id)
);

-- One active/pending delegation per (grantor, delegate) pair
CREATE UNIQUE INDEX uniq_active_delegation
  ON public.member_account_delegations (grantor_member_id, delegate_member_id)
  WHERE status IN ('pending','active');

CREATE INDEX idx_delegations_delegate ON public.member_account_delegations (delegate_member_id, status);
CREATE INDEX idx_delegations_grantor  ON public.member_account_delegations (grantor_member_id, status);
CREATE INDEX idx_delegations_club     ON public.member_account_delegations (club_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_account_delegations TO authenticated;
GRANT ALL ON public.member_account_delegations TO service_role;

ALTER TABLE public.member_account_delegations ENABLE ROW LEVEL SECURITY;

-- Grantor or delegate (the auth user who owns either club_member row) can read their own delegations
CREATE POLICY "Grantor or delegate can view own delegations"
  ON public.member_account_delegations FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.club_members cm
            WHERE cm.id IN (grantor_member_id, delegate_member_id)
              AND cm.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Inserts are funneled through the request_account_delegation() RPC below.
-- Block direct inserts from clients to keep the verification flow authoritative.
CREATE POLICY "No direct inserts"
  ON public.member_account_delegations FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Delegate can accept/decline a pending request targeted at them
CREATE POLICY "Delegate can respond to pending"
  ON public.member_account_delegations FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (SELECT 1 FROM public.club_members cm
                WHERE cm.id = delegate_member_id AND cm.user_id = auth.uid())
  )
  WITH CHECK (status IN ('active','declined'));

-- Grantor (or admin) can revoke any of their delegations
CREATE POLICY "Grantor can revoke"
  ON public.member_account_delegations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.club_members cm
            WHERE cm.id = grantor_member_id AND cm.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (status IN ('revoked'));

CREATE TRIGGER trg_member_account_delegations_updated_at
  BEFORE UPDATE ON public.member_account_delegations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RPC: request_account_delegation
-- Caller (the GRANTOR) provides the delegate's member number + cell number.
-- Function verifies both match within the same club, then inserts a pending
-- delegation request. Enforces a cap of 5 active+pending delegations per delegate.
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_account_delegation(
  _grantor_member_id uuid,
  _delegate_member_number text,
  _delegate_cell text
)
RETURNS public.member_account_delegations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grantor public.club_members%ROWTYPE;
  v_delegate public.club_members%ROWTYPE;
  v_norm_cell text;
  v_active_count int;
  v_row public.member_account_delegations%ROWTYPE;
BEGIN
  -- Grantor must own this member row
  SELECT * INTO v_grantor FROM public.club_members
   WHERE id = _grantor_member_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to grant access for this member';
  END IF;

  v_norm_cell := regexp_replace(coalesce(_delegate_cell,''), '[^0-9]', '', 'g');
  IF length(v_norm_cell) < 9 THEN
    RAISE EXCEPTION 'Please enter a valid cell phone number';
  END IF;

  -- Match member # + cell in the same club
  SELECT * INTO v_delegate FROM public.club_members
   WHERE club_id = v_grantor.club_id
     AND lower(club_member_number) = lower(trim(_delegate_member_number))
     AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') LIKE '%' || v_norm_cell
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No member found with that member number and cell phone in your club';
  END IF;

  IF v_delegate.id = v_grantor.id THEN
    RAISE EXCEPTION 'You cannot delegate access to yourself';
  END IF;

  -- Cap: max 5 active/pending delegations the delegate is managing
  SELECT count(*) INTO v_active_count
    FROM public.member_account_delegations
   WHERE delegate_member_id = v_delegate.id
     AND status IN ('pending','active');
  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'This person already manages the maximum of 5 linked accounts';
  END IF;

  INSERT INTO public.member_account_delegations (
    club_id, grantor_member_id, delegate_member_id, scope, status, requested_by_user_id
  ) VALUES (
    v_grantor.club_id, v_grantor.id, v_delegate.id, 'fees', 'pending', auth.uid()
  )
  RETURNING * INTO v_row;

  -- Notify the delegate
  INSERT INTO public.notifications (user_id, club_id, type, title, body, data)
  VALUES (
    v_delegate.user_id, v_grantor.club_id, 'delegation_request',
    'Account access request',
    coalesce(v_grantor.name,'A club member') || ' wants you to manage and pay their account.',
    jsonb_build_object('delegation_id', v_row.id, 'grantor_member_id', v_grantor.id)
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_delegation(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_account_delegation(uuid, text, text) TO authenticated;

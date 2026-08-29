-- 1. Club claim requests -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_claim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL,
  requester_name text NOT NULL DEFAULT '',
  requester_email text,
  requester_phone text,
  claimed_role text NOT NULL DEFAULT 'other',
  note text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.club_claim_requests TO authenticated;
GRANT ALL ON public.club_claim_requests TO service_role;

ALTER TABLE public.club_claim_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requesters read own claims"
ON public.club_claim_requests FOR SELECT TO authenticated
USING (requester_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Requesters create own claims"
ON public.club_claim_requests FOR INSERT TO authenticated
WITH CHECK (requester_user_id = auth.uid());

CREATE POLICY "Platform admins manage claims"
ON public.club_claim_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE UNIQUE INDEX IF NOT EXISTS club_claim_requests_one_open
  ON public.club_claim_requests(club_id) WHERE status = 'pending';

CREATE TRIGGER club_claim_requests_updated_at
BEFORE UPDATE ON public.club_claim_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Public, PII-free club search for the registration flow ---------------
CREATE OR REPLACE FUNCTION public.search_registerable_clubs(_q text)
RETURNS TABLE (
  id uuid,
  name text,
  subdomain text,
  tenant_type text,
  region text,
  parent_association text,
  is_claimable boolean,
  claim_pending boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.subdomain,
    c.tenant_type,
    NULLIF(split_part(COALESCE(c.address, ''), ',', 1), '') AS region,
    (
      SELECT p.name FROM public.association_affiliated_clubs a
      JOIN public.clubs p ON p.id = a.association_tenant_id
      WHERE a.club_id = c.id
      LIMIT 1
    ) AS parent_association,
    NOT EXISTS (
      SELECT 1 FROM public.club_members m
      WHERE m.club_id = c.id AND m.role = 'admin'::public.club_member_role
    ) AS is_claimable,
    EXISTS (
      SELECT 1 FROM public.club_claim_requests r
      WHERE r.club_id = c.id AND r.status = 'pending'
    ) AS claim_pending
  FROM public.clubs c
  WHERE COALESCE(c.tenant_type, 'club') <> 'association'
    AND length(coalesce(_q, '')) >= 2
    AND (
      c.name ILIKE '%' || _q || '%'
      OR COALESCE(c.address, '') ILIKE '%' || _q || '%'
      OR COALESCE(c.subdomain, '') ILIKE '%' || _q || '%'
    )
  ORDER BY (c.name ILIKE _q || '%') DESC, c.name
  LIMIT 25;
$$;

GRANT EXECUTE ON FUNCTION public.search_registerable_clubs(text) TO anon, authenticated;

-- 3. Submit a claim -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_club_claim(
  _club_id uuid,
  _claimed_role text,
  _phone text,
  _note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _name text;
  _email text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.club_members m
    WHERE m.club_id = _club_id AND m.role = 'admin'::public.club_member_role
  ) THEN
    RAISE EXCEPTION 'This club already has an administrator. Please join as a member instead.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.club_claim_requests r
    WHERE r.club_id = _club_id AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A claim for this club is already under review.';
  END IF;

  SELECT p.name, p.email INTO _name, _email FROM public.profiles p WHERE p.id = _uid;

  INSERT INTO public.club_claim_requests (
    club_id, requester_user_id, requester_name, requester_email, requester_phone, claimed_role, note
  ) VALUES (
    _club_id, _uid, COALESCE(_name, ''), _email, _phone, COALESCE(NULLIF(_claimed_role, ''), 'other'), _note
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_club_claim(uuid, text, text, text) TO authenticated;

-- 4. Approve / reject -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_club_claim(_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.club_claim_requests%ROWTYPE;
  _member_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only platform admins can approve club claims';
  END IF;

  SELECT * INTO _r FROM public.club_claim_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR _r.status <> 'pending' THEN
    RAISE EXCEPTION 'Claim not found or already reviewed';
  END IF;

  SELECT id INTO _member_id FROM public.club_members
  WHERE club_id = _r.club_id AND user_id = _r.requester_user_id
  LIMIT 1;

  IF _member_id IS NULL THEN
    INSERT INTO public.club_members (club_id, user_id, role, name, email, phone)
    VALUES (_r.club_id, _r.requester_user_id, 'admin'::public.club_member_role,
            COALESCE(NULLIF(_r.requester_name, ''), 'Club Admin'), _r.requester_email, _r.requester_phone)
    RETURNING id INTO _member_id;
  ELSE
    UPDATE public.club_members SET role = 'admin'::public.club_member_role WHERE id = _member_id;
  END IF;

  UPDATE public.clubs
  SET club_captain_member_id = COALESCE(club_captain_member_id, _member_id)
  WHERE id = _r.club_id;

  UPDATE public.club_claim_requests
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = _request_id;

  INSERT INTO public.notifications (user_id, title, message, type, url)
  VALUES (_r.requester_user_id, 'Club claim approved',
          'You now have admin access to your club on SquashHub.',
          'club_claim_approved', '/club-admin');

  RETURN _member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_club_claim(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_club_claim(_request_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.club_claim_requests%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only platform admins can reject club claims';
  END IF;

  SELECT * INTO _r FROM public.club_claim_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR _r.status <> 'pending' THEN
    RAISE EXCEPTION 'Claim not found or already reviewed';
  END IF;

  UPDATE public.club_claim_requests
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = _reason
  WHERE id = _request_id;

  INSERT INTO public.notifications (user_id, title, message, type, url)
  VALUES (_r.requester_user_id, 'Club claim not approved',
          COALESCE(NULLIF(_reason, ''), 'Your club claim request was not approved.'),
          'club_claim_rejected', '/register-club');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_club_claim(uuid, text) TO authenticated;

-- 5. Automatic membership numbers ----------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS club_members_club_number_unique
  ON public.club_members(club_id, club_member_number)
  WHERE club_member_number IS NOT NULL AND club_member_number <> '';

CREATE OR REPLACE FUNCTION public.assign_club_member_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next text;
BEGIN
  IF NEW.club_member_number IS NOT NULL AND NEW.club_member_number <> '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.clubs
  SET member_number_prefix = upper(COALESCE(subdomain, ''))
  WHERE id = NEW.club_id AND COALESCE(member_number_prefix, '') = '';

  _next := public.get_next_member_number(NEW.club_id);
  IF _next IS NOT NULL AND _next <> '' THEN
    NEW.club_member_number := _next;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS club_members_assign_number ON public.club_members;
CREATE TRIGGER club_members_assign_number
BEFORE INSERT ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.assign_club_member_number();

-- 6. Duplicate-player matcher --------------------------------------------
CREATE OR REPLACE FUNCTION public.find_existing_club_member(
  _club_id uuid,
  _name text DEFAULT NULL,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _id_number text DEFAULT NULL,
  _league_number text DEFAULT NULL
)
RETURNS TABLE (
  member_id uuid,
  member_name text,
  club_member_number text,
  match_kind text,
  is_claimed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT m.id, m.name, m.club_member_number, m.user_id,
      CASE
        WHEN _league_number IS NOT NULL AND _league_number <> ''
             AND EXISTS (
               SELECT 1 FROM public.member_association_affiliations a
               WHERE a.club_member_id = m.id
                 AND lower(COALESCE(a.league_association_number, '')) = lower(_league_number)
             ) THEN 'league_number'
        WHEN _id_number IS NOT NULL AND _id_number <> ''
             AND COALESCE(m.id_number, '') = _id_number THEN 'id_number'
        WHEN _email IS NOT NULL AND _email <> ''
             AND lower(COALESCE(m.email, '')) = lower(_email) THEN 'email'
        WHEN _phone IS NOT NULL AND _phone <> ''
             AND regexp_replace(COALESCE(m.phone, ''), '\D', '', 'g') <> ''
             AND right(regexp_replace(COALESCE(m.phone, ''), '\D', '', 'g'), 9)
                 = right(regexp_replace(_phone, '\D', '', 'g'), 9) THEN 'phone'
        WHEN _name IS NOT NULL AND _name <> ''
             AND lower(regexp_replace(COALESCE(m.name, ''), '\s+', ' ', 'g'))
                 = lower(regexp_replace(_name, '\s+', ' ', 'g')) THEN 'name'
        ELSE NULL
      END AS kind
    FROM public.club_members m
    WHERE m.club_id = _club_id
  )
  SELECT id, name, club_member_number, kind, user_id IS NOT NULL
  FROM candidates
  WHERE kind IS NOT NULL
  ORDER BY CASE kind
    WHEN 'league_number' THEN 1 WHEN 'id_number' THEN 2 WHEN 'email' THEN 3
    WHEN 'phone' THEN 4 ELSE 5 END
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.find_existing_club_member(uuid, text, text, text, text, text) TO authenticated, service_role;
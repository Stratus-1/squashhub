
CREATE TABLE public.club_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  requester_member_id uuid NOT NULL REFERENCES public.club_members(id),
  topic text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount numeric(12,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','declined','withdrawn')),
  requester_signature_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX club_approval_requests_club_idx ON public.club_approval_requests(club_id, created_at DESC);

CREATE TABLE public.club_approval_approvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.club_approval_requests(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.club_members(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  signature_path text,
  signed_at timestamptz,
  signed_via text,
  decline_reason text,
  token_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, member_id)
);

CREATE TABLE public.club_approval_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.club_approval_requests(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.club_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.club_approval_requests(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  actor_member_id uuid REFERENCES public.club_members(id),
  kind text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.member_signatures (
  club_member_id uuid PRIMARY KEY REFERENCES public.club_members(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  path text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.club_approval_requests, public.club_approval_approvers, public.club_approval_attachments, public.club_approval_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.member_signatures TO authenticated;
GRANT ALL ON public.club_approval_requests, public.club_approval_approvers, public.club_approval_attachments, public.club_approval_events, public.member_signatures TO service_role;
REVOKE SELECT (token_hash) ON public.club_approval_approvers FROM authenticated;

ALTER TABLE public.club_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_approval_approvers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_approval_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_approval_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_signatures ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._approval_is_eligible_member(p_member uuid, p_club uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_members m
    WHERE m.id = p_member AND m.club_id = p_club
      AND COALESCE(m.status::text, 'active') = 'active'
      AND (m.role::text = 'admin' OR EXISTS (
        SELECT 1 FROM club_offices o
        WHERE o.club_member_id = m.id AND o.club_id = p_club AND o.ended_at IS NULL)))
$$;

CREATE OR REPLACE FUNCTION public._approval_my_member(p_club uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id FROM club_members m
  WHERE m.club_id = p_club AND m.user_id = auth.uid()
    AND public._approval_is_eligible_member(m.id, p_club)
  ORDER BY (m.role::text = 'admin') ASC, m.id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_use_club_approvals(p_club uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (public._approval_my_member(p_club) IS NOT NULL OR public.is_club_admin(auth.uid(), p_club))
$$;

CREATE POLICY "Committee reads approval requests" ON public.club_approval_requests FOR SELECT TO authenticated USING (public.can_use_club_approvals(club_id));
CREATE POLICY "Committee reads approvers" ON public.club_approval_approvers FOR SELECT TO authenticated USING (public.can_use_club_approvals(club_id));
CREATE POLICY "Committee reads approval files" ON public.club_approval_attachments FOR SELECT TO authenticated USING (public.can_use_club_approvals(club_id));
CREATE POLICY "Committee reads approval log" ON public.club_approval_events FOR SELECT TO authenticated USING (public.can_use_club_approvals(club_id));
CREATE POLICY "Own saved signature read" ON public.member_signatures FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own saved signature insert" ON public.member_signatures FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = club_member_id AND m.club_id = member_signatures.club_id AND m.user_id = auth.uid())
    AND left(path, length(club_id::text || '/saved/')) = club_id::text || '/saved/');
CREATE POLICY "Own saved signature update" ON public.member_signatures FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND left(path, length(club_id::text || '/saved/')) = club_id::text || '/saved/');

CREATE POLICY "Club approvals read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'club-approvals' AND public.can_use_club_approvals(((storage.foldername(name))[1])::uuid));
CREATE POLICY "Club approvals upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'club-approvals' AND public.can_use_club_approvals(((storage.foldername(name))[1])::uuid));

CREATE OR REPLACE FUNCTION public._approval_notify(p_member uuid, p_club uuid, p_request uuid, p_title text, p_body text, p_email_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record;
BEGIN
  SELECT id, user_id, email, name INTO m FROM club_members WHERE id = p_member;
  IF m.id IS NULL THEN RETURN; END IF;
  IF m.user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, club_member_id, title, message, type, url, data)
    VALUES (m.user_id, m.id, p_title, p_body, 'approval_request',
      '/club-admin?tab=approvals&request=' || p_request::text,
      jsonb_build_object('suppress_email', 'true', 'approval_request_id', p_request));
  END IF;
  IF COALESCE(trim(m.email), '') <> '' THEN
    INSERT INTO email_outbox (club_id, club_member_id, recipient_email, recipient_name, subject, body, url, cta_label, kind, ref_id, status, scheduled_for)
    VALUES (p_club, m.id, trim(m.email), m.name, p_title, p_body,
      COALESCE(p_email_url, 'https://squashhub.co.za/club-admin?tab=approvals&request=' || p_request::text),
      'Open request', 'platform_notice', p_request, 'queued', now());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._approval_finalize(p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_club text;
BEGIN
  SELECT * INTO r FROM club_approval_requests WHERE id = p_request FOR UPDATE;
  IF r.status <> 'open' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM club_approval_approvers WHERE request_id = p_request AND status <> 'approved') THEN
    UPDATE club_approval_requests SET status = 'approved', decided_at = now() WHERE id = p_request;
    INSERT INTO club_approval_events (request_id, club_id, kind) VALUES (p_request, r.club_id, 'approved_all');
    SELECT name INTO v_club FROM clubs WHERE id = r.club_id;
    PERFORM public._approval_notify(r.requester_member_id, r.club_id, p_request,
      'Approved: ' || r.topic,
      'All selected committee members have approved your request "' || r.topic || '" at ' || COALESCE(v_club, 'your club') || '.', NULL);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._approval_apply_sign(p_approver uuid, p_path text, p_via text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; r record;
BEGIN
  SELECT * INTO a FROM club_approval_approvers WHERE id = p_approver FOR UPDATE;
  SELECT * INTO r FROM club_approval_requests WHERE id = a.request_id FOR UPDATE;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'This request is no longer open'; END IF;
  IF a.status <> 'pending' THEN RAISE EXCEPTION 'You have already answered this request'; END IF;
  IF p_path IS NULL OR left(p_path, length(r.club_id::text || '/' || r.id::text || '/')) <> r.club_id::text || '/' || r.id::text || '/' THEN
    RAISE EXCEPTION 'A signature is required';
  END IF;
  UPDATE club_approval_approvers SET status = 'approved', signature_path = p_path, signed_at = now(), signed_via = p_via WHERE id = p_approver;
  INSERT INTO club_approval_events (request_id, club_id, actor_member_id, kind, note) VALUES (r.id, r.club_id, a.member_id, 'approved', p_via);
  PERFORM public._approval_finalize(r.id);
END $$;

CREATE OR REPLACE FUNCTION public._approval_apply_decline(p_approver uuid, p_reason text, p_via text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; r record; v_name text;
BEGIN
  IF COALESCE(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Please give a reason'; END IF;
  SELECT * INTO a FROM club_approval_approvers WHERE id = p_approver FOR UPDATE;
  SELECT * INTO r FROM club_approval_requests WHERE id = a.request_id FOR UPDATE;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'This request is no longer open'; END IF;
  IF a.status <> 'pending' THEN RAISE EXCEPTION 'You have already answered this request'; END IF;
  UPDATE club_approval_approvers SET status = 'declined', decline_reason = left(trim(p_reason), 2000), signed_at = now(), signed_via = p_via WHERE id = p_approver;
  UPDATE club_approval_requests SET status = 'declined', decided_at = now() WHERE id = r.id;
  INSERT INTO club_approval_events (request_id, club_id, actor_member_id, kind, note) VALUES (r.id, r.club_id, a.member_id, 'declined', left(trim(p_reason), 2000));
  SELECT name INTO v_name FROM club_members WHERE id = a.member_id;
  PERFORM public._approval_notify(r.requester_member_id, r.club_id, r.id,
    'Declined: ' || r.topic,
    COALESCE(v_name, 'A committee member') || ' declined your request "' || r.topic || '". Reason: ' || trim(p_reason), NULL);
END $$;

CREATE OR REPLACE FUNCTION public.approval_eligible_members(p_club uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_use_club_approvals(p_club) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.name,
      'office', (SELECT string_agg(o.office, ', ') FROM club_offices o WHERE o.club_member_id = m.id AND o.club_id = p_club AND o.ended_at IS NULL),
      'is_admin', m.role::text = 'admin', 'has_email', COALESCE(trim(m.email), '') <> '') ORDER BY m.name)
    FROM club_members m WHERE m.club_id = p_club AND public._approval_is_eligible_member(m.id, p_club)), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.approval_list(p_club uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_use_club_approvals(p_club) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN jsonb_build_object(
    'my_member_ids', COALESCE((SELECT jsonb_agg(id) FROM club_members WHERE club_id = p_club AND user_id = auth.uid()), '[]'::jsonb),
    'requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'topic', r.topic, 'description', r.description, 'amount', r.amount, 'status', r.status,
        'created_at', r.created_at, 'decided_at', r.decided_at, 'requester_member_id', r.requester_member_id,
        'requester_name', rm.name, 'requester_signature_path', r.requester_signature_path,
        'approvers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'member_id', a.member_id, 'name', am.name,
            'office', (SELECT string_agg(o.office, ', ') FROM club_offices o WHERE o.club_member_id = a.member_id AND o.club_id = p_club AND o.ended_at IS NULL),
            'status', a.status, 'signature_path', a.signature_path, 'signed_at', a.signed_at, 'signed_via', a.signed_via,
            'decline_reason', a.decline_reason) ORDER BY a.created_at)
          FROM club_approval_approvers a JOIN club_members am ON am.id = a.member_id WHERE a.request_id = r.id), '[]'::jsonb),
        'attachments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'path', f.path, 'file_name', f.file_name, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes) ORDER BY f.created_at)
          FROM club_approval_attachments f WHERE f.request_id = r.id), '[]'::jsonb),
        'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.note, 'created_at', e.created_at, 'actor_name', em.name) ORDER BY e.created_at)
          FROM club_approval_events e LEFT JOIN club_members em ON em.id = e.actor_member_id WHERE e.request_id = r.id), '[]'::jsonb)
      ) ORDER BY r.created_at DESC)
      FROM club_approval_requests r JOIN club_members rm ON rm.id = r.requester_member_id
      WHERE r.club_id = p_club), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.approval_create(p_id uuid, p_club uuid, p_topic text, p_description text, p_amount numeric,
  p_approvers uuid[], p_signature_path text, p_attachments jsonb DEFAULT '[]'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid; v_a uuid; v_tok text; v_name text; v_club text; f jsonb;
  v_prefix text := p_club::text || '/' || p_id::text || '/';
BEGIN
  v_me := public._approval_my_member(p_club);
  IF v_me IS NULL THEN RAISE EXCEPTION 'Only office bearers or club admins can create approval requests'; END IF;
  IF COALESCE(trim(p_topic), '') = '' THEN RAISE EXCEPTION 'Topic is required'; END IF;
  IF length(p_topic) > 200 OR length(COALESCE(p_description, '')) > 5000 THEN RAISE EXCEPTION 'Topic or description is too long'; END IF;
  IF p_amount IS NOT NULL AND p_amount < 0 THEN RAISE EXCEPTION 'Amount cannot be negative'; END IF;
  IF p_approvers IS NULL OR cardinality(p_approvers) = 0 THEN RAISE EXCEPTION 'Choose at least one approver'; END IF;
  IF cardinality(p_approvers) > 10 THEN RAISE EXCEPTION 'Choose at most 10 approvers'; END IF;
  IF v_me = ANY(p_approvers) THEN RAISE EXCEPTION 'You cannot approve your own request'; END IF;
  IF cardinality(p_approvers) <> (SELECT count(DISTINCT x) FROM unnest(p_approvers) x) THEN RAISE EXCEPTION 'An approver was chosen twice'; END IF;
  FOREACH v_a IN ARRAY p_approvers LOOP
    IF NOT public._approval_is_eligible_member(v_a, p_club) THEN RAISE EXCEPTION 'Each approver must be a current office bearer or club admin'; END IF;
  END LOOP;
  IF p_signature_path IS NULL OR left(p_signature_path, length(v_prefix)) <> v_prefix THEN RAISE EXCEPTION 'Your signature is required'; END IF;
  IF EXISTS (SELECT 1 FROM club_approval_requests WHERE id = p_id) THEN RAISE EXCEPTION 'Request already exists'; END IF;

  INSERT INTO club_approval_requests (id, club_id, requester_member_id, topic, description, amount, requester_signature_path)
  VALUES (p_id, p_club, v_me, trim(p_topic), COALESCE(trim(p_description), ''), p_amount, p_signature_path);

  FOR f IN SELECT * FROM jsonb_array_elements(COALESCE(p_attachments, '[]'::jsonb)) LOOP
    IF left(f->>'path', length(v_prefix)) <> v_prefix THEN RAISE EXCEPTION 'Invalid attachment'; END IF;
    INSERT INTO club_approval_attachments (request_id, club_id, path, file_name, mime_type, size_bytes)
    VALUES (p_id, p_club, f->>'path', left(COALESCE(f->>'file_name', 'file'), 255), f->>'mime_type', NULLIF(f->>'size_bytes', '')::bigint);
  END LOOP;

  INSERT INTO club_approval_events (request_id, club_id, actor_member_id, kind) VALUES (p_id, p_club, v_me, 'created');
  SELECT name INTO v_name FROM club_members WHERE id = v_me;
  SELECT name INTO v_club FROM clubs WHERE id = p_club;

  FOREACH v_a IN ARRAY p_approvers LOOP
    v_tok := encode(extensions.gen_random_bytes(24), 'hex');
    INSERT INTO club_approval_approvers (request_id, club_id, member_id, token_hash)
    VALUES (p_id, p_club, v_a, encode(extensions.digest(v_tok, 'sha256'), 'hex'));
    PERFORM public._approval_notify(v_a, p_club, p_id,
      'Approval needed: ' || trim(p_topic),
      COALESCE(v_name, 'A committee member') || ' (' || COALESCE(v_club, 'your club') || ') asks for your approval on "' || trim(p_topic) || '". '
        || 'Open the request to read it, see the documents, and approve with your signature or decline.',
      'https://squashhub.co.za/approve/' || v_tok);
  END LOOP;
  RETURN p_id;
END $$;

CREATE OR REPLACE FUNCTION public.approval_sign(p_request uuid, p_signature_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT a.id INTO v_id FROM club_approval_approvers a JOIN club_members m ON m.id = a.member_id
  WHERE a.request_id = p_request AND m.user_id = auth.uid() AND a.status = 'pending' LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'You are not a pending approver on this request'; END IF;
  PERFORM public._approval_apply_sign(v_id, p_signature_path, 'app');
END $$;

CREATE OR REPLACE FUNCTION public.approval_decline(p_request uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT a.id INTO v_id FROM club_approval_approvers a JOIN club_members m ON m.id = a.member_id
  WHERE a.request_id = p_request AND m.user_id = auth.uid() AND a.status = 'pending' LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'You are not a pending approver on this request'; END IF;
  PERFORM public._approval_apply_decline(v_id, p_reason, 'app');
END $$;

CREATE OR REPLACE FUNCTION public.approval_withdraw(p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM club_approval_requests WHERE id = p_request FOR UPDATE;
  IF r.id IS NULL OR NOT EXISTS (SELECT 1 FROM club_members WHERE id = r.requester_member_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the person who made the request can withdraw it';
  END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'This request is no longer open'; END IF;
  UPDATE club_approval_requests SET status = 'withdrawn', decided_at = now() WHERE id = p_request;
  INSERT INTO club_approval_events (request_id, club_id, actor_member_id, kind) VALUES (p_request, r.club_id, r.requester_member_id, 'withdrawn');
END $$;

CREATE OR REPLACE FUNCTION public.approval_comment(p_request uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_me uuid;
BEGIN
  SELECT * INTO r FROM club_approval_requests WHERE id = p_request;
  IF r.id IS NULL OR NOT public.can_use_club_approvals(r.club_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF COALESCE(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Comment is empty'; END IF;
  SELECT id INTO v_me FROM club_members WHERE club_id = r.club_id AND user_id = auth.uid() LIMIT 1;
  INSERT INTO club_approval_events (request_id, club_id, actor_member_id, kind, note) VALUES (p_request, r.club_id, v_me, 'comment', left(trim(p_note), 2000));
END $$;

CREATE OR REPLACE FUNCTION public.approval_log_view(p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_me uuid;
BEGIN
  SELECT * INTO r FROM club_approval_requests WHERE id = p_request;
  IF r.id IS NULL OR NOT public.can_use_club_approvals(r.club_id) THEN RETURN; END IF;
  SELECT id INTO v_me FROM club_members WHERE club_id = r.club_id AND user_id = auth.uid() LIMIT 1;
  IF v_me IS NULL OR v_me = r.requester_member_id THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM club_approval_events WHERE request_id = p_request AND actor_member_id = v_me AND kind = 'viewed') THEN
    INSERT INTO club_approval_events (request_id, club_id, actor_member_id, kind, note) VALUES (p_request, r.club_id, v_me, 'viewed', 'app');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._approval_token_approver(p_token text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM club_approval_approvers
  WHERE p_token ~ '^[0-9a-f]{48}$' AND token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.approval_token_view(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; a record; r record;
BEGIN
  v_id := public._approval_token_approver(p_token);
  IF v_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM club_approval_approvers WHERE id = v_id;
  SELECT * INTO r FROM club_approval_requests WHERE id = a.request_id;
  IF NOT EXISTS (SELECT 1 FROM club_approval_events WHERE request_id = r.id AND actor_member_id = a.member_id AND kind = 'viewed') THEN
    INSERT INTO club_approval_events (request_id, club_id, actor_member_id, kind, note) VALUES (r.id, r.club_id, a.member_id, 'viewed', 'email link');
  END IF;
  RETURN jsonb_build_object(
    'request_id', r.id, 'club_id', r.club_id, 'club_name', (SELECT name FROM clubs WHERE id = r.club_id),
    'topic', r.topic, 'description', r.description, 'amount', r.amount, 'status', r.status,
    'created_at', r.created_at, 'decided_at', r.decided_at,
    'requester_name', (SELECT name FROM club_members WHERE id = r.requester_member_id),
    'requester_signature_path', r.requester_signature_path,
    'me', jsonb_build_object('approver_id', a.id, 'member_id', a.member_id, 'name', (SELECT name FROM club_members WHERE id = a.member_id), 'status', a.status),
    'saved_signature_path', (SELECT path FROM member_signatures WHERE club_member_id = a.member_id),
    'approvers', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', am.name, 'status', x.status, 'signed_at', x.signed_at, 'signature_path', x.signature_path, 'decline_reason', x.decline_reason) ORDER BY x.created_at)
      FROM club_approval_approvers x JOIN club_members am ON am.id = x.member_id WHERE x.request_id = r.id), '[]'::jsonb),
    'attachments', COALESCE((SELECT jsonb_agg(jsonb_build_object('path', f.path, 'file_name', f.file_name, 'mime_type', f.mime_type) ORDER BY f.created_at)
      FROM club_approval_attachments f WHERE f.request_id = r.id), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.approval_token_sign(p_token text, p_signature_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public._approval_token_approver(p_token);
  IF v_id IS NULL THEN RAISE EXCEPTION 'This link is not valid'; END IF;
  PERFORM public._approval_apply_sign(v_id, p_signature_path, 'email link');
END $$;

CREATE OR REPLACE FUNCTION public.approval_token_decline(p_token text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public._approval_token_approver(p_token);
  IF v_id IS NULL THEN RAISE EXCEPTION 'This link is not valid'; END IF;
  PERFORM public._approval_apply_decline(v_id, p_reason, 'email link');
END $$;

REVOKE ALL ON FUNCTION public._approval_is_eligible_member(uuid, uuid), public._approval_my_member(uuid), public._approval_notify(uuid, uuid, uuid, text, text, text),
  public._approval_finalize(uuid), public._approval_apply_sign(uuid, text, text), public._approval_apply_decline(uuid, text, text),
  public._approval_token_approver(text), public.approval_token_view(text), public.approval_token_sign(text, text), public.approval_token_decline(text, text),
  public.approval_eligible_members(uuid), public.approval_list(uuid), public.approval_create(uuid, uuid, text, text, numeric, uuid[], text, jsonb),
  public.approval_sign(uuid, text), public.approval_decline(uuid, text), public.approval_withdraw(uuid), public.approval_comment(uuid, text),
  public.approval_log_view(uuid), public.can_use_club_approvals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_club_approvals(uuid), public._approval_is_eligible_member(uuid, uuid), public._approval_my_member(uuid),
  public.approval_eligible_members(uuid), public.approval_list(uuid), public.approval_create(uuid, uuid, text, text, numeric, uuid[], text, jsonb),
  public.approval_sign(uuid, text), public.approval_decline(uuid, text), public.approval_withdraw(uuid), public.approval_comment(uuid, text),
  public.approval_log_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approval_token_view(text), public.approval_token_sign(text, text), public.approval_token_decline(text, text) TO service_role;

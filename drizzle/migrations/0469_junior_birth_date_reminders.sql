CREATE TABLE public.junior_dob_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL,
  club_id uuid NOT NULL,
  round int NOT NULL CHECK (round BETWEEN 1 AND 3),
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','in_app')),
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, round, channel)
);
GRANT ALL ON public.junior_dob_reminders TO service_role;
ALTER TABLE public.junior_dob_reminders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.junior_dob_links (
  token_hash text PRIMARY KEY,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL,
  club_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX junior_dob_links_person_idx ON public.junior_dob_links(person_id);
GRANT ALL ON public.junior_dob_links TO service_role;
ALTER TABLE public.junior_dob_links ENABLE ROW LEVEL SECURITY;

-- Juniors (SportyHQ junior-player tick on) with no birth date/ID anywhere, an
-- email or mobile number, fewer than 3 reminders and none in the last 14 days.
CREATE OR REPLACE FUNCTION public.junior_dob_due()
RETURNS TABLE(person_id uuid, club_member_id uuid, club_id uuid, club_name text, subdomain text,
  name text, email text, phone text, user_id uuid, next_round int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (
    SELECT cm.id, cm.club_id, cm.person_id, cm.name, cm.email, cm.phone, cm.user_id, cm.id_number,
      pp.date_of_birth, pp.id_number AS pp_id
    FROM club_members cm
    LEFT JOIN people_private pp ON pp.person_id = cm.person_id
    WHERE cm.status = 'active' AND cm.role <> 'visitor' AND cm.person_id IS NOT NULL
  ),
  missing AS (
    SELECT m.person_id FROM m
    GROUP BY m.person_id
    HAVING bool_and(m.date_of_birth IS NULL
      AND public.age_from_id_prefix(m.pp_id) IS NULL
      AND public.age_from_id_prefix(m.id_number) IS NULL)
  ),
  juniors AS (
    SELECT s.person_id FROM junior_player_status s
    JOIN missing x ON x.person_id = s.person_id
    CROSS JOIN LATERAL public._junior_player_eval(s.admin_state, s.admin_set_at, s.last_junior_event_on, s.sportyhq_age_group, NULL::int) e
    WHERE e.is_on
  ),
  sent AS (
    SELECT r.person_id, max(r.round) AS rounds, max(r.created_at) AS last_at
    FROM junior_dob_reminders r GROUP BY r.person_id
  ),
  pick AS (
    SELECT DISTINCT ON (m.person_id) m.person_id, m.id, m.club_id, m.name,
      NULLIF(btrim(m.email), '') AS email, NULLIF(btrim(m.phone), '') AS phone, m.user_id
    FROM m JOIN juniors j ON j.person_id = m.person_id
    WHERE NULLIF(btrim(m.email), '') IS NOT NULL OR NULLIF(btrim(m.phone), '') IS NOT NULL
    ORDER BY m.person_id, (m.user_id IS NOT NULL) DESC,
      (NULLIF(btrim(m.email), '') IS NOT NULL AND NULLIF(btrim(m.phone), '') IS NOT NULL) DESC, m.id
  )
  SELECT p.person_id, p.id, p.club_id, c.name::text, c.subdomain::text, p.name::text, p.email, p.phone, p.user_id,
    COALESCE(s.rounds, 0) + 1
  FROM pick p
  JOIN clubs c ON c.id = p.club_id
  LEFT JOIN sent s ON s.person_id = p.person_id
  WHERE COALESCE(s.rounds, 0) < 3
    AND (s.last_at IS NULL OR s.last_at <= now() - interval '14 days');
$$;
REVOKE ALL ON FUNCTION public.junior_dob_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.junior_dob_due() TO service_role;

CREATE OR REPLACE FUNCTION public.junior_dob_issue_link(_person_id uuid, _club_member_id uuid, _club_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE tok text := encode(extensions.gen_random_bytes(24), 'hex');
BEGIN
  INSERT INTO junior_dob_links(token_hash, person_id, club_member_id, club_id, expires_at)
  VALUES (encode(extensions.digest(tok, 'sha256'), 'hex'), _person_id, _club_member_id, _club_id, now() + interval '30 days');
  RETURN tok;
END $$;
REVOKE ALL ON FUNCTION public.junior_dob_issue_link(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.junior_dob_issue_link(uuid, uuid, uuid) TO service_role;

-- Public: what the link page shows (first name + club only).
CREATE OR REPLACE FUNCTION public.junior_dob_link_info(_token text)
RETURNS TABLE(status text, first_name text, club_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE l junior_dob_links%ROWTYPE; has_dob boolean;
BEGIN
  IF _token IS NULL OR length(_token) <> 48 THEN RETURN QUERY SELECT 'invalid'::text, NULL::text, NULL::text; RETURN; END IF;
  SELECT * INTO l FROM junior_dob_links WHERE token_hash = encode(extensions.digest(_token, 'sha256'), 'hex');
  IF NOT FOUND THEN RETURN QUERY SELECT 'invalid'::text, NULL::text, NULL::text; RETURN; END IF;
  SELECT pp.date_of_birth IS NOT NULL INTO has_dob FROM people_private pp WHERE pp.person_id = l.person_id;
  RETURN QUERY SELECT
    CASE WHEN COALESCE(has_dob, false) OR l.used_at IS NOT NULL THEN 'done'
         WHEN l.expires_at < now() THEN 'expired' ELSE 'ok' END,
    split_part(cm.name, ' ', 1)::text, c.name::text
  FROM club_members cm JOIN clubs c ON c.id = cm.club_id WHERE cm.id = l.club_member_id;
END $$;
REVOKE ALL ON FUNCTION public.junior_dob_link_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.junior_dob_link_info(text) TO anon, authenticated, service_role;

-- Public: save the birth date once. Never overwrites an existing date.
CREATE OR REPLACE FUNCTION public.junior_dob_submit(_token text, _dob date)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE l junior_dob_links%ROWTYPE; existing date;
BEGIN
  IF _token IS NULL OR length(_token) <> 48 THEN RETURN 'invalid'; END IF;
  SELECT * INTO l FROM junior_dob_links WHERE token_hash = encode(extensions.digest(_token, 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF l.used_at IS NOT NULL THEN RETURN 'done'; END IF;
  IF l.expires_at < now() THEN RETURN 'expired'; END IF;
  IF _dob IS NULL OR _dob > (current_date - interval '3 years')::date OR _dob < (current_date - interval '25 years')::date THEN
    RETURN 'bad_date';
  END IF;
  SELECT date_of_birth INTO existing FROM people_private WHERE person_id = l.person_id FOR UPDATE;
  IF existing IS NULL THEN
    INSERT INTO people_private(person_id, date_of_birth) VALUES (l.person_id, _dob)
    ON CONFLICT (person_id) DO UPDATE SET date_of_birth = EXCLUDED.date_of_birth
      WHERE people_private.date_of_birth IS NULL;
    INSERT INTO audit_events(club_id, actor_label, entity_type, entity_id, action, reason, after_data)
    VALUES (l.club_id, 'Birth-date reminder link', 'person', l.person_id, 'birth_date_added',
      'Added via junior birth-date reminder link', jsonb_build_object('club_member_id', l.club_member_id, 'date_of_birth_set', true));
  END IF;
  UPDATE junior_dob_links SET used_at = now() WHERE person_id = l.person_id AND used_at IS NULL;
  RETURN 'saved';
END $$;
REVOKE ALL ON FUNCTION public.junior_dob_submit(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.junior_dob_submit(text, date) TO anon, authenticated, service_role;
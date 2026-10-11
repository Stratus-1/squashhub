-- Opponent contact sharing: ONE national person-level, opt-in preference.
-- No client table access: everything goes through SECURITY DEFINER RPCs below.
CREATE TABLE public.person_contact_sharing (
  person_id uuid PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  share_with_opponents boolean NOT NULL DEFAULT false,
  adult_confirmed boolean NOT NULL DEFAULT false,
  consented_at timestamptz,
  withdrawn_at timestamptz,
  guardian_name text,
  guardian_phone text,
  guardian_confirmed_at timestamptz,
  source text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.person_contact_sharing TO service_role;
ALTER TABLE public.person_contact_sharing ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.person_contact_sharing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL,
  share boolean NOT NULL,
  guardian boolean NOT NULL DEFAULT false,
  source text,
  actor uuid,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.person_contact_sharing_audit TO service_role;
ALTER TABLE public.person_contact_sharing_audit ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.opponent_contact_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer uuid,
  channel text NOT NULL DEFAULT 'app',
  fixture_kind text NOT NULL,
  fixture_id uuid NOT NULL,
  opponent_member_id uuid,
  revealed boolean NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opponent_contact_access_log_viewer_at ON public.opponent_contact_access_log (viewer, at);
GRANT ALL ON public.opponent_contact_access_log TO service_role;
ALTER TABLE public.opponent_contact_access_log ENABLE ROW LEVEL SECURITY;

-- Member rows the signed-in user may act for: own logins, same national person, active family delegations.
CREATE OR REPLACE FUNCTION public._contact_my_member_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (SELECT id, person_id FROM club_members WHERE user_id = auth.uid())
  SELECT id FROM mine
  UNION SELECT cm.id FROM club_members cm JOIN mine ON mine.person_id IS NOT NULL AND cm.person_id = mine.person_id
  UNION SELECT d.grantor_member_id FROM member_account_delegations d JOIN mine ON d.delegate_member_id = mine.id WHERE d.status = 'active'
$$;
REVOKE ALL ON FUNCTION public._contact_my_member_ids() FROM PUBLIC, anon;

-- Age in years from DOB, else SA ID (YYMMDD...), else NULL (unknown).
CREATE OR REPLACE FUNCTION public._contact_person_age(p_person uuid)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE dob date; idn text; yy int; d date;
BEGIN
  SELECT date_of_birth, id_number INTO dob, idn FROM people_private WHERE person_id = p_person;
  IF idn IS NULL THEN SELECT id_number INTO idn FROM club_members WHERE person_id = p_person AND id_number ~ '^\d{13}$' LIMIT 1; END IF;
  IF dob IS NULL AND idn ~ '^\d{13}$' THEN
    yy := substr(idn,1,2)::int;
    BEGIN
      d := make_date(CASE WHEN 2000 + yy <= extract(year FROM now())::int THEN 2000 + yy ELSE 1900 + yy END, substr(idn,3,2)::int, substr(idn,5,2)::int);
      dob := d;
    EXCEPTION WHEN others THEN dob := NULL; END;
  END IF;
  IF dob IS NULL THEN RETURN NULL; END IF;
  RETURN date_part('year', age(current_date, dob))::int;
END $$;
REVOKE ALL ON FUNCTION public._contact_person_age(uuid) FROM PUBLIC, anon, authenticated;

-- The shareable contact for one member under CURRENT consent, or nothing.
-- Under 18: only a confirmed guardian contact. Unknown age: own number only with adult confirmation.
CREATE OR REPLACE FUNCTION public._contact_shareable(p_member uuid)
RETURNS TABLE(phone text, is_guardian boolean, guardian_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; pref person_contact_sharing; a int; ph text;
BEGIN
  SELECT person_id INTO pid FROM club_members WHERE id = p_member;
  IF pid IS NULL THEN RETURN; END IF;
  SELECT * INTO pref FROM person_contact_sharing WHERE person_id = pid;
  IF NOT FOUND OR NOT pref.share_with_opponents THEN RETURN; END IF;
  a := _contact_person_age(pid);
  IF a IS NOT NULL AND a < 18 THEN
    IF pref.guardian_confirmed_at IS NOT NULL AND nullif(trim(pref.guardian_phone),'') IS NOT NULL THEN
      RETURN QUERY SELECT pref.guardian_phone, true, pref.guardian_name;
    END IF;
    RETURN;
  END IF;
  IF a IS NULL AND NOT pref.adult_confirmed THEN RETURN; END IF;
  SELECT coalesce(nullif(trim(p.phone),''), (SELECT nullif(trim(cm.phone),'') FROM club_members cm WHERE cm.person_id = pid AND nullif(trim(cm.phone),'') IS NOT NULL ORDER BY (cm.id = p_member) DESC LIMIT 1))
    INTO ph FROM people p WHERE p.id = pid;
  IF ph IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT ph, false, NULL::text;
END $$;
REVOKE ALL ON FUNCTION public._contact_shareable(uuid) FROM PUBLIC, anon, authenticated;

-- Opponents of p_member in one ACTIVE fixture (not finalised/cancelled/void/bye). Empty when not a participant.
CREATE OR REPLACE FUNCTION public._contact_fixture_opponents(p_kind text, p_fixture uuid, p_members uuid[])
RETURNS TABLE(member_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; c record;
BEGIN
  IF p_kind = 'champ' THEN
    SELECT * INTO m FROM club_champs_matches WHERE id = p_fixture;
    IF NOT FOUND OR coalesce(m.is_bye,false) OR m.winner_member_id IS NOT NULL
       OR m.status IN ('completed','cancelled','walkover_void','void') THEN RETURN; END IF;
    IF m.player_a_member_id = ANY(p_members) OR m.partner_a_member_id = ANY(p_members) THEN
      RETURN QUERY SELECT x FROM unnest(ARRAY[m.player_b_member_id, m.partner_b_member_id]) x WHERE x IS NOT NULL;
    ELSIF m.player_b_member_id = ANY(p_members) OR m.partner_b_member_id = ANY(p_members) THEN
      RETURN QUERY SELECT x FROM unnest(ARRAY[m.player_a_member_id, m.partner_a_member_id]) x WHERE x IS NOT NULL;
    END IF;
  ELSIF p_kind = 'challenge' THEN
    SELECT * INTO c FROM challenges WHERE id = p_fixture;
    IF NOT FOUND OR c.status NOT IN ('pending','accepted','scheduled') THEN RETURN; END IF;
    IF c.challenger_member_id = ANY(p_members) AND c.opponent_member_id IS NOT NULL THEN RETURN QUERY SELECT c.opponent_member_id;
    ELSIF c.opponent_member_id = ANY(p_members) AND c.challenger_member_id IS NOT NULL THEN RETURN QUERY SELECT c.challenger_member_id; END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._contact_fixture_opponents(text, uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- App view: signed-in participant asks for their opponents' contact for ONE fixture.
CREATE OR REPLACE FUNCTION public.get_fixture_opponent_contacts(p_kind text, p_fixture_id uuid)
RETURNS TABLE(member_id uuid, name text, phone text, is_guardian boolean, guardian_name text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid[]; o uuid; s record; n int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO n FROM opponent_contact_access_log WHERE viewer = auth.uid() AND at > now() - interval '1 hour';
  IF n >= 120 THEN RAISE EXCEPTION 'Too many contact lookups — try again later' USING ERRCODE = 'P0001'; END IF;
  SELECT array_agg(x) INTO me FROM _contact_my_member_ids() x;
  IF me IS NULL THEN RETURN; END IF;
  FOR o IN SELECT f.member_id FROM _contact_fixture_opponents(p_kind, p_fixture_id, me) f LOOP
    IF o = ANY(me) THEN CONTINUE; END IF;
    SELECT * INTO s FROM _contact_shareable(o);
    INSERT INTO opponent_contact_access_log(viewer, fixture_kind, fixture_id, opponent_member_id, revealed)
      VALUES (auth.uid(), p_kind, p_fixture_id, o, s.phone IS NOT NULL);
    RETURN QUERY SELECT o, (SELECT cm.name FROM club_members cm WHERE cm.id = o), s.phone, coalesce(s.is_guardian,false), s.guardian_name;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_fixture_opponent_contacts(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fixture_opponent_contacts(text, uuid) TO authenticated;

-- Send time (server only): contacts of p_recipient's opponents in one fixture, under CURRENT consent.
CREATE OR REPLACE FUNCTION public.fixture_opponent_contacts_for_member(p_kind text, p_fixture_id uuid, p_recipient uuid)
RETURNS TABLE(member_id uuid, phone text, is_guardian boolean, guardian_name text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE o uuid; s record;
BEGIN
  FOR o IN SELECT f.member_id FROM _contact_fixture_opponents(p_kind, p_fixture_id, ARRAY[p_recipient]) f LOOP
    SELECT * INTO s FROM _contact_shareable(o);
    INSERT INTO opponent_contact_access_log(viewer, channel, fixture_kind, fixture_id, opponent_member_id, revealed)
      VALUES (NULL, 'message', p_kind, p_fixture_id, o, s.phone IS NOT NULL);
    IF s.phone IS NOT NULL THEN RETURN QUERY SELECT o, s.phone, s.is_guardian, s.guardian_name; END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.fixture_opponent_contacts_for_member(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fixture_opponent_contacts_for_member(text, uuid, uuid) TO service_role;

-- Read own (or managed family member's) preference.
CREATE OR REPLACE FUNCTION public.get_contact_sharing(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; pref person_contact_sharing; a int; nm text;
BEGIN
  IF NOT (p_member_id IN (SELECT _contact_my_member_ids())) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT person_id, name INTO pid, nm FROM club_members WHERE id = p_member_id;
  IF pid IS NULL THEN RETURN jsonb_build_object('available', false, 'name', nm); END IF;
  SELECT * INTO pref FROM person_contact_sharing WHERE person_id = pid;
  a := _contact_person_age(pid);
  RETURN jsonb_build_object('available', true, 'name', nm,
    'share', coalesce(pref.share_with_opponents,false), 'adult_confirmed', coalesce(pref.adult_confirmed,false),
    'minor', a IS NOT NULL AND a < 18, 'age_known', a IS NOT NULL,
    'guardian_name', pref.guardian_name, 'guardian_phone', pref.guardian_phone,
    'guardian_confirmed', pref.guardian_confirmed_at IS NOT NULL, 'updated_at', pref.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.get_contact_sharing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contact_sharing(uuid) TO authenticated;

-- Set preference (explicit opt-in only). Withdrawal applies immediately to all future views/messages.
CREATE OR REPLACE FUNCTION public.set_contact_sharing(p_member_id uuid, p_share boolean, p_source text DEFAULT 'settings',
  p_adult_confirmed boolean DEFAULT false, p_guardian_name text DEFAULT NULL, p_guardian_phone text DEFAULT NULL, p_guardian_confirm boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; a int; minor boolean; gphone text := nullif(trim(p_guardian_phone),'');
BEGIN
  IF auth.uid() IS NULL OR NOT (p_member_id IN (SELECT _contact_my_member_ids())) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT person_id INTO pid FROM club_members WHERE id = p_member_id;
  IF pid IS NULL THEN RAISE EXCEPTION 'This membership is not linked to a national player record yet'; END IF;
  a := _contact_person_age(pid); minor := a IS NOT NULL AND a < 18;
  IF p_share AND minor AND (NOT p_guardian_confirm OR gphone IS NULL OR nullif(trim(p_guardian_name),'') IS NULL) THEN
    RAISE EXCEPTION 'A parent or guardian must confirm and give their own name and mobile for players under 18';
  END IF;
  IF p_share AND NOT minor AND a IS NULL AND NOT p_adult_confirmed THEN
    RAISE EXCEPTION 'Please confirm you are 18 or older (or add a parent/guardian contact)';
  END IF;
  INSERT INTO person_contact_sharing AS t (person_id, share_with_opponents, adult_confirmed, consented_at, withdrawn_at, guardian_name, guardian_phone, guardian_confirmed_at, source, updated_by, updated_at)
  VALUES (pid, p_share, coalesce(p_adult_confirmed,false), CASE WHEN p_share THEN now() END, CASE WHEN NOT p_share THEN now() END,
    CASE WHEN minor THEN p_guardian_name END, CASE WHEN minor THEN gphone END, CASE WHEN minor AND p_share AND p_guardian_confirm THEN now() END,
    left(p_source, 40), auth.uid(), now())
  ON CONFLICT (person_id) DO UPDATE SET share_with_opponents = EXCLUDED.share_with_opponents,
    adult_confirmed = EXCLUDED.adult_confirmed OR (t.adult_confirmed AND EXCLUDED.share_with_opponents),
    consented_at = CASE WHEN EXCLUDED.share_with_opponents THEN now() ELSE t.consented_at END,
    withdrawn_at = CASE WHEN NOT EXCLUDED.share_with_opponents THEN now() ELSE NULL END,
    guardian_name = CASE WHEN minor THEN coalesce(EXCLUDED.guardian_name, t.guardian_name) ELSE NULL END,
    guardian_phone = CASE WHEN minor THEN coalesce(EXCLUDED.guardian_phone, t.guardian_phone) ELSE NULL END,
    guardian_confirmed_at = CASE WHEN minor AND EXCLUDED.share_with_opponents THEN coalesce(EXCLUDED.guardian_confirmed_at, t.guardian_confirmed_at) ELSE NULL END,
    source = EXCLUDED.source, updated_by = auth.uid(), updated_at = now();
  INSERT INTO person_contact_sharing_audit(person_id, share, guardian, source, actor) VALUES (pid, p_share, minor, left(p_source,40), auth.uid());
  RETURN get_contact_sharing(p_member_id);
END $$;
REVOKE ALL ON FUNCTION public.set_contact_sharing(uuid, boolean, text, boolean, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_contact_sharing(uuid, boolean, text, boolean, text, text, boolean) TO authenticated;

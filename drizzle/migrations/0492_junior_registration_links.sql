-- Junior association registration links (see src/lib/AGENTS.md).

CREATE TABLE public.junior_body_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  is_regional boolean NOT NULL DEFAULT false,
  list_confirmed_at timestamptz,
  list_confirmed_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.junior_body_settings TO service_role;
ALTER TABLE public.junior_body_settings ENABLE ROW LEVEL SECURITY;

-- Every zone/provincial junior body, plus regional junior bodies grouped under a provincial.
INSERT INTO public.junior_body_settings (org_id, is_regional)
SELECT o.id, false FROM public.organisations o WHERE o.active AND o.kind::text IN ('zone','provincial')
UNION
SELECT o.id, true FROM public.organisations o
 WHERE o.active AND o.kind::text = 'association' AND o.name ILIKE '%junior%' AND o.club_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.org_groupings g JOIN public.organisations p ON p.id = g.parent_org_id
               WHERE g.child_org_id = o.id AND g.mode = 'include' AND p.kind::text = 'provincial')
ON CONFLICT (org_id) DO NOTHING;

CREATE TABLE public.junior_reg_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid
);
CREATE UNIQUE INDEX junior_reg_links_one_active ON public.junior_reg_links(org_id) WHERE active;
GRANT ALL ON public.junior_reg_links TO service_role;
ALTER TABLE public.junior_reg_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.junior_reg_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  link_id uuid REFERENCES public.junior_reg_links(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('claim','new','existing_unlisted','missing_club')),
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  requester_user_id uuid,
  junior_name text,
  gender text,
  date_of_birth date,
  parent_name text,
  parent_phone text,
  parent_email text,
  consent_at timestamptz,
  nsa_number text,
  missing_club_name text,
  missing_club_town text,
  contact_name text,
  contact_phone text,
  contact_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','linked')),
  decided_by uuid,
  decided_at timestamptz,
  decline_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX junior_reg_requests_org_idx ON public.junior_reg_requests(org_id, status);
CREATE INDEX junior_reg_requests_club_idx ON public.junior_reg_requests(club_id, status);
CREATE UNIQUE INDEX junior_reg_requests_one_pending_claim ON public.junior_reg_requests(club_member_id)
  WHERE kind = 'claim' AND status = 'pending';
GRANT ALL ON public.junior_reg_requests TO service_role;
ALTER TABLE public.junior_reg_requests ENABLE ROW LEVEL SECURITY;

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public._junior_body(_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.junior_body_settings s JOIN public.organisations o ON o.id = s.org_id
                 WHERE s.org_id = _org AND o.active);
$$;

-- Junior leaders: managers of the body itself, or of a junior body above it. Never reaches senior associations.
CREATE OR REPLACE FUNCTION public._junior_can_lead(_uid uuid, _org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND public._junior_body(_org) AND (
    public.federation_can_manage_org(_uid, _org)
    OR EXISTS (SELECT 1 FROM public.junior_body_settings s
               WHERE s.org_id <> _org
                 AND _org IN (SELECT d.org_id FROM public.org_grouping_descendants(s.org_id) d)
                 AND public.federation_can_manage_org(_uid, s.org_id)));
$$;

CREATE OR REPLACE FUNCTION public._junior_body_clubs(_org uuid)
RETURNS TABLE(club_id uuid, club_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT c.id, c.name::text FROM public.org_grouping_club_ids(_org) g
  JOIN public.clubs c ON c.id = g.club_id
  WHERE coalesce(c.tenant_type, 'club') <> 'association';
$$;

CREATE OR REPLACE FUNCTION public._junior_link_org(_token text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.org_id FROM public.junior_reg_links l
  JOIN public.junior_body_settings s ON s.org_id = l.org_id
  WHERE l.token = btrim(coalesce(_token, '')) AND l.active AND s.list_confirmed_at IS NOT NULL
    AND public._junior_body(l.org_id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._junior_mask_name(_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN array_length(regexp_split_to_array(btrim(coalesce(_name,'')), '\s+'), 1) > 1
    THEN split_part(btrim(_name), ' ', 1) || ' ' ||
         upper(left((regexp_split_to_array(btrim(_name), '\s+'))[array_length(regexp_split_to_array(btrim(_name), '\s+'), 1)], 1)) || '.'
    ELSE btrim(coalesce(_name, '')) END;
$$;

CREATE OR REPLACE FUNCTION public._junior_age_group(_dob date) RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN _dob IS NULL THEN NULL
    WHEN date_part('year', age(current_date, _dob)) >= 19 THEN 'Senior'
    ELSE 'U' || greatest(11, (date_part('year', age(current_date, _dob))::int + 1)) END;
$$;

-- People with admin rights over a junior body (its workspace admins).
CREATE OR REPLACE FUNCTION public._junior_body_leader_users(_org uuid) RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT cm.user_id FROM public.organisations o
  JOIN public.club_members cm ON cm.club_id = o.club_id
  WHERE o.id = _org AND cm.role = 'admin' AND cm.user_id IS NOT NULL AND coalesce(cm.status::text, 'active') = 'active';
$$;

CREATE OR REPLACE FUNCTION public._junior_mark_player(_person uuid, _actor uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.junior_player_status AS s (person_id, admin_state, admin_set_at, admin_set_by, updated_at)
  VALUES (_person, 'on', now(), _actor, now())
  ON CONFLICT (person_id) DO UPDATE SET admin_state = 'on', admin_set_at = now(), admin_set_by = _actor, updated_at = now()
  WHERE s.admin_state IS NULL;
$$;

CREATE OR REPLACE FUNCTION public._junior_save_dob(_person uuid, _dob date) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.people_private (person_id, date_of_birth) SELECT _person, _dob WHERE _person IS NOT NULL AND _dob IS NOT NULL
  ON CONFLICT (person_id) DO UPDATE SET date_of_birth = coalesce(public.people_private.date_of_birth, EXCLUDED.date_of_birth), updated_at = now();
$$;

REVOKE ALL ON FUNCTION public._junior_body(uuid), public._junior_can_lead(uuid, uuid), public._junior_body_clubs(uuid),
  public._junior_link_org(text), public._junior_body_leader_users(uuid), public._junior_mark_player(uuid, uuid),
  public._junior_save_dob(uuid, date) FROM PUBLIC, anon, authenticated;

-- ---------- workspace ----------
CREATE OR REPLACE FUNCTION public.junior_workspace_body(p_club_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); o record; v_lead boolean; v_link text; v_by text; v_clubs int; v_pending int;
BEGIN
  SELECT og.id, og.name, og.kind::text AS kind, s.is_regional, s.list_confirmed_at, s.list_confirmed_by INTO o
    FROM public.organisations og JOIN public.junior_body_settings s ON s.org_id = og.id
   WHERE og.club_id = p_club_id AND og.active LIMIT 1;
  IF o.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  v_lead := public._junior_can_lead(v_uid, o.id);
  IF NOT v_lead THEN RETURN jsonb_build_object('found', true, 'org_id', o.id, 'name', o.name, 'can_lead', false); END IF;
  SELECT token INTO v_link FROM public.junior_reg_links WHERE org_id = o.id AND active;
  SELECT coalesce(p.name, '') INTO v_by FROM public.profiles p WHERE p.id = o.list_confirmed_by;
  SELECT count(*) INTO v_clubs FROM public._junior_body_clubs(o.id);
  SELECT count(*) INTO v_pending FROM public.junior_reg_requests r
   WHERE r.status = 'pending' AND (r.org_id = o.id OR r.club_id IN (SELECT club_id FROM public._junior_body_clubs(o.id)));
  RETURN jsonb_build_object('found', true, 'org_id', o.id, 'name', o.name, 'kind', o.kind, 'is_regional', o.is_regional,
    'can_lead', true, 'list_confirmed_at', o.list_confirmed_at, 'list_confirmed_by', nullif(v_by, ''),
    'club_count', v_clubs, 'link_token', v_link, 'pending', v_pending,
    'clubs', (SELECT coalesce(jsonb_agg(jsonb_build_object('club_id', b.club_id, 'club_name', b.club_name) ORDER BY b.club_name), '[]'::jsonb)
                FROM public._junior_body_clubs(o.id) b));
END $$;

CREATE OR REPLACE FUNCTION public.junior_body_confirm_list(p_org uuid, p_confirmed boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public._junior_can_lead(v_uid, p_org) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE public.junior_body_settings
     SET list_confirmed_at = CASE WHEN p_confirmed THEN now() END,
         list_confirmed_by = CASE WHEN p_confirmed THEN v_uid END, updated_at = now()
   WHERE org_id = p_org;
  IF NOT p_confirmed THEN
    UPDATE public.junior_reg_links SET active = false, revoked_at = now(), revoked_by = v_uid WHERE org_id = p_org AND active;
  END IF;
  INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action)
  VALUES (p_org, v_uid, 'junior_body', p_org, CASE WHEN p_confirmed THEN 'junior_club_list_confirmed' ELSE 'junior_club_list_reopened' END);
END $$;

CREATE OR REPLACE FUNCTION public.junior_link_create(p_org uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_uid uuid := auth.uid(); v_tok text := encode(extensions.gen_random_bytes(12), 'hex');
BEGIN
  IF NOT public._junior_can_lead(v_uid, p_org) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.junior_body_settings WHERE org_id = p_org AND list_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirm the club list first';
  END IF;
  UPDATE public.junior_reg_links SET active = false, revoked_at = now(), revoked_by = v_uid WHERE org_id = p_org AND active;
  INSERT INTO public.junior_reg_links (org_id, token, created_by) VALUES (p_org, v_tok, v_uid);
  INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action)
  VALUES (p_org, v_uid, 'junior_body', p_org, 'junior_link_created');
  RETURN v_tok;
END $$;

CREATE OR REPLACE FUNCTION public.junior_link_revoke(p_org uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public._junior_can_lead(v_uid, p_org) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE public.junior_reg_links SET active = false, revoked_at = now(), revoked_by = v_uid WHERE org_id = p_org AND active;
  INSERT INTO public.audit_events (org_id, actor_user_id, entity_type, entity_id, action)
  VALUES (p_org, v_uid, 'junior_body', p_org, 'junior_link_revoked');
END $$;

-- ---------- leaders ----------
CREATE OR REPLACE FUNCTION public.junior_leaders_list(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public._junior_can_lead(v_uid, p_org) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  RETURN (
    WITH bodies AS (
      SELECT s.org_id FROM public.junior_body_settings s
       WHERE s.org_id = p_org OR s.org_id IN (SELECT d.org_id FROM public.org_grouping_descendants(p_org) d)
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'org_id', o.id, 'org_name', o.name, 'kind', o.kind, 'is_regional', s.is_regional, 'is_self', o.id = p_org,
      'leaders', (SELECT coalesce(jsonb_agg(jsonb_build_object('member_id', cm.id, 'name', cm.name, 'email', cm.email,
                    'phone', cm.phone, 'has_login', cm.user_id IS NOT NULL, 'is_me', cm.user_id = v_uid) ORDER BY cm.name), '[]'::jsonb)
                  FROM public.club_members cm
                  WHERE cm.club_id = o.club_id AND cm.role = 'admin' AND coalesce(cm.status::text, 'active') = 'active'))
      ORDER BY (o.id = p_org) DESC, o.kind, o.name), '[]'::jsonb)
    FROM bodies b JOIN public.organisations o ON o.id = b.org_id JOIN public.junior_body_settings s ON s.org_id = o.id
    WHERE o.active AND o.club_id IS NOT NULL);
END $$;

CREATE OR REPLACE FUNCTION public.junior_leader_add(p_org uuid, p_email text, p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL, p_home_club_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_tenant uuid; v_org_name text; v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, '')); v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_user uuid; v_person uuid; v_row record; v_member uuid; v_status text := 'added'; v_needs boolean := false;
  v_claims text := current_setting('request.jwt.claims', true); v_sub text := current_setting('request.jwt.claim.sub', true);
  v_home uuid; v_home_name text;
BEGIN
  IF NOT public._junior_can_lead(v_uid, p_org) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT club_id, name INTO v_tenant, v_org_name FROM public.organisations WHERE id = p_org;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'This association has no workspace yet'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Please enter a valid email address'; END IF;
  IF p_home_club_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = p_home_club_id AND coalesce(c.tenant_type, 'club') <> 'association') THEN
    RAISE EXCEPTION 'Choose a club for their home club';
  END IF;

  SELECT u.id INTO v_user FROM auth.users u WHERE lower(u.email) = v_email LIMIT 1;
  IF v_user IS NOT NULL THEN
    SELECT id INTO v_person FROM public.people WHERE auth_user_id = v_user AND merged_into_person_id IS NULL LIMIT 1;
    IF v_person IS NULL THEN SELECT person_id INTO v_person FROM public.club_members WHERE user_id = v_user AND person_id IS NOT NULL LIMIT 1; END IF;
    IF v_name = '' THEN
      SELECT name INTO v_name FROM public.club_members WHERE user_id = v_user AND coalesce(status::text,'active') <> 'resigned' ORDER BY joined_at NULLS LAST LIMIT 1;
      v_name := coalesce(nullif(btrim(v_name), ''), (SELECT name FROM public.profiles WHERE id = v_user), v_email);
    END IF;
    SELECT id, role::text AS role INTO v_row FROM public.club_members
     WHERE club_id = v_tenant AND user_id = v_user AND coalesce(status::text, 'active') <> 'resigned' LIMIT 1;
  ELSE
    IF position(' ' IN v_name) = 0 THEN RAISE EXCEPTION 'Please enter their first name and surname'; END IF;
    SELECT id, role::text AS role INTO v_row FROM public.club_members
     WHERE club_id = v_tenant AND user_id IS NULL AND lower(btrim(email)) = v_email AND coalesce(status::text, 'active') <> 'resigned' LIMIT 1;
    v_needs := true;
  END IF;

  -- Granting admin in another body's workspace: the junior-leader check above is the authority.
  IF NOT public.is_club_admin(v_uid, v_tenant) THEN
    PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
  END IF;
  IF v_row.id IS NOT NULL THEN
    v_member := v_row.id;
    IF v_row.role = 'admin' THEN v_status := 'already';
    ELSE UPDATE public.club_members SET role = 'admin', billing_exempt = true WHERE id = v_row.id; END IF;
  ELSE
    INSERT INTO public.club_members (club_id, user_id, person_id, name, email, phone, role, status, billing_exempt,
      plays_league, is_pending_approval, join_source)
    VALUES (v_tenant, v_user, v_person, v_name, v_email, v_phone, 'admin', 'active', true, false, false, 'junior_leader')
    RETURNING id, person_id INTO v_member, v_person;
  END IF;
  IF v_person IS NULL THEN SELECT person_id INTO v_person FROM public.club_members WHERE id = v_member; END IF;

  IF p_home_club_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.club_members m WHERE m.club_id = p_home_club_id AND coalesce(m.status::text, 'active') <> 'resigned'
          AND ((v_user IS NOT NULL AND m.user_id = v_user) OR (v_person IS NOT NULL AND m.person_id = v_person)
               OR lower(btrim(coalesce(m.email, ''))) = v_email)) THEN
    PERFORM set_config('app.tournament_join', '1', true);
    INSERT INTO public.club_members (club_id, user_id, person_id, name, email, phone, role, status, billing_exempt,
      plays_league, is_pending_approval, applied_at, join_source)
    VALUES (p_home_club_id, v_user, v_person, v_name, v_email, v_phone, 'member', 'active', true, false, true, now(), 'junior_leader_home')
    RETURNING id INTO v_home;
    PERFORM set_config('app.tournament_join', '', true);
    SELECT name INTO v_home_name FROM public.clubs WHERE id = p_home_club_id;
    INSERT INTO public.notifications (user_id, type, title, message, url, data)
    SELECT DISTINCT cm.user_id, 'membership_application', 'New member to confirm',
           v_name || ' was added as a leader of ' || v_org_name || ' and listed as a member of your club. Please confirm or remove them.',
           '/club-admin?tab=members&filter=pending', jsonb_build_object('club_member_id', v_home, 'club_id', p_home_club_id)
      FROM public.club_members cm
     WHERE cm.club_id = p_home_club_id AND cm.user_id IS NOT NULL AND cm.id <> v_home
       AND (cm.role = 'admin' OR public.has_club_permission(cm.user_id, p_home_club_id, 'members.approve'));
  END IF;

  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (p_org, v_tenant, v_uid, 'club_member', v_member, 'junior_leader_added',
          jsonb_build_object('email', v_email, 'home_club_id', p_home_club_id, 'home_member_id', v_home, 'existing_login', v_user IS NOT NULL));
  RETURN jsonb_build_object('status', v_status, 'member_id', v_member, 'needs_activation', v_needs,
    'org_name', v_org_name, 'home_club', v_home_name, 'name', v_name);
END $$;

CREATE OR REPLACE FUNCTION public.junior_leader_remove(p_org uuid, p_member_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_tenant uuid; m record;
  v_claims text := current_setting('request.jwt.claims', true); v_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF NOT public._junior_can_lead(v_uid, p_org) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT club_id INTO v_tenant FROM public.organisations WHERE id = p_org;
  SELECT id, user_id, role::text AS role INTO m FROM public.club_members WHERE id = p_member_id AND club_id = v_tenant;
  IF m.id IS NULL OR m.role <> 'admin' THEN RAISE EXCEPTION 'Leader not found'; END IF;
  IF m.user_id = v_uid THEN RAISE EXCEPTION 'You cannot remove yourself'; END IF;
  IF NOT public.is_club_admin(v_uid, v_tenant) THEN
    PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
  END IF;
  UPDATE public.club_members SET role = 'member', status = 'resigned' WHERE id = m.id;
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action)
  VALUES (p_org, v_tenant, v_uid, 'club_member', m.id, 'junior_leader_removed');
END $$;

-- When a newly added leader activates their login, their pending home-club record joins the same login.
CREATE OR REPLACE FUNCTION public._junior_leader_link_home() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.user_id IS NULL AND NEW.user_id IS NOT NULL AND NEW.join_source = 'junior_leader' AND NEW.person_id IS NOT NULL THEN
    PERFORM set_config('app.tournament_join_link', NEW.user_id::text, true);
    UPDATE public.club_members SET user_id = NEW.user_id
     WHERE person_id = NEW.person_id AND user_id IS NULL AND join_source = 'junior_leader_home' AND id <> NEW.id;
    PERFORM set_config('app.tournament_join_link', '', true);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_junior_leader_link_home AFTER UPDATE OF user_id ON public.club_members
  FOR EACH ROW EXECUTE FUNCTION public._junior_leader_link_home();

-- ---------- public link ----------
CREATE OR REPLACE FUNCTION public.junior_join_context(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public._junior_link_org(p_token); o record; v_uid uuid := auth.uid(); v_me jsonb := '[]'::jsonb;
BEGIN
  IF v_org IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT name, kind::text AS kind INTO o FROM public.organisations WHERE id = v_org;
  IF v_uid IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.name, 'club_name', b.club_name,
             'pending', coalesce(m.is_pending_approval, false)) ORDER BY m.name), '[]'::jsonb)
      INTO v_me FROM public.club_members m JOIN public._junior_body_clubs(v_org) b ON b.club_id = m.club_id
     WHERE m.user_id = v_uid AND coalesce(m.status::text, 'active') <> 'resigned' AND m.role <> 'visitor';
  END IF;
  RETURN jsonb_build_object('found', true, 'name', o.name, 'kind', o.kind,
    'clubs', (SELECT coalesce(jsonb_agg(jsonb_build_object('club_id', b.club_id, 'club_name', b.club_name) ORDER BY b.club_name), '[]'::jsonb)
                FROM public._junior_body_clubs(v_org) b),
    'me', v_me);
END $$;

CREATE OR REPLACE FUNCTION public.junior_join_find_member(p_token text, p_club_id uuid, p_query text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public._junior_link_org(p_token); v_q text := btrim(coalesce(p_query, ''));
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'This registration link is not active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public._junior_body_clubs(v_org) b WHERE b.club_id = p_club_id) THEN
    RAISE EXCEPTION 'That club is not part of this association';
  END IF;
  IF length(v_q) < 3 THEN RETURN '[]'::jsonb; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('member_id', m.id, 'display_name', public._junior_mask_name(m.name),
             'has_login', m.user_id IS NOT NULL,
             'nsa_on_file', EXISTS (SELECT 1 FROM public.member_association_affiliations a WHERE a.club_member_id = m.id AND a.active),
             'pending', coalesce(m.is_pending_approval, false)) AS x
      FROM public.club_members m
     WHERE m.club_id = p_club_id AND coalesce(m.status::text, 'active') = 'active' AND m.role <> 'visitor'
       AND (m.name ILIKE '%' || v_q || '%'
            OR EXISTS (SELECT 1 FROM public.member_association_affiliations a WHERE a.club_member_id = m.id AND a.active
                         AND upper(btrim(a.league_association_number)) = upper(v_q)))
     ORDER BY m.name LIMIT 10) s);
END $$;

CREATE OR REPLACE FUNCTION public._junior_check_details(p_dob date, p_parent_name text, p_parent_phone text, p_consent boolean)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF p_dob IS NULL OR p_dob > current_date OR p_dob < current_date - interval '100 years' THEN
    RAISE EXCEPTION 'Please enter a valid date of birth';
  END IF;
  IF age(current_date, p_dob) < interval '18 years' THEN
    IF length(btrim(coalesce(p_parent_name, ''))) < 3 OR length(regexp_replace(coalesce(p_parent_phone, ''), '\D', '', 'g')) < 9 THEN
      RAISE EXCEPTION 'A parent or guardian''s name and cell number are needed for players under 18';
    END IF;
    IF NOT coalesce(p_consent, false) THEN
      RAISE EXCEPTION 'A parent or guardian must give consent for players under 18';
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._junior_notify_request(p_req uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_org_name text; v_club text; v_tenant uuid; v_msg text;
BEGIN
  SELECT * INTO r FROM public.junior_reg_requests WHERE id = p_req;
  SELECT name, club_id INTO v_org_name, v_tenant FROM public.organisations WHERE id = r.org_id;
  SELECT name INTO v_club FROM public.clubs WHERE id = r.club_id;
  v_msg := CASE r.kind
    WHEN 'missing_club' THEN coalesce(r.contact_name, 'Someone') || ' asked to add ' || coalesce(r.missing_club_name, 'a club')
                             || coalesce(' (' || nullif(r.missing_club_town, '') || ')', '') || ' to the club list.'
    WHEN 'claim' THEN coalesce(r.junior_name, 'A junior') || ' asked to claim their profile at ' || coalesce(v_club, 'a club') || '.'
    ELSE coalesce(r.junior_name, 'A junior') || ' registered at ' || coalesce(v_club, 'a club') || ' through the junior link.' END;
  INSERT INTO public.notifications (user_id, type, title, message, url, data)
  SELECT u.user_id, 'junior_registration', 'Junior registration: ' || v_org_name, v_msg || ' Please review it.',
         '/?tab=junior-registrations', jsonb_build_object('request_id', r.id, 'club_id', v_tenant, 'org_id', r.org_id)
    FROM public._junior_body_leader_users(r.org_id) u;
  IF r.kind <> 'missing_club' AND r.club_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, url, data)
    SELECT DISTINCT cm.user_id, 'membership_application', 'Junior registration to confirm', v_msg || ' Please confirm or remove them.',
           '/club-admin?tab=members&filter=pending', jsonb_build_object('club_member_id', r.club_member_id, 'club_id', r.club_id, 'request_id', r.id)
      FROM public.club_members cm
     WHERE cm.club_id = r.club_id AND cm.user_id IS NOT NULL AND coalesce(cm.status::text, 'active') = 'active'
       AND (cm.role = 'admin' OR public.has_club_permission(cm.user_id, r.club_id, 'members.approve'))
       AND cm.user_id NOT IN (SELECT user_id FROM public._junior_body_leader_users(r.org_id));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._junior_notify_request(uuid), public._junior_check_details(date, text, text, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.junior_join_claim(p_token text, p_member_id uuid, p_nsa_number text, p_dob date,
  p_parent_name text DEFAULT NULL, p_parent_phone text DEFAULT NULL, p_parent_email text DEFAULT NULL, p_consent boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid := public._junior_link_org(p_token); m record; v_nsa text := upper(btrim(coalesce(p_nsa_number, '')));
        v_link uuid; v_req uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'This registration link is not active'; END IF;
  SELECT * INTO m FROM public.club_members WHERE id = p_member_id;
  IF m.id IS NULL OR m.role = 'visitor' OR coalesce(m.status::text, 'active') <> 'active'
     OR NOT EXISTS (SELECT 1 FROM public._junior_body_clubs(v_org) b WHERE b.club_id = m.club_id) THEN
    RAISE EXCEPTION 'That profile cannot be claimed here';
  END IF;
  PERFORM public._junior_check_details(p_dob, p_parent_name, p_parent_phone, p_consent);
  SELECT id INTO v_link FROM public.junior_reg_links WHERE token = btrim(p_token);

  IF m.user_id IS NOT NULL AND m.user_id <> v_uid THEN
    RAISE EXCEPTION 'This profile is already linked to another login. Please sign in with that login, or ask the club.';
  END IF;

  IF m.user_id = v_uid OR (v_nsa <> '' AND EXISTS (SELECT 1 FROM public.member_association_affiliations a
        WHERE a.club_member_id = m.id AND a.active AND upper(btrim(a.league_association_number)) = v_nsa)) THEN
    IF m.user_id IS NULL THEN
      PERFORM set_config('app.tournament_join_link', v_uid::text, true);
      UPDATE public.club_members SET user_id = v_uid WHERE id = m.id AND user_id IS NULL;
      PERFORM set_config('app.tournament_join_link', '', true);
      IF NOT EXISTS (SELECT 1 FROM public.club_members WHERE id = m.id AND user_id = v_uid) THEN
        RAISE EXCEPTION 'The profile could not be linked. Please try again.';
      END IF;
    END IF;
    PERFORM public._junior_save_dob(m.person_id, p_dob);
    IF m.person_id IS NOT NULL THEN PERFORM public._junior_mark_player(m.person_id, v_uid); END IF;
    INSERT INTO public.junior_reg_requests (org_id, link_id, kind, club_id, club_member_id, requester_user_id, junior_name,
      parent_name, parent_phone, parent_email, consent_at, nsa_number, status, decided_at)
    VALUES (v_org, v_link, 'claim', m.club_id, m.id, v_uid, m.name, nullif(btrim(p_parent_name), ''), nullif(btrim(p_parent_phone), ''),
      nullif(lower(btrim(p_parent_email)), ''), CASE WHEN p_consent THEN now() END, nullif(v_nsa, ''), 'linked', now());
    INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action)
    VALUES (v_org, m.club_id, v_uid, 'club_member', m.id, 'junior_link_profile_linked');
    RETURN jsonb_build_object('status', 'linked', 'member_id', m.id);
  END IF;

  SELECT id INTO v_req FROM public.junior_reg_requests WHERE club_member_id = m.id AND kind = 'claim' AND status = 'pending';
  IF v_req IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.junior_reg_requests WHERE id = v_req AND requester_user_id = v_uid) THEN
      RETURN jsonb_build_object('status', 'pending_claim', 'member_id', m.id);
    END IF;
    RAISE EXCEPTION 'Someone has already asked to claim this profile. The association or club will check it.';
  END IF;
  INSERT INTO public.junior_reg_requests (org_id, link_id, kind, club_id, club_member_id, requester_user_id, junior_name,
    date_of_birth, parent_name, parent_phone, parent_email, consent_at, nsa_number)
  VALUES (v_org, v_link, 'claim', m.club_id, m.id, v_uid, m.name, p_dob, nullif(btrim(p_parent_name), ''),
    nullif(btrim(p_parent_phone), ''), nullif(lower(btrim(p_parent_email)), ''), CASE WHEN p_consent THEN now() END, nullif(v_nsa, ''))
  RETURNING id INTO v_req;
  PERFORM public._junior_notify_request(v_req);
  RETURN jsonb_build_object('status', 'pending_claim', 'member_id', m.id);
END $$;

CREATE OR REPLACE FUNCTION public.junior_join_register(p_token text, p_club_id uuid, p_kind text, p_name text, p_gender text,
  p_dob date, p_phone text DEFAULT NULL, p_email text DEFAULT NULL, p_parent_name text DEFAULT NULL,
  p_parent_phone text DEFAULT NULL, p_parent_email text DEFAULT NULL, p_consent boolean DEFAULT false, p_nsa_number text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid := public._junior_link_org(p_token); v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
        v_gender text := lower(btrim(coalesce(p_gender, ''))); v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
        v_pemail text := nullif(lower(btrim(coalesce(p_parent_email, ''))), ''); v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
        v_pphone text := nullif(btrim(coalesce(p_parent_phone, '')), ''); v_person uuid; v_member uuid; v_link uuid; v_req uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'This registration link is not active'; END IF;
  IF p_kind NOT IN ('new', 'existing_unlisted') THEN RAISE EXCEPTION 'Choose how you are joining'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public._junior_body_clubs(v_org) b WHERE b.club_id = p_club_id) THEN
    RAISE EXCEPTION 'That club is not part of this association';
  END IF;
  IF position(' ' IN v_name) = 0 OR length(v_name) < 4 THEN RAISE EXCEPTION 'Please enter the player''s first name and surname'; END IF;
  IF v_gender NOT IN ('male', 'female') THEN RAISE EXCEPTION 'Please choose boy or girl'; END IF;
  PERFORM public._junior_check_details(p_dob, p_parent_name, v_pphone, p_consent);
  IF EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = p_club_id AND coalesce(m.status::text, 'active') <> 'resigned'
               AND lower(regexp_replace(coalesce(m.name, ''), '[^a-zA-Z]', '', 'g')) = lower(regexp_replace(v_name, '[^a-zA-Z]', '', 'g'))) THEN
    RAISE EXCEPTION 'A player with this name is already on the club''s list. Search for the name and choose "This is me".';
  END IF;
  SELECT id INTO v_link FROM public.junior_reg_links WHERE token = btrim(p_token);

  -- The junior is their own person, even when a parent's login registers them.
  INSERT INTO public.people (full_name, first_name, last_name, gender, email, phone)
  VALUES (v_name, split_part(v_name, ' ', 1), btrim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), v_gender, v_email, v_phone)
  RETURNING id INTO v_person;
  UPDATE public.people SET national_player_number = 'SSA' || lpad((
    coalesce((SELECT max(nullif(regexp_replace(national_player_number, '\D', '', 'g'), '')::bigint) FROM public.people), 0) + 1)::text, 6, '0')
  WHERE id = v_person;
  PERFORM public._junior_save_dob(v_person, p_dob);

  PERFORM set_config('app.tournament_join', '1', true);
  INSERT INTO public.club_members (club_id, user_id, person_id, name, gender, phone, email, role, status, is_pending_approval,
    billing_exempt, plays_league, applied_at, join_source, join_kind)
  VALUES (p_club_id, NULL, v_person, v_name, v_gender, coalesce(v_phone, v_pphone), coalesce(v_email, v_pemail),
    'member', 'active', true, true, false, now(), 'junior_link', p_kind)
  RETURNING id INTO v_member;
  PERFORM set_config('app.tournament_join', '', true);
  -- Link to the login that registered them (a parent's shared login, or the junior's own).
  PERFORM set_config('app.tournament_join_link', v_uid::text, true);
  UPDATE public.club_members SET user_id = v_uid WHERE id = v_member AND user_id IS NULL;
  PERFORM set_config('app.tournament_join_link', '', true);

  INSERT INTO public.junior_reg_requests (org_id, link_id, kind, club_id, club_member_id, requester_user_id, junior_name, gender,
    parent_name, parent_phone, parent_email, consent_at, nsa_number)
  VALUES (v_org, v_link, p_kind, p_club_id, v_member, v_uid, v_name, v_gender, nullif(btrim(p_parent_name), ''), v_pphone, v_pemail,
    CASE WHEN p_consent THEN now() END, nullif(upper(btrim(coalesce(p_nsa_number, ''))), ''))
  RETURNING id INTO v_req;
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_org, p_club_id, v_uid, 'club_member', v_member, 'junior_link_registered', jsonb_build_object('kind', p_kind, 'request_id', v_req));
  PERFORM public._junior_notify_request(v_req);
  RETURN jsonb_build_object('status', 'registered', 'member_id', v_member);
END $$;

CREATE OR REPLACE FUNCTION public.junior_join_missing_club(p_token text, p_club_name text, p_town text,
  p_contact_name text, p_contact_phone text, p_contact_email text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public._junior_link_org(p_token); v_link uuid; v_req uuid;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'This registration link is not active'; END IF;
  IF length(btrim(coalesce(p_club_name, ''))) < 3 THEN RAISE EXCEPTION 'Please enter the club or school name'; END IF;
  IF length(btrim(coalesce(p_contact_name, ''))) < 3 OR length(regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g')) < 9 THEN
    RAISE EXCEPTION 'Please enter your name and cell number so the association can contact you';
  END IF;
  SELECT id INTO v_link FROM public.junior_reg_links WHERE token = btrim(p_token);
  IF (SELECT count(*) FROM public.junior_reg_requests WHERE link_id = v_link AND kind = 'missing_club'
        AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Too many requests right now. Please try again later.';
  END IF;
  INSERT INTO public.junior_reg_requests (org_id, link_id, kind, requester_user_id, missing_club_name, missing_club_town,
    contact_name, contact_phone, contact_email)
  VALUES (v_org, v_link, 'missing_club', auth.uid(), left(btrim(p_club_name), 120), left(nullif(btrim(coalesce(p_town, '')), ''), 80),
    left(btrim(p_contact_name), 120), left(btrim(p_contact_phone), 30), left(nullif(lower(btrim(coalesce(p_contact_email, ''))), ''), 254))
  RETURNING id INTO v_req;
  PERFORM public._junior_notify_request(v_req);
  RETURN jsonb_build_object('status', 'sent');
END $$;

-- ---------- review ----------
CREATE OR REPLACE FUNCTION public._junior_can_review(_uid uuid, _req uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.junior_reg_requests r WHERE r.id = _req AND (
    public._junior_can_lead(_uid, r.org_id)
    OR EXISTS (SELECT 1 FROM public.junior_body_settings s WHERE r.club_id IN (SELECT club_id FROM public._junior_body_clubs(s.org_id))
                 AND public._junior_can_lead(_uid, s.org_id))
    OR (r.club_id IS NOT NULL AND (public.is_club_admin(_uid, r.club_id) OR public.has_club_permission(_uid, r.club_id, 'members.approve')))));
$$;
REVOKE ALL ON FUNCTION public._junior_can_review(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.junior_reg_list(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public._junior_can_lead(v_uid, p_org) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'status') = 'pending' DESC, x->>'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'club_id', r.club_id, 'club_name', c.name, 'junior_name', r.junior_name, 'gender', r.gender,
      'age_group', public._junior_age_group(coalesce(r.date_of_birth, pp.date_of_birth)),
      'parent_name', r.parent_name, 'parent_phone', r.parent_phone, 'parent_email', r.parent_email, 'consent', r.consent_at IS NOT NULL,
      'nsa_number', r.nsa_number, 'missing_club_name', r.missing_club_name, 'missing_club_town', r.missing_club_town,
      'contact_name', r.contact_name, 'contact_phone', r.contact_phone, 'contact_email', r.contact_email,
      'status', CASE
        WHEN r.status = 'pending' AND r.kind IN ('new','existing_unlisted') AND m.id IS NOT NULL AND m.status::text = 'resigned' THEN 'declined'
        WHEN r.status = 'pending' AND r.kind IN ('new','existing_unlisted') AND m.id IS NOT NULL AND NOT coalesce(m.is_pending_approval, false) THEN 'approved'
        ELSE r.status END,
      'decided_by', dp.name, 'decided_at', r.decided_at, 'decline_reason', r.decline_reason,
      'via', lo.name, 'created_at', r.created_at) AS x
    FROM public.junior_reg_requests r
    LEFT JOIN public.clubs c ON c.id = r.club_id
    LEFT JOIN public.club_members m ON m.id = r.club_member_id
    LEFT JOIN public.people_private pp ON pp.person_id = m.person_id
    LEFT JOIN public.profiles dp ON dp.id = r.decided_by
    LEFT JOIN public.organisations lo ON lo.id = r.org_id
    WHERE r.org_id = p_org
       OR r.club_id IN (SELECT club_id FROM public._junior_body_clubs(p_org))
       OR r.org_id IN (SELECT d.org_id FROM public.org_grouping_descendants(p_org) d)) s);
END $$;

CREATE OR REPLACE FUNCTION public.junior_reg_decide(p_request_id uuid, p_approve boolean, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r record; m record;
  v_claims text := current_setting('request.jwt.claims', true); v_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF v_uid IS NULL OR NOT public._junior_can_review(v_uid, p_request_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.junior_reg_requests WHERE id = p_request_id FOR UPDATE;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been decided'; END IF;
  IF NOT p_approve AND length(btrim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Please give a short reason'; END IF;
  SELECT * INTO m FROM public.club_members WHERE id = r.club_member_id;

  -- The junior-leader / club check above is the authority for these member changes.
  IF r.club_id IS NOT NULL AND NOT public.is_club_admin(v_uid, r.club_id) THEN
    PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
  END IF;
  IF r.kind IN ('new', 'existing_unlisted') AND m.id IS NOT NULL THEN
    IF p_approve THEN
      IF m.status::text = 'resigned' THEN RAISE EXCEPTION 'This player was already removed by the club'; END IF;
      UPDATE public.club_members SET is_pending_approval = false, approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, v_uid)
       WHERE id = m.id AND is_pending_approval;
      IF m.person_id IS NOT NULL THEN PERFORM public._junior_mark_player(m.person_id, v_uid); END IF;
    ELSIF coalesce(m.is_pending_approval, false) THEN
      UPDATE public.club_members SET status = 'resigned', is_pending_approval = false WHERE id = m.id;
    END IF;
  ELSIF r.kind = 'claim' AND m.id IS NOT NULL AND p_approve THEN
    IF m.user_id IS NOT NULL AND m.user_id <> r.requester_user_id THEN RAISE EXCEPTION 'This profile is already linked to another login'; END IF;
    PERFORM set_config('app.tournament_join_link', r.requester_user_id::text, true);
    UPDATE public.club_members SET user_id = r.requester_user_id WHERE id = m.id AND user_id IS NULL;
    PERFORM set_config('app.tournament_join_link', '', true);
    PERFORM public._junior_save_dob(m.person_id, r.date_of_birth);
    IF m.person_id IS NOT NULL THEN PERFORM public._junior_mark_player(m.person_id, v_uid); END IF;
  END IF;
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

  UPDATE public.junior_reg_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END, decided_by = v_uid, decided_at = now(),
         decline_reason = CASE WHEN p_approve THEN NULL ELSE left(btrim(p_reason), 500) END,
         date_of_birth = NULL
   WHERE id = r.id;
  IF r.requester_user_id IS NOT NULL AND r.kind <> 'missing_club' THEN
    INSERT INTO public.notifications (user_id, type, title, message, url, data)
    VALUES (r.requester_user_id, 'junior_registration',
      CASE WHEN p_approve THEN 'Junior registration approved' ELSE 'Junior registration declined' END,
      coalesce(r.junior_name, 'The player') || CASE WHEN p_approve THEN ' is now confirmed.' ELSE ' was not confirmed: ' || btrim(p_reason) END,
      '/', jsonb_build_object('request_id', r.id, 'club_id', r.club_id));
  END IF;
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action, reason)
  VALUES (r.org_id, r.club_id, v_uid, 'junior_reg_request', r.id,
          CASE WHEN p_approve THEN 'junior_registration_approved' ELSE 'junior_registration_declined' END, nullif(btrim(coalesce(p_reason, '')), ''));
  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'approved' ELSE 'declined' END);
END $$;

GRANT EXECUTE ON FUNCTION public.junior_workspace_body(uuid), public.junior_body_confirm_list(uuid, boolean),
  public.junior_link_create(uuid), public.junior_link_revoke(uuid), public.junior_leaders_list(uuid),
  public.junior_leader_add(uuid, text, text, text, uuid), public.junior_leader_remove(uuid, uuid),
  public.junior_join_claim(text, uuid, text, date, text, text, text, boolean),
  public.junior_join_register(text, uuid, text, text, text, date, text, text, text, text, text, boolean, text),
  public.junior_reg_list(uuid), public.junior_reg_decide(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.junior_join_context(text), public.junior_join_find_member(text, uuid, text),
  public.junior_join_missing_club(text, text, text, text, text, text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.junior_workspace_body(uuid), public.junior_body_confirm_list(uuid, boolean),
  public.junior_link_create(uuid), public.junior_link_revoke(uuid), public.junior_leaders_list(uuid),
  public.junior_leader_add(uuid, text, text, text, uuid), public.junior_leader_remove(uuid, uuid),
  public.junior_join_claim(text, uuid, text, date, text, text, text, boolean),
  public.junior_join_register(text, uuid, text, text, text, date, text, text, text, text, text, boolean, text),
  public.junior_reg_list(uuid), public.junior_reg_decide(uuid, boolean, text) FROM PUBLIC, anon;
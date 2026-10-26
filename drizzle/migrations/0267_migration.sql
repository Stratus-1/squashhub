create table public.agm_preview_tokens (
  token_hash bytea primary key,
  ballot_id uuid not null references public.agm_ballots(id) on delete cascade,
  club_member_id uuid not null,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
alter table public.agm_preview_tokens enable row level security;
revoke all on public.agm_preview_tokens from anon, authenticated;
grant all on public.agm_preview_tokens to service_role;

CREATE OR REPLACE FUNCTION public.agm_ballot_for_token(p_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v agm_ballot_voters; b agm_ballots; cm club_members; c clubs; pv agm_preview_tokens;
BEGIN
  SELECT * INTO v FROM agm_ballot_voters WHERE token_hash = digest(coalesce(p_token,''), 'sha256');
  IF v.id IS NULL THEN
    SELECT * INTO pv FROM agm_preview_tokens WHERE token_hash = digest(coalesce(p_token,''), 'sha256') AND expires_at > now();
    IF pv.ballot_id IS NULL THEN RETURN jsonb_build_object('state', 'invalid'); END IF;
    SELECT * INTO b FROM agm_ballots WHERE id = pv.ballot_id;
    SELECT * INTO cm FROM club_members WHERE id = pv.club_member_id;
    SELECT * INTO c FROM clubs WHERE id = b.club_id;
    RETURN jsonb_build_object('state','open','preview',true,
      'title', b.title, 'declaration', b.declaration, 'deadline', b.deadline, 'club_name', c.name,
      'voter', jsonb_build_object('name', cm.name, 'member_number', cm.club_member_number, 'email', cm.email),
      'positions', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title,
        'candidates', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.sort, x.name), '[]')
                        FROM agm_ballot_candidates x WHERE x.position_id = p.id)) ORDER BY p.sort), '[]')
        FROM agm_ballot_positions p WHERE p.ballot_id = b.id));
  END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = v.ballot_id;
  SELECT * INTO cm FROM club_members WHERE id = v.club_member_id;
  SELECT * INTO c FROM clubs WHERE id = b.club_id;
  RETURN jsonb_build_object(
    'state', CASE WHEN v.voted_at IS NOT NULL THEN 'voted' WHEN b.deadline <= now() THEN 'closed' ELSE 'open' END,
    'title', b.title, 'declaration', b.declaration, 'deadline', b.deadline, 'club_name', c.name,
    'voter', jsonb_build_object('name', cm.name, 'member_number', cm.club_member_number, 'email', cm.email),
    'positions', CASE WHEN v.voted_at IS NULL AND b.deadline > now() THEN (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title,
        'candidates', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) ORDER BY x.sort, x.name), '[]')
                        FROM agm_ballot_candidates x WHERE x.position_id = p.id)) ORDER BY p.sort), '[]')
      FROM agm_ballot_positions p WHERE p.ballot_id = b.id) ELSE '[]'::jsonb END);
END $function$;

CREATE OR REPLACE FUNCTION public.agm_invite_for_token(p_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE i agm_invitees; b agm_ballots; cm club_members; c clubs; pv agm_preview_tokens; mid uuid; bid uuid;
BEGIN
  SELECT * INTO i FROM agm_invitees WHERE token_hash = digest(coalesce(p_token,''),'sha256');
  IF i.id IS NULL THEN
    SELECT * INTO pv FROM agm_preview_tokens WHERE token_hash = digest(coalesce(p_token,''), 'sha256') AND expires_at > now();
    IF pv.ballot_id IS NULL THEN RETURN jsonb_build_object('state','invalid'); END IF;
    bid := pv.ballot_id; mid := pv.club_member_id;
  ELSE bid := i.ballot_id; mid := i.club_member_id; END IF;
  SELECT * INTO b FROM agm_ballots WHERE id = bid;
  SELECT * INTO cm FROM club_members WHERE id = mid;
  SELECT * INTO c FROM clubs WHERE id = b.club_id;
  RETURN jsonb_build_object('state','ok','preview', i.id IS NULL,'title',b.title,'club_name',c.name,'name',cm.name,
    'meeting_at',b.meeting_at,'venue',b.meeting_venue,'details',b.meeting_details,'documents',b.documents,
    'vote_deadline',b.deadline,'rsvp',i.rsvp,
    'locked', i.id IS NULL OR (b.meeting_at IS NOT NULL AND b.meeting_at <= now()));
END $function$;
create or replace function public.tournament_entrant_directory(p_tournament_id uuid)
returns table (
  member_id uuid,
  display_name text,
  club_id uuid,
  club_name text,
  gender text,
  ladder_position integer,
  ranking_points numeric,
  is_own_club boolean,
  invite_status text,
  is_user boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select id, club_id from public.tournaments where id = p_tournament_id
  ),
  ids as (
    select distinct m.mid from (
      select e.club_member_id as mid from public.club_champs_entries e where e.champ_id = p_tournament_id
      union
      select e.partner_member_id from public.club_champs_entries e where e.champ_id = p_tournament_id and e.partner_member_id is not null
      union
      select r.club_member_id from public.club_champs_registrations r where r.champ_id = p_tournament_id
      union
      select r.partner_member_id from public.club_champs_registrations r where r.champ_id = p_tournament_id and r.partner_member_id is not null
    ) m
  )
  select
    cm.id,
    coalesce(cm.name, 'Unknown player')::text,
    cm.club_id,
    c.name::text,
    cm.gender::text,
    cm.ladder_position,
    null::numeric,
    (cm.club_id = (select club_id from t)),
    (select r.status::text from public.club_champs_registrations r
      where r.champ_id = p_tournament_id and r.club_member_id = cm.id limit 1),
    (cm.user_id is not null)
  from ids
  join public.club_members cm on cm.id = ids.mid
  left join public.clubs c on c.id = cm.club_id
  where public.can_manage_tournament(p_tournament_id);
$$;

revoke execute on function public.tournament_entrant_directory(uuid) from anon, public;
grant execute on function public.tournament_entrant_directory(uuid) to authenticated;
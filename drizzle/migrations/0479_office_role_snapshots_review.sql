
-- Snapshot store: every person's exact rights before any change, for one-click restore.
create table public.club_permission_snapshots (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id),
  club_member_id uuid not null references public.club_members(id),
  member_role text,
  is_full_admin boolean,
  custom_permissions text[],
  permission_role_id uuid,
  role_name text,
  role_permissions text[],
  role_is_full_admin boolean,
  taken_by uuid,
  taken_at timestamptz not null default now(),
  reason text
);

grant select, insert on public.club_permission_snapshots to authenticated;
grant all on public.club_permission_snapshots to service_role;

alter table public.club_permission_snapshots enable row level security;

create policy "club_permission_snapshots_select" on public.club_permission_snapshots
  for select to authenticated
  using (public.is_club_admin_or_permitted(auth.uid(), club_id, 'users'));

create policy "club_permission_snapshots_insert" on public.club_permission_snapshots
  for insert to authenticated
  with check (public.is_club_admin_or_permitted(auth.uid(), club_id, 'users'));

-- Default permission sets for office-bearer roles.
create or replace function public.office_role_defaults(_role_name text)
returns text[]
language sql immutable
as $$
  select case _role_name
    -- Chairman / Vice-Chairman: everything in the club except finance writes
    -- (finance stays view-only; banking/gateway configuration stays allowed).
    when 'Chairman' then array['club','settings','fees','courts','banking','finance.view','members','users','visitors','ladder','leagues','champs','events','bar','access','devices','communications','affiliation','bookings_others','documents','agm']
    when 'Vice-Chairman' then array['club','settings','fees','courts','banking','finance.view','members','users','visitors','ladder','leagues','champs','events','bar','access','devices','communications','affiliation','bookings_others','documents','agm']
    when 'Treasurer' then array['finance','banking','fees','members.view','documents','agm']
    when 'Secretary' then array['club','members','communications','events','visitors','documents','agm']
    when 'Club Captain' then array['leagues','ladder','champs','bookings_others']
    when 'Bar Manager' then array['bar']
    else null
  end
$$;

-- Map a club_offices.office value to a role template name.
create or replace function public.office_to_role_name(_office text)
returns text
language sql immutable
as $$
  select case lower(replace(coalesce(_office,''), '_', '-'))
    when 'chairman' then 'Chairman'
    when 'vice-chairman' then 'Vice-Chairman'
    when 'treasurer' then 'Treasurer'
    when 'secretary' then 'Secretary'
    when 'captain' then 'Club Captain'
    when 'club-captain' then 'Club Captain'
    when 'bar-manager' then 'Bar Manager'
    else null
  end
$$;

-- Snapshot everyone in a club who has any permission record or the admin club role.
create or replace function public.snapshot_club_permissions(p_club_id uuid, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'users') then
    raise exception 'Not allowed';
  end if;

  insert into public.club_permission_snapshots (
    club_id, club_member_id, member_role, is_full_admin, custom_permissions,
    permission_role_id, role_name, role_permissions, role_is_full_admin, taken_by, reason
  )
  select
    cm.club_id, cm.id, cm.role, cmp.is_full_admin, cmp.custom_permissions,
    cmp.permission_role_id, r.role_name, r.permissions, r.is_full_admin,
    auth.uid(), coalesce(p_reason, 'pre-office-role-change')
  from public.club_members cm
  left join public.club_member_permissions cmp on cmp.club_member_id = cm.id
  left join public.club_permission_roles r on r.id = cmp.permission_role_id
  where cm.club_id = p_club_id
    and (cm.role = 'admin' or cmp.id is not null);

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- Review list: per person, office, current rights, proposed role and what they used recently.
create or replace function public.club_permission_review(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'users') then
    raise exception 'Not allowed';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'club_member_id', cm.id,
      'name', cm.name,
      'member_role', cm.role,
      'offices', coalesce((
        select jsonb_agg(o.office) from public.club_offices o
        where o.club_member_id = cm.id and o.ended_at is null
      ), '[]'::jsonb),
      'current', jsonb_build_object(
        'is_full_admin', coalesce(cmp.is_full_admin, false) or coalesce(r.is_full_admin, false) or cm.role = 'admin',
        'role_name', r.role_name,
        'role_permissions', coalesce(r.permissions, '{}'::text[]),
        'custom_permissions', coalesce(cmp.custom_permissions, '{}'::text[])
      ),
      'proposed_role', coalesce(
        (select public.office_to_role_name(o.office) from public.club_offices o
         where o.club_member_id = cm.id and o.ended_at is null
           and public.office_to_role_name(o.office) is not null
         order by o.started_at desc nulls last limit 1),
        case when public.office_role_defaults(r.role_name) is not null then r.role_name end
      ),
      'used_90d', jsonb_build_object(
        'finance_changes', (select count(*) from public.club_journal_entry_changes cj
          where cj.club_member_id = cm.id and cj.created_at > now() - interval '90 days'),
        'comms_campaigns', (select count(*) from public.comms_campaigns cc
          where cc.created_by = cm.user_id and cc.created_at > now() - interval '90 days'),
        'cash_ups', (select count(*) from public.bar_cash_ups bc
          where bc.actor_user_id = cm.user_id and bc.created_at > now() - interval '90 days')
      )
    ) order by cm.name)
    from public.club_members cm
    left join public.club_member_permissions cmp on cmp.club_member_id = cm.id
    left join public.club_permission_roles r on r.id = cmp.permission_role_id
    where cm.club_id = p_club_id
      and (cm.role = 'admin' or cmp.id is not null)
  ), '[]'::jsonb);
end
$$;

-- Create or update the club's office-bearer role templates to the agreed defaults.
create or replace function public.ensure_office_role_templates(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'users') then
    raise exception 'Not allowed';
  end if;

  foreach v_name in array array['Chairman','Vice-Chairman','Treasurer','Secretary','Club Captain','Bar Manager']
  loop
    insert into public.club_permission_roles (club_id, role_name, permissions, is_full_admin)
    values (p_club_id, v_name, public.office_role_defaults(v_name), false)
    on conflict (club_id, role_name)
    do update set permissions = excluded.permissions, is_full_admin = false, updated_at = now();
  end loop;
end
$$;

-- Move one person onto an office role: snapshot first, then assign the template and
-- clear personal full-admin/custom ticks. p_keep_club_admin keeps their club admin status.
create or replace function public.apply_office_role(p_club_member_id uuid, p_role_name text, p_keep_club_admin boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_role_id uuid;
begin
  select club_id into v_club from public.club_members where id = p_club_member_id;
  if v_club is null then raise exception 'Member not found'; end if;
  if not public.is_club_admin_or_permitted(auth.uid(), v_club, 'users') then
    raise exception 'Not allowed';
  end if;
  if public.office_role_defaults(p_role_name) is null then
    raise exception 'Unknown office role %', p_role_name;
  end if;

  perform public.snapshot_club_permissions(v_club, 'apply office role: ' || p_role_name);
  perform public.ensure_office_role_templates(v_club);

  select id into v_role_id from public.club_permission_roles
  where club_id = v_club and role_name = p_role_name;

  insert into public.club_member_permissions (club_member_id, permission_role_id, custom_permissions, is_full_admin)
  values (p_club_member_id, v_role_id, '{}'::text[], false)
  on conflict (club_member_id)
  do update set permission_role_id = v_role_id, custom_permissions = '{}'::text[],
    is_full_admin = false, updated_at = now();

  if not p_keep_club_admin then
    update public.club_members set role = 'member'
    where id = p_club_member_id and role = 'admin';
  end if;
end
$$;

-- Restore one person from a snapshot.
create or replace function public.restore_permission_snapshot(p_snapshot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.club_permission_snapshots%rowtype;
begin
  select * into s from public.club_permission_snapshots where id = p_snapshot_id;
  if s.id is null then raise exception 'Snapshot not found'; end if;
  if not public.is_club_admin_or_permitted(auth.uid(), s.club_id, 'users') then
    raise exception 'Not allowed';
  end if;

  if s.permission_role_id is not null or s.is_full_admin or coalesce(array_length(s.custom_permissions, 1), 0) > 0 then
    insert into public.club_member_permissions (club_member_id, permission_role_id, custom_permissions, is_full_admin)
    values (s.club_member_id, s.permission_role_id, coalesce(s.custom_permissions, '{}'::text[]), coalesce(s.is_full_admin, false))
    on conflict (club_member_id)
    do update set permission_role_id = excluded.permission_role_id,
      custom_permissions = excluded.custom_permissions,
      is_full_admin = excluded.is_full_admin, updated_at = now();
  else
    delete from public.club_member_permissions where club_member_id = s.club_member_id;
  end if;

  if s.member_role is not null then
    update public.club_members set role = s.member_role where id = s.club_member_id;
  end if;
end
$$;

revoke all on function public.office_role_defaults(text) from public, anon;
revoke all on function public.office_to_role_name(text) from public, anon;
revoke all on function public.snapshot_club_permissions(uuid, text) from public, anon;
revoke all on function public.club_permission_review(uuid) from public, anon;
revoke all on function public.ensure_office_role_templates(uuid) from public, anon;
revoke all on function public.apply_office_role(uuid, text, boolean) from public, anon;
revoke all on function public.restore_permission_snapshot(uuid) from public, anon;
grant execute on function public.office_role_defaults(text) to authenticated;
grant execute on function public.office_to_role_name(text) to authenticated;
grant execute on function public.snapshot_club_permissions(uuid, text) to authenticated;
grant execute on function public.club_permission_review(uuid) to authenticated;
grant execute on function public.ensure_office_role_templates(uuid) to authenticated;
grant execute on function public.apply_office_role(uuid, text, boolean) to authenticated;
grant execute on function public.restore_permission_snapshot(uuid) to authenticated;

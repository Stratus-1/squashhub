create or replace function public.booking_permission_slugs()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['bookings_unlimited','bookings_unlimited_non_peak','ops_booking','bookings_others']::text[]
$$;

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
    do update set
      -- Keep any court-booking permissions the club already gave this role.
      permissions = array(
        select distinct x from unnest(
          excluded.permissions
          || array(select b from unnest(club_permission_roles.permissions) b
                   where b = any(public.booking_permission_slugs()))
        ) x
      ),
      is_full_admin = false,
      updated_at = now();
  end loop;
end
$$;

create or replace function public.apply_office_role(p_club_member_id uuid, p_role_name text, p_keep_club_admin boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_role_id uuid;
  v_keep text[];
  v_role_perms text[];
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

  -- Court-booking permissions the person holds today (personally or via their current role).
  select array(
    select distinct b from unnest(
      coalesce(cmp.custom_permissions, '{}'::text[]) || coalesce(r.permissions, '{}'::text[])
    ) b
    where b = any(public.booking_permission_slugs())
  )
  into v_keep
  from public.club_member_permissions cmp
  left join public.club_permission_roles r on r.id = cmp.permission_role_id
  where cmp.club_member_id = p_club_member_id;

  perform public.ensure_office_role_templates(v_club);

  select id, permissions into v_role_id, v_role_perms from public.club_permission_roles
  where club_id = v_club and role_name = p_role_name;

  -- Only keep personally what the new role doesn't already give.
  v_keep := array(select k from unnest(coalesce(v_keep, '{}'::text[])) k where not (k = any(coalesce(v_role_perms, '{}'::text[]))));

  insert into public.club_member_permissions (club_member_id, permission_role_id, custom_permissions, is_full_admin)
  values (p_club_member_id, v_role_id, v_keep, false)
  on conflict (club_member_id)
  do update set permission_role_id = v_role_id, custom_permissions = v_keep,
    is_full_admin = false, updated_at = now();

  if not p_keep_club_admin then
    update public.club_members set role = 'member'
    where id = p_club_member_id and role = 'admin';
  end if;
end
$$;

revoke execute on function public.booking_permission_slugs() from public, anon;
grant execute on function public.booking_permission_slugs() to authenticated, service_role;

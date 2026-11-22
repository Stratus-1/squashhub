create or replace function public.ensure_office_role_templates(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_target text[];
  r public.club_permission_roles%rowtype;
begin
  if not public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'users') then
    raise exception 'Not allowed';
  end if;

  foreach v_name in array array['Chairman','Vice-Chairman','Treasurer','Secretary','Club Captain','Bar Manager']
  loop
    select * into r from public.club_permission_roles where club_id = p_club_id and role_name = v_name;
    if not found then
      insert into public.club_permission_roles (club_id, role_name, permissions, is_full_admin)
      values (p_club_id, v_name, public.office_role_defaults(v_name), false);
      continue;
    end if;
    -- Defaults plus any court-booking permissions the club already gave this role.
    v_target := array(
      select distinct x from unnest(
        public.office_role_defaults(v_name)
        || array(select b from unnest(r.permissions) b where b = any(public.booking_permission_slugs()))
      ) x
    );
    -- Write only when something actually changes.
    if coalesce(r.is_full_admin, false)
       or not (coalesce(r.permissions, '{}'::text[]) @> v_target and v_target @> coalesce(r.permissions, '{}'::text[])) then
      update public.club_permission_roles
      set permissions = v_target, is_full_admin = false, updated_at = now()
      where id = r.id;
    end if;
  end loop;
end
$$;
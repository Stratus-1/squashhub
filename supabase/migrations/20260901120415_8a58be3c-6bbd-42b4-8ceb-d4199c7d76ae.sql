
create or replace function public.stjohns_first_member_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub text;
begin
  select subdomain into v_sub from public.clubs where id = new.club_id;
  if v_sub is distinct from 'stjohns' then
    return new;
  end if;

  if new.role = 'visitor'::public.club_member_role then
    return new;
  end if;

  if not exists (
    select 1 from public.club_members m
    where m.club_id = new.club_id
      and m.role = 'admin'::public.club_member_role
  ) then
    new.role := 'admin'::public.club_member_role;
    new.is_pending_approval := false;
    new.approved_at := now();
    new.status := 'active'::public.member_status;
  end if;

  return new;
end;
$$;

drop trigger if exists zz_stjohns_first_member_admin on public.club_members;
create trigger zz_stjohns_first_member_admin
before insert on public.club_members
for each row execute function public.stjohns_first_member_admin();

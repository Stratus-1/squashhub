alter table public.club_devices
  add column if not exists output_inverted boolean not null default false;

alter table public.club_secrets
  add column if not exists shelly_door_inverted boolean not null default false;

update public.club_secrets
set shelly_door_inverted = true
where club_id in (select id from public.clubs where name ilike '%nelspruit%');
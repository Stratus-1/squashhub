-- Rounds always belong to their league's season: link automatically when the
-- creator didn't pass a season (exactly one season of that league covers the date).
create or replace function public.league_rounds_autolink_season()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int;
begin
  if new.season_id is null and new.association_id is not null and new.round_date is not null then
    select min(s.id::text)::uuid, count(*) into v_id, v_n
    from league_seasons s
    where s.association_id = new.association_id
      and new.round_date::date between coalesce(s.starts_on, make_date(s.season_year,1,1))
                                   and coalesce(s.ends_on, make_date(s.season_year,12,31));
    if v_n = 1 then new.season_id := v_id; end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_league_rounds_autolink_season on public.league_rounds;
create trigger trg_league_rounds_autolink_season
before insert or update of round_date, association_id, season_id on public.league_rounds
for each row execute function public.league_rounds_autolink_season();

-- Backfill: touch unlinked rounds so the trigger links them (derived link only).
update public.league_rounds set round_date = round_date where season_id is null;
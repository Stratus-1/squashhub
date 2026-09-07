create or replace function public.club_ranked_match_counts(_club_id uuid)
returns table(member_id uuid, matches integer)
language sql
stable
security definer
set search_path = public
as $$
  select l.member_id, count(*)::int as matches
  from public.ranking_points_ledger l
  where l.club_id = _club_id
    and coalesce(l.source_type, '') <> 'adjustment'
  group by l.member_id
$$;

revoke all on function public.club_ranked_match_counts(uuid) from public, anon;
grant execute on function public.club_ranked_match_counts(uuid) to authenticated, service_role;
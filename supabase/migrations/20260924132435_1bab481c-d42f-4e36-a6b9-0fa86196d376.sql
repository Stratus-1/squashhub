
create or replace function public.ai_apply_champ_repair(p_champ uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c jsonb; m public.club_champs_matches; snap jsonb := '[]'::jsonb; dup int;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'not allowed'; end if;
  perform 1 from public.club_champs_matches where champ_id = p_champ for update;
  for c in select * from jsonb_array_elements(p_changes) loop
    select * into m from public.club_champs_matches where id = (c->>'match_id')::uuid and champ_id = p_champ;
    if not found then raise exception 'match % not in tournament', c->>'match_id'; end if;
    if not public._champ_row_unlocked(m) then raise exception 'match % has started or been scored', m.id; end if;
    if nullif(c->>'expect_updated_at','') is not null and m.updated_at is distinct from (c->>'expect_updated_at')::timestamptz then
      raise exception 'stale plan for match %', m.id;
    end if;
    snap := snap || jsonb_build_array(jsonb_build_object('op', c->>'op', 'row', to_jsonb(m)));
    if c->>'op' = 'delete_unplayed' then
      if m.stage <> 'group' then raise exception 'only pool games may be removed'; end if;
      delete from public.club_champs_matches where id = m.id;
    elsif c->>'op' in ('set_sides','clear_sides') then
      update public.club_champs_matches set
        player_a_member_id = nullif(c->'after'->>'player_a_member_id','')::uuid,
        partner_a_member_id = nullif(c->'after'->>'partner_a_member_id','')::uuid,
        player_b_member_id = nullif(c->'after'->>'player_b_member_id','')::uuid,
        partner_b_member_id = nullif(c->'after'->>'partner_b_member_id','')::uuid,
        updated_at = now()
      where id = m.id;
    else raise exception 'unknown op %', c->>'op';
    end if;
  end loop;
  select count(*) into dup from (
    select group_number, pid from (
      select group_number, unnest(array[player_a_member_id, partner_a_member_id, player_b_member_id, partner_b_member_id]) pid
      from public.club_champs_matches where champ_id = p_champ and stage = 'playoff_final') x
    where pid is not null group by 1,2 having count(*) > 1) d;
  if dup > 0 then raise exception 'repair would leave a duplicated playoff team'; end if;
  return snap;
end $$;
revoke all on function public.ai_apply_champ_repair(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_apply_champ_repair(uuid, jsonb) to service_role;


create or replace function public._champ_row_unlocked(m public.club_champs_matches)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(m.status,'scheduled') = 'scheduled'
    and coalesce(btrim(m.score),'') = ''
    and m.winner_member_id is null
    and m.side_a_points is null and m.side_b_points is null
    and (m.game_scores is null or m.game_scores !~ '"sets"\s*:\s*\[\s*\{')
$$;

-- Applies a deterministic tournament repair computed by the integrity engine.
-- Service role only (the ai-help function resolves requester scope first).
-- Refuses any started/scored row or stale row; verifies no team is duplicated
-- across playoff slots before committing. Returns the full before-image.
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
    if c ? 'expect_updated_at' and c->>'expect_updated_at' is not null and m.updated_at::text <> c->>'expect_updated_at'
       and to_jsonb(m.updated_at)->>0 <> c->>'expect_updated_at' then
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
  -- Invariant: a player appears at most once per division's playoff slots.
  select count(*) into dup from (
    select group_number, pid from (
      select group_number, unnest(array[player_a_member_id, partner_a_member_id, player_b_member_id, partner_b_member_id]) pid
      from public.club_champs_matches where champ_id = p_champ and stage = 'playoff_final') x
    where pid is not null group by 1,2 having count(*) > 1) d;
  if dup > 0 then raise exception 'repair would leave a duplicated playoff team'; end if;
  return snap;
end $$;

-- Restores a before-image, only for rows that are still unstarted/unscored.
create or replace function public.ai_rollback_champ_repair(p_champ uuid, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e jsonb; r jsonb; m public.club_champs_matches; restored int := 0; skipped int := 0;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'not allowed'; end if;
  for e in select * from jsonb_array_elements(p_snapshot) loop
    r := e->'row';
    if (r->>'champ_id')::uuid <> p_champ then continue; end if;
    select * into m from public.club_champs_matches where id = (r->>'id')::uuid;
    if e->>'op' = 'delete_unplayed' then
      if not found then insert into public.club_champs_matches select * from jsonb_populate_record(null::public.club_champs_matches, r); restored := restored + 1;
      else skipped := skipped + 1; end if;
    elsif found and public._champ_row_unlocked(m) then
      update public.club_champs_matches set
        player_a_member_id = (r->>'player_a_member_id')::uuid, partner_a_member_id = (r->>'partner_a_member_id')::uuid,
        player_b_member_id = (r->>'player_b_member_id')::uuid, partner_b_member_id = (r->>'partner_b_member_id')::uuid, updated_at = now()
      where id = m.id;
      restored := restored + 1;
    else skipped := skipped + 1; end if;
  end loop;
  return jsonb_build_object('restored', restored, 'skipped', skipped);
end $$;

revoke all on function public.ai_apply_champ_repair(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ai_rollback_champ_repair(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_apply_champ_repair(uuid, jsonb) to service_role;
grant execute on function public.ai_rollback_champ_repair(uuid, jsonb) to service_role;

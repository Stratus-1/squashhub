
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
          where cj.club_member_id = cm.id and cj.changed_at > now() - interval '90 days'),
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

create or replace function public.club_cancel_subscription(_club_id uuid, _reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _old text;
  _name text;
begin
  if not (public.is_club_admin(auth.uid(), _club_id) or public.has_role(auth.uid(), 'admin'::app_role)) then
    raise exception 'Not authorised to cancel this subscription';
  end if;

  select status into _old from public.club_subscriptions where club_id = _club_id;
  if _old is null then
    raise exception 'No subscription found for this club';
  end if;
  if _old = 'cancelled' then
    return jsonb_build_object('status','cancelled','already',true);
  end if;

  update public.club_subscriptions
     set status = 'cancelled', cancelled_at = now(), updated_at = now()
   where club_id = _club_id;

  select coalesce(name, 'Club admin') into _name
    from public.club_members
   where club_id = _club_id and user_id = auth.uid()
   limit 1;

  insert into public.club_billing_audit (club_id, field, old_value, new_value, changed_by, changed_by_name)
  values (_club_id, 'subscription_status', _old, 'cancelled', auth.uid(),
          coalesce(_name,'Club admin') || case when _reason is null or _reason = '' then '' else ' — ' || _reason end);

  return jsonb_build_object('status','cancelled','already',false);
end;
$$;

revoke all on function public.club_cancel_subscription(uuid, text) from public;
grant execute on function public.club_cancel_subscription(uuid, text) to authenticated;
grant execute on function public.club_cancel_subscription(uuid, text) to service_role;
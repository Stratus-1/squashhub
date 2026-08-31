create or replace function public.send_tournament_invites_via_platform(
  p_champ_id uuid,
  p_limit integer,
  p_key text,
  p_functions_url text,
  p_club_host text,
  p_club_name text,
  p_tournament_name text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select reg.id, reg.invite_token, m.name, lower(m.email) as email
    from public.club_champs_registrations reg
    join public.club_members m on m.id = reg.club_member_id
    left join public.tournament_invite_platform_sends s on s.registration_id = reg.id
    where reg.champ_id = p_champ_id
      and reg.status = 'invited'
      and reg.invite_revoked_at is null
      and reg.invite_token is not null
      and coalesce(m.email, '') like '%@%'
      and s.id is null
    order by m.name
    limit greatest(p_limit, 0)
  loop
    perform net.http_post(
      url := p_functions_url || '/send-tournament-invite-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || p_key,
        'apikey', p_key
      ),
      body := jsonb_build_object(
        'recipientEmail', r.email,
        'idempotencyKey', 'tinvite-platform-' || r.id::text,
        'templateData', jsonb_build_object(
          'clubName', p_club_name,
          'title', 'Tournament invitation: ' || p_tournament_name,
          'recipientName', r.name,
          'messageBody', 'You are invited to enter ' || p_tournament_name || '.' || chr(10) ||
            'Tap the button below to choose your divisions and confirm your entry.' || chr(10) ||
            'Players arrange their own match times with their opponents.',
          'url', 'https://' || p_club_host || '/i/' || r.invite_token,
          'ctaLabel', 'Enter the tournament'
        )
      )
    );

    insert into public.tournament_invite_platform_sends (registration_id, champ_id, recipient_email)
    values (r.id, p_champ_id, r.email)
    on conflict (registration_id) do nothing;

    n := n + 1;
  end loop;

  return n;
end;
$$;

revoke all on function public.send_tournament_invites_via_platform(uuid, integer, text, text, text, text, text) from public;
revoke all on function public.send_tournament_invites_via_platform(uuid, integer, text, text, text, text, text) from anon;
revoke all on function public.send_tournament_invites_via_platform(uuid, integer, text, text, text, text, text) from authenticated;
create table if not exists public.paynow_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  user_id uuid not null,
  amount numeric not null,
  currency text not null default 'USD',
  purpose text not null check (purpose in ('fee','topup','tournament')),
  fee_ids uuid[] not null default '{}',
  champ_registration_id uuid,
  description text,
  status text not null default 'created',
  paynow_reference text,
  paynow_poll_url text,
  paynow_redirect_url text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists paynow_sessions_member_idx on public.paynow_payment_sessions (club_member_id, created_at desc);
create index if not exists paynow_sessions_user_pending_idx on public.paynow_payment_sessions (user_id, status, created_at desc);

grant select on public.paynow_payment_sessions to authenticated;
grant all on public.paynow_payment_sessions to service_role;

alter table public.paynow_payment_sessions enable row level security;

create policy "Members view own paynow sessions"
on public.paynow_payment_sessions for select to authenticated
using (
  user_id = auth.uid()
  or club_member_id in (select id from public.club_members where user_id = auth.uid())
);

create policy "Club admins view paynow sessions"
on public.paynow_payment_sessions for select to authenticated
using (
  club_id in (
    select club_id from public.club_members
    where user_id = auth.uid() and role = 'admin'::public.club_member_role
  )
);
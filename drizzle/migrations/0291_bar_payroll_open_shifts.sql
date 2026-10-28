create or replace function public._bar_staff_hours_open(_club uuid, _staff uuid, _from timestamptz, _to timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(greatest(extract(epoch from (least(coalesce(ended_at,_to),_to)-greatest(paid_start,_from))),0)/3600),0)
  from bar_staff_attendance
  where club_id=_club and staff_id=_staff and paid_start<_to and coalesce(ended_at,_to)>_from
$$;

create or replace function public._bar_staff_shift_count_open(_club_id uuid, _staff_id uuid, _from timestamptz, _to timestamptz)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    select count(*) from bar_staff_attendance a
    where a.club_id=_club_id and a.staff_id=_staff_id
      and (
        (a.ended_at is not null and a.ended_at > greatest(a.paid_start,_from) and a.paid_start < _to)
        or (a.ended_at is null and a.paid_start >= _from and a.paid_start < _to)
      )
  ) + (
    select count(distinct (s.created_at at time zone 'Africa/Johannesburg')::date)
    from bar_counter_sessions s
    where s.club_id=_club_id and s.device_id=_staff_id and s.created_at>=_from and s.created_at<_to
      and not exists(select 1 from bar_staff_attendance a where a.session_id=s.id)
  )::integer
$$;

create or replace function public.bar_prepare_payroll_run_now(_club_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r uuid; v_period date; v_since timestamptz; v_status text;
begin
  if not coalesce((public.is_club_admin_or_permitted(auth.uid(),_club_id,'bar') or public.has_club_permission(auth.uid(),_club_id,'finance') or public.has_role(auth.uid(),'admin')),false) then
    raise exception 'Bar or finance permission required';
  end if;
  perform pg_advisory_xact_lock(hashtext('bar_cash_up:'||_club_id));
  v_period := date_trunc('month',(now() at time zone 'Africa/Johannesburg')::date)::date;
  select id, status into r, v_status from bar_payroll_runs where club_id=_club_id and period=v_period;
  if v_status = 'confirmed' then raise exception 'This month''s payout has already been processed'; end if;
  if r is not null then return r; end if;
  v_since := public._bar_payroll_since(_club_id);
  insert into bar_payroll_runs(club_id,period,attendance_cutoff) values(_club_id,v_period,now()) returning id into r;
  insert into bar_payroll_run_lines(run_id,club_id,staff_id,staff_name,salary,tips,pay_basis,shifts,shift_rate,shifts_from,calculated_salary,hours,hourly_rate)
  select r,x.club_id,x.id,x.label,x.pay,x.tips,x.basis,x.shifts,x.rate,v_since,x.pay,x.hours,x.hourly_rate from (
   select d.club_id,d.id,d.label,coalesce(sal.pay_basis,'monthly') basis,
     case when sal.pay_basis='shift' then public._bar_staff_shift_count_open(d.club_id,d.id,v_since,now()) end shifts,
     case when sal.pay_basis='shift' then sal.shift_rate end rate,
     public._bar_staff_hours_open(d.club_id,d.id,v_since,now()) hours, sal.hourly_rate,
     case when sal.pay_basis='hourly' then round(sal.hourly_rate*public._bar_staff_hours_open(d.club_id,d.id,v_since,now()),2)
          when sal.pay_basis='shift' then round(sal.shift_rate*public._bar_staff_shift_count_open(d.club_id,d.id,v_since,now()),2)
          else coalesce(sal.monthly_salary,0) end pay,
     greatest(coalesce(t.a,0)-coalesce(p.a,0),0) tips
   from bar_counter_devices d left join bar_staff_salaries sal on sal.club_id=d.club_id and sal.staff_id=d.id
   left join(select bt.staff_id,sum(bt.amount) a from bar_staff_tip_earnings bt where bt.club_id=_club_id and bt.status='earned' group by bt.staff_id)t on t.staff_id=d.id
   left join(select bp.staff_id,sum(bp.amount) a from bar_tip_payouts bp where bp.club_id=_club_id group by bp.staff_id)p on p.staff_id=d.id
   where d.club_id=_club_id and d.active and nullif(btrim(d.label),'') is not null) x
  where x.pay>0 or x.tips>0 or (x.basis='shift' and coalesce(x.rate,0)>0) or (x.basis='hourly' and coalesce(x.hourly_rate,0)>0);
  return r;
end $function$;

create or replace function public._bar_prepare_payroll_runs()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$ declare s record;r uuid;v_today date;v_period date;v_last_day integer;v_since timestamptz;made integer:=0; begin
 v_today:=(now() at time zone 'Africa/Johannesburg')::date; v_period:=date_trunc('month',v_today)::date;
 v_last_day:=extract(day from (date_trunc('month',v_today)::date + interval '1 month' - interval '1 day'))::integer;
 for s in select cbs.club_id, cbs.staff_payday from club_bar_settings cbs where cbs.staff_payday is not null and extract(day from v_today)>=least(cbs.staff_payday,v_last_day) loop
  if exists(select 1 from bar_payroll_runs bpr where bpr.club_id=s.club_id and bpr.period=v_period) then continue; end if;
  v_since:=public._bar_payroll_since(s.club_id);
  insert into bar_payroll_runs(club_id,period,attendance_cutoff) values(s.club_id,v_period,now()) on conflict(club_id,period) do nothing returning id into r;
  if r is null then continue; end if;
  insert into bar_payroll_run_lines(run_id,club_id,staff_id,staff_name,salary,tips,pay_basis,shifts,shift_rate,shifts_from,calculated_salary,hours,hourly_rate)
  select r,x.club_id,x.id,x.label,x.pay,x.tips,x.basis,x.shifts,x.rate,v_since,x.pay,x.hours,x.hourly_rate from (
   select d.club_id,d.id,d.label,coalesce(sal.pay_basis,'monthly') basis,
     case when sal.pay_basis='shift' then public._bar_staff_shift_count_open(d.club_id,d.id,v_since,now()) end shifts,
     case when sal.pay_basis='shift' then sal.shift_rate end rate,
     public._bar_staff_hours_open(d.club_id,d.id,v_since,now()) hours, sal.hourly_rate,
     case when sal.pay_basis='hourly' then round(sal.hourly_rate*public._bar_staff_hours_open(d.club_id,d.id,v_since,now()),2)
          when sal.pay_basis='shift' then round(sal.shift_rate*public._bar_staff_shift_count_open(d.club_id,d.id,v_since,now()),2)
          else coalesce(sal.monthly_salary,0) end pay,
     greatest(coalesce(t.a,0)-coalesce(p.a,0),0) tips
   from bar_counter_devices d left join bar_staff_salaries sal on sal.club_id=d.club_id and sal.staff_id=d.id
   left join(select bt.staff_id,sum(bt.amount) a from bar_staff_tip_earnings bt where bt.club_id=s.club_id and bt.status='earned' group by bt.staff_id)t on t.staff_id=d.id
   left join(select bp.staff_id,sum(bp.amount) a from bar_tip_payouts bp where bp.club_id=s.club_id group by bp.staff_id)p on p.staff_id=d.id
   where d.club_id=s.club_id and d.active and nullif(btrim(d.label),'') is not null) x
  where x.pay>0 or x.tips>0 or (x.basis='shift' and coalesce(x.rate,0)>0) or (x.basis='hourly' and coalesce(x.hourly_rate,0)>0);
  made:=made+1; end loop; return made; end $function$;

create or replace function public.bar_staff_pay_overview(_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$ declare v_since timestamptz; begin
 if not coalesce((public.is_club_admin_or_permitted(auth.uid(),_club_id,'bar') or public.has_club_permission(auth.uid(),_club_id,'finance') or public.has_role(auth.uid(),'admin')),false) then raise exception 'Bar or finance permission required'; end if;
 v_since:=public._bar_payroll_since(_club_id);
 return (select jsonb_build_object('payday',s.staff_payday,'shifts_since',v_since,'opening',s.staff_normal_opening,
  'staff',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.label,'pay_basis',coalesce(sal.pay_basis,'monthly'),'salary',coalesce(sal.monthly_salary,0),'shift_rate',coalesce(sal.shift_rate,0),'hourly_rate',coalesce(sal.hourly_rate,0),'hours',public._bar_staff_hours_open(_club_id,d.id,v_since,now()),'shifts',public._bar_staff_shift_count_open(_club_id,d.id,v_since,now()),'earned',coalesce(t.a,0),'paid',coalesce(p.a,0),'remaining',coalesce(t.a,0)-coalesce(p.a,0)) order by d.label)
    from bar_counter_devices d left join bar_staff_salaries sal on sal.club_id=d.club_id and sal.staff_id=d.id
    left join(select bt.staff_id,sum(bt.amount) a from bar_staff_tip_earnings bt where bt.club_id=_club_id and bt.status='earned' group by bt.staff_id)t on t.staff_id=d.id
    left join(select bp.staff_id,sum(bp.amount) a from bar_tip_payouts bp where bp.club_id=_club_id group by bp.staff_id)p on p.staff_id=d.id
    where d.club_id=_club_id and (d.active or t.a is not null or p.a is not null)),'[]'::jsonb),
  'pending_run',(select jsonb_build_object('id',run.id,'period',run.period,'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'staff_id',l.staff_id,'name',l.staff_name,'review',l.review,'salary',l.salary,'tips',l.tips,'hours',l.hours,'hourly_rate',l.hourly_rate,'pay_basis',l.pay_basis,'shifts',l.shifts,'shift_rate',l.shift_rate,'shifts_from',l.shifts_from,'calculated_salary',l.calculated_salary) order by l.staff_name) from bar_payroll_run_lines l where l.run_id=run.id),'[]'::jsonb)) from bar_payroll_runs run where run.club_id=_club_id and run.status='pending' order by run.period desc limit 1),
  'confirmed_runs',coalesce((select jsonb_agg(jsonb_build_object('id',run.id,'period',run.period,'confirmed_at',run.confirmed_at,'lines',(select coalesce(jsonb_agg(jsonb_build_object('name',l.staff_name,'review',l.review,'salary',l.salary,'tips',l.tips,'hours',l.hours,'hourly_rate',l.hourly_rate,'pay_basis',l.pay_basis,'shifts',l.shifts,'shift_rate',l.shift_rate,'calculated_salary',l.calculated_salary) order by l.staff_name),'[]'::jsonb) from bar_payroll_run_lines l where l.run_id=run.id)) order by run.period desc) from (select * from bar_payroll_runs where club_id=_club_id and status='confirmed' order by period desc limit 6) run),'[]'::jsonb))
 from club_bar_settings s where s.club_id=_club_id); end $function$;
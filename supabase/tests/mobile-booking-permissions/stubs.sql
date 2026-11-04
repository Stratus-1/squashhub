CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
CREATE TABLE public.clubs(id uuid PRIMARY KEY, booking_slot_minutes integer DEFAULT 30, booking_open_time time DEFAULT '05:00', booking_last_slot_time time DEFAULT '22:00', suspension_rules jsonb DEFAULT '{}', visitors_can_book boolean DEFAULT false, require_visitor_for_member_booking boolean DEFAULT false, allow_solo_bookings boolean DEFAULT true, max_bookings_per_day integer DEFAULT 1, max_peak_bookings_per_day integer DEFAULT 1, block_back_to_back_bookings boolean DEFAULT true, visitor_booking_fee numeric DEFAULT 50, currency_symbol text DEFAULT 'R', peak_day_overrides jsonb, peak_weekend_start time, peak_weekend_end time, peak_weekday_start time, peak_weekday_end time);
CREATE TABLE public.club_members(id uuid PRIMARY KEY, club_id uuid, user_id uuid, status text DEFAULT 'active', role text DEFAULT 'member', suspension_manual boolean DEFAULT false, suspension_status text DEFAULT 'active');
CREATE TABLE public.courts(id integer PRIMARY KEY, club_id uuid, is_external boolean DEFAULT false);
CREATE TABLE public.bookings(id uuid DEFAULT gen_random_uuid(), club_id uuid, court_id integer, date date, start_time time, end_time time, status text DEFAULT 'active', source text, guest_name text, club_member_id uuid, opponent_member_id uuid);
CREATE TABLE public.club_member_permissions(club_member_id uuid, permission_role_id uuid, is_full_admin boolean DEFAULT false, custom_permissions text[] DEFAULT '{}');
CREATE TABLE public.club_permission_roles(id uuid, permissions text[]);
CREATE FUNCTION public.is_club_chairman(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public.mobile_internal_secret_ok(text) RETURNS boolean LANGUAGE sql AS $$SELECT $1 = 'test-only'$$;
CREATE FUNCTION public.mobile_booking_balance_gate(uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('allowed',coalesce(nullif(current_setting('test.balance_allowed',true),''),'true')::boolean,'shortfall',50)$$;
CREATE OR REPLACE FUNCTION public.is_club_admin_or_permitted(_user_id uuid, _club_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_club_chairman(_user_id,_club_id) OR public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'moderator'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = _club_id
        AND cm.user_id = _user_id
        AND cm.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.club_members cm
      JOIN public.club_member_permissions cmp ON cmp.club_member_id = cm.id
      LEFT JOIN public.club_permission_roles cpr ON cpr.id = cmp.permission_role_id
      WHERE cm.club_id = _club_id
        AND cm.user_id = _user_id
        AND (
          cmp.is_full_admin = true
          OR _permission = ANY(cmp.custom_permissions)
          OR _permission = ANY(cpr.permissions)
        )
    );
$function$

CREATE OR REPLACE FUNCTION public.club_peak_window(_club clubs, _date date, OUT peak_start time without time zone, OUT peak_end time without time zone)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_dow int := EXTRACT(DOW FROM _date)::int; v_o jsonb;
BEGIN
  v_o := COALESCE(_club.peak_day_overrides, '{}'::jsonb) -> v_dow::text;
  IF v_o IS NOT NULL AND jsonb_typeof(v_o) = 'object' THEN
    IF COALESCE((v_o->>'off')::boolean, false) THEN peak_start := NULL; peak_end := NULL; RETURN; END IF;
    IF v_o ? 'start' AND v_o ? 'end' THEN
      peak_start := (v_o->>'start')::time; peak_end := (v_o->>'end')::time; RETURN;
    END IF;
  END IF;
  IF v_dow IN (0,6) THEN
    peak_start := COALESCE(_club.peak_weekend_start, time '08:00'); peak_end := COALESCE(_club.peak_weekend_end, time '12:00');
  ELSE
    peak_start := COALESCE(_club.peak_weekday_start, time '16:00'); peak_end := COALESCE(_club.peak_weekday_end, time '19:00');
  END IF;
END $function$


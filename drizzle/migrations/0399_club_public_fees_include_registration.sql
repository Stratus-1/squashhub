-- Club landing page: also list active once-off registration fees the admin
-- flagged "show on landing" (stored in national_body_fees, fee_type =
-- 'registration'). Same signature, return shape, SECURITY DEFINER and grants.
CREATE OR REPLACE FUNCTION public.get_club_public_fees(_club_id uuid)
 RETURNS TABLE(id uuid, name text, description text, annual_fee numeric, billing_period text, fee_class text, sort_order integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT x.id, x.name, x.description, x.annual_fee, x.billing_period, x.fee_class, x.sort_order
  FROM (
    SELECT f.id, f.name, f.description, f.annual_fee, f.billing_period, f.fee_class, f.sort_order, 0 AS grp
    FROM public.member_fee_categories f
    WHERE f.club_id = _club_id
      AND f.active = true
      AND f.show_on_landing = true
    UNION ALL
    SELECT n.id, trim(n.body_name), NULL::text, n.fee_annual, 'once_off'::text, n.fee_class, 0, 1 AS grp
    FROM public.national_body_fees n
    WHERE n.club_id = _club_id
      AND n.fee_type = 'registration'
      AND n.active IS NOT FALSE
      AND n.show_on_landing = true
      AND COALESCE(n.fee_annual, 0) > 0
  ) x
  ORDER BY x.grp, x.sort_order, x.name;
$function$;
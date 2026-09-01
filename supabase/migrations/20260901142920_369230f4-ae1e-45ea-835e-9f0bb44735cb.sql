CREATE OR REPLACE FUNCTION public.get_club_join_fees(_club_id uuid)
RETURNS TABLE (
  id uuid,
  club_id uuid,
  body_name text,
  abbreviation text,
  fee_annual numeric,
  fee_type text,
  fee_class text,
  billing_period text,
  pro_rate boolean,
  fee_due_month integer,
  due_day integer,
  active boolean,
  fee_payable_to text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.club_id, n.body_name, n.abbreviation, n.fee_annual, n.fee_type,
         n.fee_class, n.billing_period, n.pro_rate, n.fee_due_month, n.due_day,
         n.active, n.fee_payable_to
  FROM public.national_body_fees n
  WHERE n.club_id = _club_id
    AND n.active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_club_join_fees(uuid) TO authenticated;
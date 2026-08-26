CREATE OR REPLACE FUNCTION public.get_club_public_fees(_club_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  annual_fee numeric,
  billing_period text,
  fee_class text,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.name, f.description, f.annual_fee, f.billing_period, f.fee_class, f.sort_order
  FROM public.member_fee_categories f
  WHERE f.club_id = _club_id
    AND f.active = true
    AND f.show_on_landing = true
  ORDER BY f.sort_order, f.name;
$$;

REVOKE ALL ON FUNCTION public.get_club_public_fees(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_club_public_fees(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_club_public_fees(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_club_bank_details(_club_id uuid)
RETURNS TABLE (
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_branch_code text,
  bank_reference text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.bank_name, s.bank_account_name, s.bank_account_number, s.bank_branch_code, s.bank_reference
  FROM public.club_secrets s
  WHERE s.club_id = _club_id
    AND EXISTS (
      SELECT 1 FROM public.club_members m
      WHERE m.club_id = _club_id
        AND m.user_id = auth.uid()
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_club_bank_details(uuid) TO authenticated;

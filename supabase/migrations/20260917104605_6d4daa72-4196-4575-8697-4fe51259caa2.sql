CREATE OR REPLACE FUNCTION public.champ_member_fee_paid(p_champ_id uuid, p_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(public.champ_entry_fee_cents(p_champ_id), 0) = 0
      OR EXISTS (
        SELECT 1
          FROM public.club_champs_registrations r
          LEFT JOIN public.club_member_fee_payments fp ON fp.id = r.fee_payment_id
         WHERE r.champ_id = p_champ_id
           AND r.club_member_id = p_member_id
           AND CASE
             WHEN r.fee_payment_id IS NOT NULL THEN COALESCE(fp.paid, false)
             ELSE lower(COALESCE(r.status, '')) IN ('paid','waived')
                  OR COALESCE(r.fee_paid_cents, 0) > 0
                  OR r.paid_at IS NOT NULL
           END
      );
$$;

REVOKE ALL ON FUNCTION public.champ_member_fee_paid(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.champ_member_fee_paid(uuid,uuid) TO anon, authenticated, service_role;
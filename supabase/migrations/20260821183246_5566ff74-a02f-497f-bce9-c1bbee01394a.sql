DELETE FROM public.club_champs_entries
 WHERE champ_id = '8c405b3f-1b90-4a22-9d8a-54856ec21c33'::uuid
   AND club_member_id IN (
     SELECT club_member_id
       FROM public.club_champs_registrations
      WHERE id IN (
        '83ec7c3f-2f08-474e-b9fd-a0e79820a4ae'::uuid,
        '15c21533-9402-4251-920f-6ae11d57b6cd'::uuid
      )
   );

UPDATE public.club_champs_registrations
   SET status = 'invited',
       division_choices = '{}',
       confirmed_at = NULL,
       confirmed_by = NULL,
       confirmation_source = NULL,
       declined_at = NULL,
       paid_at = NULL,
       fee_paid_cents = 0,
       fee_payment_id = NULL,
       payment_ref = NULL,
       proof_url = NULL,
       proof_uploaded_at = NULL,
       proof_uploaded_by = NULL,
       updated_at = now()
 WHERE champ_id = '8c405b3f-1b90-4a22-9d8a-54856ec21c33'::uuid
   AND id IN (
     '83ec7c3f-2f08-474e-b9fd-a0e79820a4ae'::uuid,
     '15c21533-9402-4251-920f-6ae11d57b6cd'::uuid
   )
   AND confirmed_at IS NOT NULL
   AND COALESCE(array_length(division_choices, 1), 0) = 0;
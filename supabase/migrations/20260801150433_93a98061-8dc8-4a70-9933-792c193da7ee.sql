UPDATE public.stitch_mandates m
SET status = 'cancelled', cancelled_at = now()
WHERE m.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.stitch_mandates n
    WHERE n.club_member_id = m.club_member_id
      AND n.club_id = m.club_id
      AND n.status = 'pending'
      AND n.created_at > m.created_at
  );
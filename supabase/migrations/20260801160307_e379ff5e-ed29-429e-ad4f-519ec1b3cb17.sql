-- Aam Coetzee (member 2b18e0eb) R72.50, Qassiem Ullah (109ae0ef) R72.50 charged by Stitch on 2026-08-01
INSERT INTO public.member_credit_transactions
  (user_id, club_id, club_member_id, amount, type, method, status, description, reference, created_at, confirmed_at)
SELECT cm.user_id, cm.club_id, cm.id, 72.50, 'debit', 'card', 'confirmed',
       'Recurring card payment - August instalment [Stitch]',
       v.ref, timestamptz '2026-08-01 08:07:00+00', timestamptz '2026-08-01 08:07:00+00'
FROM (VALUES
  ('2b18e0eb-56b7-46aa-a9c6-9aaccc398747'::uuid, 'GB Squash-9d71a7a4-2026-08'),
  ('109ae0ef-d868-4965-9243-71a63946a397'::uuid, 'GB Squash-9f6eceda-2026-08')
) AS v(member_id, ref)
JOIN public.club_members cm ON cm.id = v.member_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.member_credit_transactions t
  WHERE t.club_member_id = v.member_id AND t.reference = v.ref
);

UPDATE public.stitch_collections
SET status = 'paid',
    submitted_at = COALESCE(submitted_at, timestamptz '2026-08-01 08:07:00+00'),
    settled_at = timestamptz '2026-08-01 08:07:00+00'
WHERE id IN ('c342949d-e009-472f-acfa-034b50043768', '6ad865c0-c8e2-4585-938e-2da8bf79ad51');

UPDATE public.stitch_mandates
SET consecutive_failures = 0,
    last_collection_at = timestamptz '2026-08-01 08:07:00+00'
WHERE id IN ('9d71a7a4-0621-4256-b93a-75922719f0f6', '9f6eceda-89b4-4b98-bfb1-3343b1a439ac');
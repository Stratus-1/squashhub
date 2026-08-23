DROP POLICY IF EXISTS "Ops photos: club members read" ON storage.objects;
DROP POLICY IF EXISTS "Ops photos: club members upload" ON storage.objects;
DROP POLICY IF EXISTS "Members upload own payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Members read own payment proofs" ON storage.objects;

CREATE POLICY "Ops photos: club members read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ops-booking-photos'
  AND (storage.foldername(storage.objects.name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = ((storage.foldername(storage.objects.name))[1])::uuid
  )
);

CREATE POLICY "Ops photos: club members upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ops-booking-photos'
  AND (storage.foldername(storage.objects.name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = ((storage.foldername(storage.objects.name))[1])::uuid
  )
);

CREATE POLICY "Members upload own payment proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.id::text = (storage.foldername(storage.objects.name))[2]
      AND cm.club_id::text = (storage.foldername(storage.objects.name))[1]
  )
);

CREATE POLICY "Members read own payment proofs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.id::text = (storage.foldername(storage.objects.name))[2]
      AND cm.club_id::text = (storage.foldername(storage.objects.name))[1]
  )
);
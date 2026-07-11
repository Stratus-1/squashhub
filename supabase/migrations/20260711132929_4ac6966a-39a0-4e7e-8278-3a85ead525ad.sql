
CREATE POLICY "Ops photos: club members read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ops-booking-photos');

CREATE POLICY "Ops photos: authenticated upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ops-booking-photos');

CREATE POLICY "Ops photos: authenticated update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ops-booking-photos');

CREATE POLICY "Ops photos: authenticated delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ops-booking-photos');

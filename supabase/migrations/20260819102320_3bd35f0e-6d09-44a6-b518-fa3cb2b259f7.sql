-- Path convention: <club_id>/<club_member_id>/<filename>
CREATE POLICY "Members upload own payment proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id::text = (storage.foldername(name))[2]
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Members read own payment proofs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id::text = (storage.foldername(name))[2]
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Club admins read club payment proofs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Club admins delete club payment proofs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
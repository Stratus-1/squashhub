
CREATE POLICY "Anyone can read club documents"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'club-documents');

CREATE POLICY "Club admins upload club documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'club-documents'
    AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Club admins update club documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'club-documents'
    AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Club admins delete club documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'club-documents'
    AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

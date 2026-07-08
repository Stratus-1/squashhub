
CREATE POLICY "Club admins can upload stitch onboarding docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'stitch-onboarding'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Club admins can view stitch onboarding docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'stitch-onboarding'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Club admins can delete stitch onboarding docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'stitch-onboarding'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

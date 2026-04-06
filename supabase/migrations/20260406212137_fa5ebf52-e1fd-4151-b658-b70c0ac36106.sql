-- Drop existing overpermissive storage policies for club-logos
DROP POLICY IF EXISTS "Club admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Club admins can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Club admins can delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Club admins can upload/update logos" ON storage.objects;
DROP POLICY IF EXISTS "Club admins can upload/update/delete logos" ON storage.objects;

-- Recreate with proper admin checks using folder-based club_id convention
CREATE POLICY "Club admins can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'club-logos'
    AND public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Club admins can update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'club-logos'
    AND public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Club admins can delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'club-logos'
    AND public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );
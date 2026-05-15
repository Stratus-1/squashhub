
DROP POLICY IF EXISTS "Club admins upload team logos" ON storage.objects;
DROP POLICY IF EXISTS "Club admins update team logos" ON storage.objects;
DROP POLICY IF EXISTS "Club admins delete team logos" ON storage.objects;

CREATE POLICY "Club admins upload team logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-logos'
    AND (
      public.is_platform_admin(auth.uid())
      OR public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "Club admins update team logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND (
      public.is_platform_admin(auth.uid())
      OR public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY "Club admins delete team logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND (
      public.is_platform_admin(auth.uid())
      OR public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

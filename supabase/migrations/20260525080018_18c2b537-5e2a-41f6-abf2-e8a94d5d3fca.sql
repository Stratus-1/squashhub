DROP POLICY IF EXISTS "Authenticated can upload bar items" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update bar items" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete bar items" ON storage.objects;

CREATE POLICY "Club admins can upload bar items"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'bar-items'
  AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Club admins can overwrite bar items"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'bar-items'
  AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'bar-items'
  AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Club admins can delete bar items"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'bar-items'
  AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
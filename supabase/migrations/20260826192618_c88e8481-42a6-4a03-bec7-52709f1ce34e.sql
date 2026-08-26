CREATE OR REPLACE FUNCTION public.is_public_club_document(_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_membership_rules r
    WHERE r.show_on_landing = true
      AND r.club_id::text = (storage.foldername(_path))[1]
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(r.documents, '[]'::jsonb)) d
        WHERE d->>'path' = _path
      )
  )
$$;

DROP POLICY IF EXISTS "Anyone can read club documents" ON storage.objects;

CREATE POLICY "Club members read own club documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'club-documents'
  AND (
    public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id::text = (storage.foldername(name))[1]
    )
    OR public.is_public_club_document(name)
  )
);

CREATE POLICY "Anyone can read published club rule documents"
ON storage.objects FOR SELECT TO anon
USING (
  bucket_id = 'club-documents'
  AND public.is_public_club_document(name)
);
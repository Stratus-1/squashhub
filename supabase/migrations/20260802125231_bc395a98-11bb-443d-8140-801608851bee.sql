
CREATE POLICY "Platform admins can upload outreach assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'club-logos' AND (storage.foldername(name))[1] = 'outreach' AND public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can update outreach assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'club-logos' AND (storage.foldername(name))[1] = 'outreach' AND public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can delete outreach assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'club-logos' AND (storage.foldername(name))[1] = 'outreach' AND public.is_platform_admin(auth.uid()));

-- Create storage bucket for member face enrolment photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('member-faces', 'member-faces', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view face photos (public bucket for avatar display)
CREATE POLICY "Public can view member faces"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'member-faces');

-- Members can upload their own face photo (folder = club_id/user_id.jpg)
CREATE POLICY "Members can upload own face"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'member-faces'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND (
      -- User uploading their own photo
      auth.uid()::text = split_part(storage.filename(name), '.', 1)
      -- Or club admin uploading for a member
      OR public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );

-- Members can update (upsert) their own face photo
CREATE POLICY "Members can update own face"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'member-faces'
    AND (
      auth.uid()::text = split_part(storage.filename(name), '.', 1)
      OR public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );

-- Club admins can delete face photos
CREATE POLICY "Admins can delete face photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'member-faces'
    AND public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );
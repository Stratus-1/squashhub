
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS logo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('team-logos', 'team-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read
DROP POLICY IF EXISTS "Team logos are publicly readable" ON storage.objects;
CREATE POLICY "Team logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'team-logos');

-- Club admins/captains can upload to their own club path
DROP POLICY IF EXISTS "Club admins upload team logos" ON storage.objects;
CREATE POLICY "Club admins upload team logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'team-logos'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id::text = (storage.foldername(name))[1]
        AND cm.role IN ('admin','captain')
    )
  );

DROP POLICY IF EXISTS "Club admins update team logos" ON storage.objects;
CREATE POLICY "Club admins update team logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id::text = (storage.foldername(name))[1]
        AND cm.role IN ('admin','captain')
    )
  );

DROP POLICY IF EXISTS "Club admins delete team logos" ON storage.objects;
CREATE POLICY "Club admins delete team logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id::text = (storage.foldername(name))[1]
        AND cm.role IN ('admin','captain')
    )
  );

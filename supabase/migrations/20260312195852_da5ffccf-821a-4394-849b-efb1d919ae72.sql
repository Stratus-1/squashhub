
-- Add office bearer columns to clubs table
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS chairman_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS secretary_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS club_captain_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL;

-- Create storage bucket for club logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('club-logos', 'club-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to club-logos
CREATE POLICY "Club admins can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'club-logos');

CREATE POLICY "Anyone can view club logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'club-logos');

CREATE POLICY "Club admins can update logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'club-logos');

CREATE POLICY "Club admins can delete logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'club-logos');

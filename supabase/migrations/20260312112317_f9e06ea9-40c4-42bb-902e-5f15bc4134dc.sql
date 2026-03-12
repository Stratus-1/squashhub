
-- Add club_id to courts table (nullable for backward compat with existing courts)
ALTER TABLE public.courts ADD COLUMN club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;

-- Allow club admins to manage courts
CREATE POLICY "Club admins can insert courts" ON public.courts FOR INSERT TO authenticated
  WITH CHECK (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Club admins can update courts" ON public.courts FOR UPDATE TO authenticated
  USING (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Club admins can delete courts" ON public.courts FOR DELETE TO authenticated
  USING (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id));

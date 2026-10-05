CREATE OR REPLACE FUNCTION public.md_hdr_member_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce(array_agg(DISTINCT club_member_id), '{}') FROM member_league_registrations
      WHERE club_member_id IS NOT NULL AND league_id = ANY(public.md_hdr_league_ids()) $$;
DROP POLICY IF EXISTS "md device read members" ON public.club_members;
CREATE POLICY "md device read members" ON public.club_members FOR SELECT TO anon
  USING (id = ANY((SELECT public.md_hdr_member_ids())::uuid[]));
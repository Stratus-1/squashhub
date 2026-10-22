CREATE OR REPLACE FUNCTION public.is_club_applicant(_user_id uuid, _club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.user_id=_user_id AND cm.club_id=_club_id AND cm.is_pending_approval = true) $$;

CREATE POLICY "Applicants can view paid active fee categories"
ON public.member_fee_categories FOR SELECT TO authenticated
USING (active = true AND annual_fee > 0 AND public.is_club_applicant(auth.uid(), club_id));
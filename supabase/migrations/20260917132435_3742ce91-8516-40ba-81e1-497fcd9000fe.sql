CREATE OR REPLACE FUNCTION public.can_view_tournament(_user_id uuid, _tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
     WHERE t.id = _tournament_id
       AND (
         public.is_club_member(_user_id, t.club_id)
         OR public.can_manage_tournament(_user_id, t.id)
         OR EXISTS (SELECT 1 FROM public.tournament_rules r
                     WHERE r.tournament_id = t.id AND r.scoring_mode = 'time_capped_points')
         OR EXISTS (
              SELECT 1 FROM public.club_champs_registrations reg
              JOIN public.club_members cm ON cm.id IN (reg.club_member_id, reg.partner_member_id)
              WHERE reg.champ_id = t.id AND cm.user_id = _user_id
            )
         OR EXISTS (
              SELECT 1 FROM public.club_champs_entries e
              JOIN public.club_members cm2 ON cm2.id = e.club_member_id
              WHERE e.champ_id = t.id AND cm2.user_id = _user_id
            )
       )
  );
$function$;
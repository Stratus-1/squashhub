CREATE OR REPLACE FUNCTION public.club_accepts_membership_applications(_club_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = _club_id AND (
 c.tenant_type = 'association'
 OR c.sla_accepted_at IS NOT NULL
 OR EXISTS (SELECT 1 FROM public.club_subscriptions s WHERE s.club_id = c.id AND s.status IN ('active','trial','trialing') AND s.trial_ends_at > now())
 OR c.id = 'ec323faa-9b1f-4603-9b30-a0db787ada99'::uuid
 OR EXISTS (SELECT 1 FROM public.club_registration_openings o WHERE o.club_id = c.id)
 ));
$function$;
CREATE OR REPLACE FUNCTION public.platform_unaffiliated_users()
 RETURNS TABLE(user_id uuid, name text, email text, phone text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.email, p.phone, p.created_at
  FROM public.profiles p
  WHERE (public.is_platform_admin(auth.uid()) OR current_setting('role', true) = 'service_role')
    AND NOT EXISTS (SELECT 1 FROM public.club_members m WHERE m.user_id = p.id)
  ORDER BY p.created_at DESC;
$function$;
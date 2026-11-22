CREATE OR REPLACE FUNCTION public.office_to_role_name(_office text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case lower(replace(coalesce(_office,''), '_', '-'))
    when 'chairman' then 'Chairman'
    when 'vice-chairman' then 'Vice-Chairman'
    when 'vice-chair' then 'Vice-Chairman'
    when 'treasurer' then 'Treasurer'
    when 'secretary' then 'Secretary'
    when 'captain' then 'Club Captain'
    when 'club-captain' then 'Club Captain'
    when 'bar-manager' then 'Bar Manager'
    else null
  end
$function$;
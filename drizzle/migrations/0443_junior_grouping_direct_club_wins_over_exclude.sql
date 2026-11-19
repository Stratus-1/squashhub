CREATE OR REPLACE FUNCTION public.org_grouping_descendants(_org_id uuid)
 RETURNS TABLE(org_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE g AS (
    SELECT _org_id AS id
    UNION
    SELECT gr.child_org_id FROM public.org_groupings gr JOIN g ON g.id = gr.parent_org_id
    WHERE gr.mode = 'include'
  ),
  levels AS (SELECT g.id FROM g JOIN public.organisations o ON o.id = g.id WHERE o.kind::text IN ('zone','provincial')),
  excluded AS (SELECT gr.child_org_id AS id FROM public.org_groupings gr JOIN levels l ON l.id = gr.parent_org_id WHERE gr.mode = 'exclude'),
  inner_orgs AS (
    SELECT d.org_id, (d.org_id = g.id) AS direct FROM g JOIN public.organisations o ON o.id = g.id
    CROSS JOIN LATERAL public.org_descendants(g.id) d
    WHERE o.kind::text IN ('association','club')
  )
  SELECT id FROM levels
  UNION
  -- A club left out of an association's grouping is still counted when it is
  -- grouped directly (e.g. moved on its own to another provincial association).
  SELECT i.org_id FROM inner_orgs i WHERE i.direct OR i.org_id NOT IN (SELECT id FROM excluded);
$function$;
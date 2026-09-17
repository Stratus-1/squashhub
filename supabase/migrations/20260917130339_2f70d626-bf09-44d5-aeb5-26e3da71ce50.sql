CREATE OR REPLACE FUNCTION public.champ_sync_pair_entries(p_champ_id uuid, p_group_number integer, p_a uuid, p_b uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next int;
  v_keep uuid;
  v_primary uuid;
  v_partner uuid;
BEGIN
  -- Keep at most ONE entry row per pair (the team), never one per player.
  SELECT e.id, e.club_member_id
    INTO v_keep, v_primary
    FROM public.club_champs_entries e
   WHERE e.champ_id = p_champ_id
     AND e.group_number = p_group_number
     AND e.club_member_id IN (p_a, p_b)
   ORDER BY (e.club_member_id = p_a) DESC, e.order_index
   LIMIT 1;

  IF v_keep IS NULL THEN
    SELECT COALESCE(MAX(order_index), -1) + 1 INTO v_next
      FROM public.club_champs_entries
     WHERE champ_id = p_champ_id AND group_number = p_group_number;

    INSERT INTO public.club_champs_entries (champ_id, club_member_id, group_number, order_index, partner_member_id)
    VALUES (p_champ_id, p_a, p_group_number, v_next, p_b);
  ELSE
    v_partner := CASE WHEN v_primary = p_a THEN p_b ELSE p_a END;

    UPDATE public.club_champs_entries
       SET partner_member_id = v_partner
     WHERE id = v_keep;

    -- Drop the mirrored row for the other player of the same pair.
    DELETE FROM public.club_champs_entries e
     WHERE e.champ_id = p_champ_id
       AND e.group_number = p_group_number
       AND e.club_member_id IN (p_a, p_b)
       AND e.id <> v_keep;
  END IF;
END; $function$;

-- Clean up existing mirrored duplicates: where two rows describe the same pair, keep the first.
DELETE FROM public.club_champs_entries e
 USING public.club_champs_entries k
 WHERE e.champ_id = k.champ_id
   AND e.group_number = k.group_number
   AND e.club_member_id = k.partner_member_id
   AND e.partner_member_id = k.club_member_id
   AND k.order_index < e.order_index;
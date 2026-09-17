CREATE OR REPLACE FUNCTION public.champ_sync_pair_entries(p_champ_id uuid, p_group_number integer, p_a uuid, p_b uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_next int;
BEGIN
  SELECT COALESCE(MAX(order_index), -1) + 1 INTO v_next
    FROM public.club_champs_entries
   WHERE champ_id = p_champ_id AND group_number = p_group_number;

  INSERT INTO public.club_champs_entries (champ_id, club_member_id, group_number, order_index, partner_member_id)
  SELECT p_champ_id, p_a, p_group_number, v_next, p_b
  WHERE NOT EXISTS (
    SELECT 1 FROM public.club_champs_entries e
     WHERE e.champ_id = p_champ_id AND e.group_number = p_group_number AND e.club_member_id = p_a
  );

  SELECT COALESCE(MAX(order_index), -1) + 1 INTO v_next
    FROM public.club_champs_entries
   WHERE champ_id = p_champ_id AND group_number = p_group_number;

  INSERT INTO public.club_champs_entries (champ_id, club_member_id, group_number, order_index, partner_member_id)
  SELECT p_champ_id, p_b, p_group_number, v_next, p_a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.club_champs_entries e
     WHERE e.champ_id = p_champ_id AND e.group_number = p_group_number AND e.club_member_id = p_b
  );

  UPDATE public.club_champs_entries SET partner_member_id = p_b
   WHERE champ_id = p_champ_id AND group_number = p_group_number AND club_member_id = p_a;
  UPDATE public.club_champs_entries SET partner_member_id = p_a
   WHERE champ_id = p_champ_id AND group_number = p_group_number AND club_member_id = p_b;
END; $function$;
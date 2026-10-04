CREATE OR REPLACE FUNCTION public.champ_member_event_paid(p_champ_id uuid, p_member_id uuid, p_group integer)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; c jsonb;
BEGIN
  IF coalesce(public.champ_entry_fee_cents(p_champ_id), 0) = 0 THEN RETURN true; END IF;
  SELECT * INTO r FROM public.club_champs_registrations
   WHERE champ_id = p_champ_id AND club_member_id = p_member_id
     AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn')
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  IF public.champ_event_covered_by_other(r.id, p_group) THEN
    c := r.covered_events -> p_group::text;
    -- A cover promise with no payment recorded yet is NOT paid (never NULL).
    RETURN coalesce((c ->> 'paid')::boolean, false)
        OR coalesce((c ->> 'via') = 'account', false)
        OR (lower(coalesce(r.status,'')) IN ('paid','waived') AND r.paid_by_member_id IS NOT NULL AND r.paid_by_member_id <> r.club_member_id);
  END IF;
  RETURN coalesce(public.champ_member_fee_settled(p_champ_id, p_member_id), false);
END $function$;
-- When a doubles pair is named in a Step-by-Step (category-typed) tournament, both
-- players' entries list that category and that partner, so the partner's entry can be
-- marked paid/waived without "Choose an eligible category". Never removes anything.
CREATE OR REPLACE FUNCTION public.champ_pair_sync_partner_categories(p_pair_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE p record; r record; v_other uuid;
BEGIN
  SELECT * INTO p FROM public.champ_doubles_pairs WHERE id = p_pair_id;
  IF NOT FOUND OR p.status IN ('cancelled','rejected','declined') OR p.group_number IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = p.champ_id
                  AND t.beta_lifecycle->'category_types' IS NOT NULL
                  AND t.beta_lifecycle->'category_types' <> 'null'::jsonb) THEN RETURN; END IF;
  FOR r IN SELECT id, club_member_id, division_choices, division_partners
             FROM public.club_champs_registrations
            WHERE champ_id = p.champ_id AND club_member_id IN (p.member_a, p.member_b)
              AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn')
              AND coalesce(registration_status,'') <> 'declined' LOOP
    v_other := CASE WHEN r.club_member_id = p.member_a THEN p.member_b ELSE p.member_a END;
    IF NOT (p.group_number = ANY (coalesce(r.division_choices, '{}'::int[])))
       OR coalesce(r.division_partners, '{}'::jsonb) ->> p.group_number::text IS NULL THEN
      UPDATE public.club_champs_registrations
         SET division_choices = CASE WHEN p.group_number = ANY (coalesce(division_choices, '{}'::int[]))
                                     THEN division_choices
                                     ELSE array_append(coalesce(division_choices, '{}'::int[]), p.group_number) END,
             division_partners = CASE WHEN coalesce(division_partners, '{}'::jsonb) ->> p.group_number::text IS NULL
                                      THEN coalesce(division_partners, '{}'::jsonb) || jsonb_build_object(p.group_number::text, v_other)
                                      ELSE division_partners END
       WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.champ_pair_sync_partner_categories(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_pair_sync_partner_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.member_a IS NOT DISTINCT FROM OLD.member_a AND NEW.member_b IS NOT DISTINCT FROM OLD.member_b
     AND NEW.group_number IS NOT DISTINCT FROM OLD.group_number THEN RETURN NULL; END IF;
  PERFORM public.champ_pair_sync_partner_categories(NEW.id);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_pair_sync_partner_categories ON public.champ_doubles_pairs;
CREATE TRIGGER trg_pair_sync_partner_categories
  AFTER INSERT OR UPDATE ON public.champ_doubles_pairs
  FOR EACH ROW EXECUTE FUNCTION public.tg_pair_sync_partner_categories();

-- Backfill: open pairs in category-typed tournaments that are still before play.
SELECT public.champ_pair_sync_partner_categories(p.id)
  FROM public.champ_doubles_pairs p
  JOIN public.tournaments t ON t.id = p.champ_id
 WHERE p.status IN ('awaiting_payment','pending')
   AND t.beta_lifecycle->'category_types' IS NOT NULL
   AND t.beta_lifecycle->'category_types' <> 'null'::jsonb;
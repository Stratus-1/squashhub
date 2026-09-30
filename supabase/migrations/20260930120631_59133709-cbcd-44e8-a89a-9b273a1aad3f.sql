CREATE OR REPLACE FUNCTION public.club_members_block_duplicate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text := lower(regexp_replace(coalesce(NEW.name, ''), '[^a-zA-Z]', '', 'g'));
  v_email text := lower(trim(coalesce(NEW.email, '')));
  v_home text;
BEGIN
  IF v_name = '' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.club_members m
     WHERE m.club_id = NEW.club_id
       AND coalesce(m.status::text, 'active') <> 'resigned'
       AND lower(regexp_replace(coalesce(m.name, ''), '[^a-zA-Z]', '', 'g')) = v_name
       AND ((NEW.user_id IS NOT NULL AND m.user_id = NEW.user_id)
         OR (v_email <> '' AND lower(trim(coalesce(m.email, ''))) = v_email))
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_MEMBER: this person already has a record at this club'
      USING ERRCODE = 'unique_violation';
  END IF;

  IF NEW.role::text = 'visitor' AND NEW.user_id IS NOT NULL THEN
    SELECT coalesce(c.subdomain, c.name) INTO v_home
      FROM public.club_members m JOIN public.clubs c ON c.id = m.club_id
     WHERE m.user_id = NEW.user_id AND m.club_id <> NEW.club_id
       AND m.role::text <> 'visitor'
       AND coalesce(m.status::text, 'active') = 'active'
       AND lower(regexp_replace(coalesce(m.name, ''), '[^a-zA-Z]', '', 'g')) = v_name
     LIMIT 1;
    IF v_home IS NOT NULL THEN
      RAISE EXCEPTION 'ALREADY_MEMBER_ELSEWHERE:%', v_home USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.club_members_block_duplicate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS club_members_block_duplicate_trg ON public.club_members;
CREATE TRIGGER club_members_block_duplicate_trg
  BEFORE INSERT ON public.club_members
  FOR EACH ROW EXECUTE FUNCTION public.club_members_block_duplicate();
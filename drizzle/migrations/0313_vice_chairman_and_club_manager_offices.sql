ALTER TABLE public.clubs ADD COLUMN vice_chairman_member_id uuid REFERENCES public.club_members(id), ADD COLUMN club_manager_member_id uuid REFERENCES public.club_members(id);
ALTER TABLE public.club_offices DROP CONSTRAINT club_offices_office_check;
ALTER TABLE public.club_offices ADD CONSTRAINT club_offices_office_check CHECK (office IN ('chairman','vice_chair','secretary','treasurer','club_captain','club_manager'));
CREATE OR REPLACE FUNCTION public.assign_additional_officer_roles() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.vice_chairman_member_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.club_members WHERE id=NEW.vice_chairman_member_id AND club_id=NEW.id) THEN RAISE EXCEPTION 'Vice Chairman must be a member of this club'; END IF;
 IF NEW.club_manager_member_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.club_members WHERE id=NEW.club_manager_member_id AND club_id=NEW.id) THEN RAISE EXCEPTION 'Club Manager must be a member of this club'; END IF;
 IF NEW.vice_chairman_member_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.vice_chairman_member_id IS DISTINCT FROM OLD.vice_chairman_member_id) THEN PERFORM public.assign_role_to_member(NEW.id,NEW.vice_chairman_member_id,'Chairman'); END IF;
 IF NEW.club_manager_member_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.club_manager_member_id IS DISTINCT FROM OLD.club_manager_member_id) THEN PERFORM public.assign_role_to_member(NEW.id,NEW.club_manager_member_id,'Club Captain'); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_additional_officer_roles() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER assign_additional_officer_roles BEFORE INSERT OR UPDATE OF vice_chairman_member_id,club_manager_member_id ON public.clubs FOR EACH ROW EXECUTE FUNCTION public.assign_additional_officer_roles();
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.is_club_chairman(uuid,uuid)'::regprocedure) INTO d;
 d:=replace(d,'cm.id=(SELECT chairman_member_id FROM public.clubs WHERE id=_club_id)','cm.id IN (SELECT chairman_member_id FROM public.clubs WHERE id=_club_id UNION ALL SELECT vice_chairman_member_id FROM public.clubs WHERE id=_club_id)');
 d:=replace(d,'o.office::text=''chairman''','o.office::text IN (''chairman'',''vice_chair'')');
 d:=replace(d,'lower(trim(r.role_name))=''chairman''','lower(trim(r.role_name)) IN (''chairman'',''vice chairman'',''vice-chairman'',''vice chair'')');
 d:=replace(d,'lower(trim(a.role_name))=''chairman''','lower(trim(a.role_name)) IN (''chairman'',''vice chairman'',''vice-chairman'',''vice chair'')');
 EXECUTE d;
 SELECT pg_get_functiondef('public.is_club_admin(uuid,uuid)'::regprocedure) INTO d;
 d:=replace(d,'c.chairman_member_id, c.secretary_member_id, c.club_captain_member_id','c.chairman_member_id, c.vice_chairman_member_id, c.secretary_member_id, c.club_captain_member_id, c.club_manager_member_id'); EXECUTE d;
 SELECT pg_get_functiondef('public.new_model_cap(uuid,uuid,text)'::regprocedure) INTO d;
 d:=replace(d,'d.office = o.office','d.office = CASE o.office WHEN ''vice_chair'' THEN ''chairman'' WHEN ''club_manager'' THEN ''club_captain'' ELSE o.office END'); EXECUTE d;
 FOREACH d IN ARRAY ARRAY['guard_chairman_financial_write','chairman_banking_setup_change_allowed'] LOOP
  DECLARE f text; BEGIN
   SELECT pg_get_functiondef(oid) INTO f FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=d;
   f:=replace(f,'e.key=''chairman_member_id''','e.key IN (''chairman_member_id'',''vice_chairman_member_id'')'); EXECUTE f;
  END;
 END LOOP;
END $$;
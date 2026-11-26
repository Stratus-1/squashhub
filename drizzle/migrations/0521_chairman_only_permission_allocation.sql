CREATE OR REPLACE FUNCTION public.is_club_chairman_strict(_user_id uuid, _club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.user_id=_user_id AND cm.club_id=_club_id AND (
  cm.id = (SELECT chairman_member_id FROM public.clubs WHERE id=_club_id)
  OR EXISTS(SELECT 1 FROM public.club_member_permissions p JOIN public.club_permission_roles r ON r.id=p.permission_role_id WHERE p.club_member_id=cm.id AND r.club_id=_club_id AND lower(trim(r.role_name))='chairman')
  OR EXISTS(SELECT 1 FROM public.club_offices o WHERE o.club_id=_club_id AND o.club_member_id=cm.id AND o.office::text='chairman' AND o.ended_at IS NULL)))
$$;

CREATE OR REPLACE FUNCTION public.club_has_chairman(_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS(SELECT 1 FROM public.clubs WHERE id=_club_id AND chairman_member_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM public.club_member_permissions p JOIN public.club_permission_roles r ON r.id=p.permission_role_id WHERE r.club_id=_club_id AND lower(trim(r.role_name))='chairman')
  OR EXISTS(SELECT 1 FROM public.club_offices o WHERE o.club_id=_club_id AND o.office::text='chairman' AND o.ended_at IS NULL)
$$;

-- Effective permission slugs of a member row (role + custom)
CREATE OR REPLACE FUNCTION public._member_perm_slugs(_member_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT COALESCE(array_agg(DISTINCT s),'{}') FROM (
  SELECT unnest(p.custom_permissions) s FROM public.club_member_permissions p WHERE p.club_member_id=_member_id
  UNION SELECT unnest(r.permissions) FROM public.club_member_permissions p JOIN public.club_permission_roles r ON r.id=p.permission_role_id WHERE p.club_member_id=_member_id
 ) x
$$;

-- true when every slug is a bar slug the actor holds
CREATE OR REPLACE FUNCTION public._bar_subset(_slugs text[], _actor text[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT NOT EXISTS (SELECT 1 FROM unnest(COALESCE(_slugs,'{}')) s
   WHERE NOT ( (s='bar' OR s LIKE 'bar.%') AND ('bar' = ANY(_actor) OR s = ANY(_actor)) ))
$$;

CREATE OR REPLACE FUNCTION public.guard_permission_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j jsonb; oj jsonb; cid uuid; actor_mid uuid; actor_perms text[]; tgt uuid; new_slugs text[]; old_slugs text[];
BEGIN
 IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_platform_admin(auth.uid()) THEN RETURN COALESCE(NEW,OLD); END IF;
 j := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 oj := CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 IF TG_TABLE_NAME='club_permission_roles' THEN
   cid := (j->>'club_id')::uuid;
 ELSE
   tgt := (j->>'club_member_id')::uuid;
   SELECT club_id INTO cid FROM public.club_members WHERE id=tgt;
 END IF;
 IF public.is_club_chairman_strict(auth.uid(),cid) THEN RETURN COALESCE(NEW,OLD); END IF;
 IF NOT public.club_has_chairman(cid) AND EXISTS(SELECT 1 FROM public.club_members WHERE user_id=auth.uid() AND club_id=cid AND role='admin' AND status='active') THEN
   RETURN COALESCE(NEW,OLD);
 END IF;
 -- Bar / POS managers: bar-only, equal or lower, never self, never over non-bar holders
 IF TG_TABLE_NAME='club_member_permissions' THEN
   SELECT id INTO actor_mid FROM public.club_members WHERE user_id=auth.uid() AND club_id=cid AND status='active' LIMIT 1;
   IF actor_mid IS NOT NULL AND actor_mid <> tgt THEN
     actor_perms := public._member_perm_slugs(actor_mid);
     IF 'bar' = ANY(actor_perms) OR 'bar.staff' = ANY(actor_perms) THEN
       old_slugs := public._member_perm_slugs(tgt);
       new_slugs := CASE WHEN TG_OP='DELETE' THEN '{}'::text[] ELSE
         COALESCE(NEW.custom_permissions,'{}') || COALESCE((SELECT permissions FROM public.club_permission_roles WHERE id=NEW.permission_role_id),'{}') END;
       IF (TG_OP='DELETE' OR NOT NEW.is_full_admin)
          AND public._bar_subset(new_slugs, actor_perms)
          AND public._bar_subset(old_slugs, actor_perms)
          AND COALESCE((oj->>'is_full_admin')::boolean,false)=false THEN
         RETURN COALESCE(NEW,OLD);
       END IF;
     END IF;
   END IF;
 END IF;
 RAISE EXCEPTION 'Only the club Chairman may change or allocate permissions (Bar managers may only give equal or lower bar permissions)' USING ERRCODE='42501';
END $$;

DROP TRIGGER IF EXISTS chairman_only_permission_allocation ON public.club_member_permissions;
CREATE TRIGGER chairman_only_permission_allocation BEFORE INSERT OR UPDATE OR DELETE ON public.club_member_permissions FOR EACH ROW EXECUTE FUNCTION public.guard_permission_allocation();
DROP TRIGGER IF EXISTS chairman_only_permission_allocation ON public.club_permission_roles;
CREATE TRIGGER chairman_only_permission_allocation BEFORE INSERT OR UPDATE OR DELETE ON public.club_permission_roles FOR EACH ROW EXECUTE FUNCTION public.guard_permission_allocation();

-- Chairman may now edit role templates, except the role they themselves hold
CREATE OR REPLACE FUNCTION public.guard_chairman_permission_changes()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE j jsonb; oldj jsonb; cid uuid; oldcid uuid; mid uuid;
BEGIN
 IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin'::public.app_role) THEN RETURN COALESCE(NEW,OLD); END IF;
 j:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 oldj:=CASE WHEN TG_OP='INSERT' THEN j ELSE to_jsonb(OLD) END;
 cid:=nullif(j->>'club_id','')::uuid; oldcid:=nullif(oldj->>'club_id','')::uuid; mid:=nullif(j->>'club_member_id','')::uuid;
 IF cid IS NULL AND mid IS NOT NULL THEN SELECT club_id INTO cid FROM public.club_members WHERE id=mid; END IF;
 IF oldcid IS NULL THEN oldcid:=cid; END IF;
 IF NOT (public.is_club_chairman(auth.uid(),cid) OR public.is_club_chairman(auth.uid(),oldcid)) THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_TABLE_NAME='role_capability_templates'
  OR (TG_TABLE_NAME='club_permission_roles' AND EXISTS(SELECT 1 FROM public.club_member_permissions p JOIN public.club_members cm ON cm.id=p.club_member_id WHERE cm.user_id=auth.uid() AND p.permission_role_id IN (nullif(j->>'id','')::uuid, nullif(oldj->>'id','')::uuid)))
  OR EXISTS(SELECT 1 FROM public.club_members WHERE id IN (mid,nullif(oldj->>'club_member_id','')::uuid) AND user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Chairman cannot change their own permissions or the role they hold; another administrator must do this' USING ERRCODE='42501';
 END IF;
 RETURN COALESCE(NEW,OLD);
END $function$;

REVOKE EXECUTE ON FUNCTION public._member_perm_slugs(uuid) FROM PUBLIC, anon, authenticated;
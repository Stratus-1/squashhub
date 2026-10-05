DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.club_members_guard_self_fields()'::regprocedure);
  d := replace(d,
    'OR public.has_role(actor, ''admin''::app_role);',
    'OR public.has_role(actor, ''admin''::app_role)
              OR (TG_OP = ''UPDATE'' AND public.is_club_member_manager(actor, OLD.club_id, OLD.user_id) AND OLD.role <> ''admin''::club_member_role);');
  IF position('is_club_member_manager' in d) = 0 THEN RAISE EXCEPTION 'patch failed'; END IF;
  EXECUTE d;
END $$;
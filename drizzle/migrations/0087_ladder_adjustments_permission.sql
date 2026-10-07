DO $$ DECLARE def text; BEGIN
  def := pg_get_functiondef('public.apply_ladder_adjustments'::regproc);
  def := replace(def, 'public.is_club_admin(v_uid, _club_id)', 'public.is_club_admin_or_permitted(v_uid, _club_id, ''ladder'')');
  EXECUTE def;
END $$;
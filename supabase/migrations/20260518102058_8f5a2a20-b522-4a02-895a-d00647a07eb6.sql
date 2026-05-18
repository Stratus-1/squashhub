CREATE UNIQUE INDEX IF NOT EXISTS maa_association_number_active_unique
  ON public.member_association_affiliations (association_id, league_association_number)
  WHERE active = true AND league_association_number IS NOT NULL;
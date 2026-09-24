-- Hot-path indexes: RLS checks and "my matches" lookups filter on these columns.
CREATE INDEX IF NOT EXISTS idx_club_members_user_club ON public.club_members (user_id, club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_club_user ON public.club_members (club_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ccm_champ_sched ON public.club_champs_matches (champ_id, scheduled_date, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_ccm_player_a ON public.club_champs_matches (player_a_member_id);
CREATE INDEX IF NOT EXISTS idx_ccm_player_b ON public.club_champs_matches (player_b_member_id);
CREATE INDEX IF NOT EXISTS idx_ccm_partner_a ON public.club_champs_matches (partner_a_member_id) WHERE partner_a_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ccm_partner_b ON public.club_champs_matches (partner_b_member_id) WHERE partner_b_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leagues_nsa_code_upper ON public.leagues (upper(nsa_team_code));
CREATE INDEX IF NOT EXISTS idx_leagues_code_upper ON public.leagues (upper(code));
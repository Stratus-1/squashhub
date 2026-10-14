ALTER TABLE public.club_beta_features DROP CONSTRAINT club_beta_features_feature_check;
ALTER TABLE public.club_beta_features ADD CONSTRAINT club_beta_features_feature_check
  CHECK (feature = ANY (ARRAY['tournament_beta','ai_actions','tournament_swiss_progression_view','tournament_pool_matrix_view','tournament_bracket_view']));
INSERT INTO public.club_beta_features (club_id, feature)
VALUES ('11111111-1111-1111-1111-111111111111','tournament_swiss_progression_view')
ON CONFLICT DO NOTHING;
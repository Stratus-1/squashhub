UPDATE public.league_match_results
SET game_scores = '[]'::jsonb,
    home_games_won = 0,
    away_games_won = 0,
    winner = NULL,
    updated_at = now()
WHERE id = 'c15ad6d0-a38e-438c-93dd-52d52f37ce07';
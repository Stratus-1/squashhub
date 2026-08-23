UPDATE public.club_champs_matches
   SET score = '11-0, 0-11, 0-11',
       game_scores = '{"sets":[{"a":11,"b":0},{"a":0,"b":11},{"a":0,"b":11}]}',
       winner_member_id = 'b8fcbf7c-01c7-4f41-8c51-e743b21b47e1',
       status = 'completed'
 WHERE id = '2bcadcfc-8433-4dff-bac2-593783366855'
   AND status <> 'completed';
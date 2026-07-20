UPDATE public.platform_league_fixtures f
SET venue_name = COALESCE(NULLIF(TRIM(c.venue_name), ''), cl.name, 'Home')
FROM public.courts c
LEFT JOIN public.clubs cl ON cl.id = c.club_id
WHERE f.court_id = c.id
  AND (
    f.venue_name IS DISTINCT FROM COALESCE(NULLIF(TRIM(c.venue_name), ''), cl.name, 'Home')
  );
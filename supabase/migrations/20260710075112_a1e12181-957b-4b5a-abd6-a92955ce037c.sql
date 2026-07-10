DELETE FROM public.notifications
WHERE type = 'general'
  AND title ILIKE 'Welcome to Gordons Bay%'
  AND created_at > now() - interval '2 hours';
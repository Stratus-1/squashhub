UPDATE public.club_members SET status = 'active' WHERE id = 'c74370a8-f356-400d-9177-81207303eddf';

SELECT cron.schedule(
  'ai-open-queries-hourly',
  '25 * * * *',
  $$
  WITH open_items AS (
    SELECT count(*) AS n
    FROM public.ai_assist_interactions
    WHERE status IN ('proposed', 'needs_clarification', 'escalated')
  ), already_notified AS (
    SELECT 1
    FROM public.notifications
    WHERE user_id = 'b7847c0e-d897-4e25-823a-e00d19f8e42a'
      AND type = 'ai_open_queries'
      AND read = false
    LIMIT 1
  )
  INSERT INTO public.notifications (user_id, title, message, type, read, url)
  SELECT
    'b7847c0e-d897-4e25-823a-e00d19f8e42a',
    'AI queries waiting',
    'There are ' || open_items.n || ' open AI Assistance request(s) waiting for attention.',
    'ai_open_queries',
    false,
    '/admin/ai-assistance'
  FROM open_items
  WHERE open_items.n > 0
    AND NOT EXISTS (SELECT 1 FROM already_notified);
  $$
);
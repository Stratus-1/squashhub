DO $$
DECLARE existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id FROM cron.job WHERE jobname = 'ai-open-queries-hourly' LIMIT 1;
  IF existing_job_id IS NOT NULL THEN PERFORM cron.unschedule(existing_job_id); END IF;
END $$;

-- The old count included escalations whose support ticket was already resolved/closed.
UPDATE public.notifications SET read = true
WHERE type = 'ai_open_queries' AND read = false;

SELECT cron.schedule(
  'ai-open-queries-hourly',
  '25 * * * *',
  $cron$
  WITH open_rows AS (
    SELECT a.updated_at
    FROM public.ai_assist_interactions a
    LEFT JOIN public.support_threads t ON t.id = a.ticket_id
    WHERE (a.status = 'escalated' AND (a.ticket_id IS NULL OR t.status IN ('open', 'pending', 'in_progress')))
       OR (a.status = 'needs_clarification' AND a.created_at > now() - interval '7 days')
       OR (a.status = 'proposed' AND (a.expires_at IS NULL OR a.expires_at > now()))
  ), open_items AS (
    SELECT count(*) AS n, max(updated_at) AS newest_at FROM open_rows
  ), last_notification AS (
    SELECT max(created_at) AS notified_at
    FROM public.notifications
    WHERE user_id = 'b7847c0e-d897-4e25-823a-e00d19f8e42a' AND type = 'ai_open_queries'
  )
  INSERT INTO public.notifications (user_id, title, message, type, read, url)
  SELECT 'b7847c0e-d897-4e25-823a-e00d19f8e42a', 'AI queries waiting',
    'There are ' || open_items.n || ' open AI Assistance request(s) waiting for attention.',
    'ai_open_queries', false, '/admin/support?view=ai'
  FROM open_items CROSS JOIN last_notification
  WHERE open_items.n > 0
    AND (last_notification.notified_at IS NULL OR open_items.newest_at > last_notification.notified_at);
  $cron$
);
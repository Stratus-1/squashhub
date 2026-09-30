-- Synthetic tests for the Help Center pilot gate. Run via run.sh on a disposable DB.
\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.ok(c boolean, msg text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN IF NOT coalesce(c,false) THEN RAISE EXCEPTION 'FAIL: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;

-- Production-like starting state: paused retry job (as jobid 930 in prod).
INSERT INTO cron.job(jobname,schedule,command,active)
VALUES ('help-center-ticket-feed-retry','*/5 * * * *','SELECT public.help_center_outbox_wake()', false);

-- Build pre-gate backlog with the OLD functions: 10 tickets, 22 events, later resolved.
-- (Old wake fires net.http_post; clear it after setup.)
SELECT set_config('t.phase','setup',false);
DO $$ DECLARE i int; tid uuid; BEGIN
  FOR i IN 1..10 LOOP
    INSERT INTO support_threads(status) VALUES ('open') RETURNING id INTO tid;          -- case.created
    INSERT INTO support_messages(thread_id) VALUES (tid);                               -- case.updated
    IF i <= 2 THEN INSERT INTO support_messages(thread_id) VALUES (tid); END IF;        -- +2
  END LOOP;
END $$;
-- mark one attempt failed on each (as in prod), then resolve tickets via direct status write
-- performed after gate is installed? No: prod backlog rows were created before; statuses changed later.

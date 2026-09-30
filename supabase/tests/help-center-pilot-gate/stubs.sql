-- Disposable local DB stubs for Supabase-managed pieces (synthetic only).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;

-- pg_net stub: records calls instead of sending.
CREATE SCHEMA net;
CREATE TABLE net.calls (id serial PRIMARY KEY, url text, at timestamptz DEFAULT now());
CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb) RETURNS bigint
LANGUAGE sql AS $$ INSERT INTO net.calls(url) VALUES (url) RETURNING id::bigint $$;

-- pg_cron stub.
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text, active boolean DEFAULT true);
CREATE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE sql AS
$$ INSERT INTO cron.job(jobname,schedule,command) VALUES (n,s,c) RETURNING jobid $$;
CREATE FUNCTION cron.unschedule(n text) RETURNS boolean LANGUAGE sql AS
$$ DELETE FROM cron.job WHERE jobname=n RETURNING true $$;
CREATE FUNCTION cron.alter_job(job_id bigint, active boolean) RETURNS void LANGUAGE sql AS
$$ UPDATE cron.job SET active = alter_job.active WHERE jobid = job_id $$;

-- Minimal synthetic support tables.
CREATE TABLE public.support_threads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.support_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid,
  created_at timestamptz NOT NULL DEFAULT now());

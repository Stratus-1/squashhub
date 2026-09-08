CREATE TABLE public.member_import_staging (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  memno text,
  name text,
  matchname text,
  email text,
  phone text,
  gender text,
  idnum text,
  occ text,
  catname text,
  bal numeric default 0,
  created_at timestamptz not null default now()
);
GRANT ALL ON public.member_import_staging TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_import_staging TO sandbox_exec;
ALTER TABLE public.member_import_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.member_import_staging FOR ALL TO service_role USING (true) WITH CHECK (true);
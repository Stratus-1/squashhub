CREATE TABLE public.member_import_staging (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  batch text not null,
  src_member_no text,
  first_name text,
  last_name text,
  email text,
  phone text,
  address text,
  occupation text,
  gender text,
  date_of_birth date,
  fee_code text,
  fee_amount numeric default 0,
  credit_amount numeric default 0,
  renewal_date date,
  matched_member_id uuid,
  created_at timestamptz not null default now()
);
GRANT ALL ON public.member_import_staging TO service_role;
ALTER TABLE public.member_import_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.member_import_staging FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_member_import_staging_batch ON public.member_import_staging(batch);
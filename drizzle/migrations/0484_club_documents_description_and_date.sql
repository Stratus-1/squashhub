alter table public.club_documents
  add column if not exists description text,
  add column if not exists document_date date,
  add column if not exists description_source text check (description_source in ('ai','manual')),
  add column if not exists described_at timestamptz;
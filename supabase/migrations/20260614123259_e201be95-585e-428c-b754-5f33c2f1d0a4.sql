UPDATE public.club_journal_entries
SET created_at = '2026-05-27 10:00:00+00'
WHERE journal_ref IN (
  '54b3687a-bc4b-43b2-9d43-e029d3152c1d',  -- Vian
  '626269a3-90e4-47d4-aa3f-3cb32a5630ea',  -- Josh
  'ad9231b1-16ca-4dc0-8098-ac11d3eb3ad6'   -- Rachel
);
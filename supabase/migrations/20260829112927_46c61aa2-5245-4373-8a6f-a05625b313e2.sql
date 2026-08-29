UPDATE public.stitch_collections
SET status = 'failed',
    failed_reason = 'No bank debit occurred (verified against Stitch settlement statement 2026-08-05); collection cancelled manually',
    updated_at = now()
WHERE id = 'cea9001e-0fb6-40ba-969e-d9fd22d256bd'
  AND status = 'submitted';
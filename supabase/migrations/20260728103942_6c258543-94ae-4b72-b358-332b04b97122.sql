DO $$
DECLARE m RECORD;
BEGIN
  FOR m IN
    SELECT id FROM public.stitch_mandates
    WHERE status = 'pending'
      AND stitch_mandate_id IS NOT NULL
      AND created_at > now() - interval '30 days'
  LOOP
    UPDATE public.stitch_mandates
       SET status = 'active', authorised_at = COALESCE(authorised_at, now()), updated_at = now()
     WHERE id = m.id;
    BEGIN
      PERFORM public.record_mandate_initial_payment(m.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'initial payment skipped for %: %', m.id, SQLERRM;
    END;
  END LOOP;
END $$;
-- Add Huawei Health to the integration_provider enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'integration_provider'
      AND e.enumlabel = 'huawei_health'
  ) THEN
    ALTER TYPE public.integration_provider ADD VALUE 'huawei_health';
  END IF;
END $$;


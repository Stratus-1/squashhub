ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS shelly_integration_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shelly_supply_mode text CHECK (shelly_supply_mode IN ('self_order','stratsol_supply'));
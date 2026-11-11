-- Standalone club-defined asset accounts (e.g. staff loans) need a non-money
-- carrier; previously they rode on 'cash' and inflated the Cash balance.
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'other_assets';
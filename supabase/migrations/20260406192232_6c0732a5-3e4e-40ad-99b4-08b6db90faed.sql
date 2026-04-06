-- Add new GL account types for a complete chart of accounts
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'bank_current';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'cash';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'membership_income';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'league_fees_income';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'national_body_income';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'league_fees_expense';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'national_body_expense';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'maintenance';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'electricity';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'rent';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'bank_charges';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'gateway_fees';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'general_expense';
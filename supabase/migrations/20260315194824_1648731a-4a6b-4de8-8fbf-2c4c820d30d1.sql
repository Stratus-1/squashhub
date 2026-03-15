
-- Add 'creditors' to the gl_account enum for pass-through liabilities (association/SSA fees)
ALTER TYPE public.gl_account ADD VALUE 'creditors';

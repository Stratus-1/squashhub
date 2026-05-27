-- Add tournament_income to gl_account enum
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'tournament_income';
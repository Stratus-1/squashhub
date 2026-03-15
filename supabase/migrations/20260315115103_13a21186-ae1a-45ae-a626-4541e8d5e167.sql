
-- Allow opponent_id to be nullable for members without auth accounts
ALTER TABLE public.challenges ALTER COLUMN opponent_id DROP NOT NULL;

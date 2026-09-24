ALTER TABLE public.smart_tournament_drafts ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.smart_tournament_drafts ADD COLUMN IF NOT EXISTS last_tab text;
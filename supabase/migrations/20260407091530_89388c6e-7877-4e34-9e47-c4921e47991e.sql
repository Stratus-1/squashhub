-- Make player_a and player_b nullable so matches with visitors/unlinked members can be saved
ALTER TABLE public.matches ALTER COLUMN player_a DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN player_b DROP NOT NULL;
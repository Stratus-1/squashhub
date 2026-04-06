-- Add match_type to club_champs (singles or doubles)
ALTER TABLE public.club_champs
ADD COLUMN match_type text NOT NULL DEFAULT 'singles';

-- Add partner_member_id to entries for doubles pairings
ALTER TABLE public.club_champs_entries
ADD COLUMN partner_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL;

-- Add partner columns to matches for doubles
ALTER TABLE public.club_champs_matches
ADD COLUMN partner_a_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
ADD COLUMN partner_b_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL;
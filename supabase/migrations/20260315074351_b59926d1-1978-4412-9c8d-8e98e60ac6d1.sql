
-- Add club_member_id column to member_credit_transactions
ALTER TABLE public.member_credit_transactions
ADD COLUMN club_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL;

-- Backfill existing rows: match user_id + club_id to find the club_member
UPDATE public.member_credit_transactions mct
SET club_member_id = cm.id
FROM public.club_members cm
WHERE cm.user_id = mct.user_id
  AND cm.club_id = mct.club_id;

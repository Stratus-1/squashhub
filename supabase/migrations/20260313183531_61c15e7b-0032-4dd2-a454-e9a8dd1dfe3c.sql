
-- Fix Sonja's gender to match club convention
UPDATE public.club_members
SET gender = 'Ladies'
WHERE gender = 'female';

UPDATE public.club_members
SET gender = 'Men'
WHERE gender = 'male';

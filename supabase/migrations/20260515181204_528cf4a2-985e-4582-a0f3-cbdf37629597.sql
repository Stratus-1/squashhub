-- Add 'visitor' to club_member_role enum
ALTER TYPE public.club_member_role ADD VALUE IF NOT EXISTS 'visitor';

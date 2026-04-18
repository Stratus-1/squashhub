-- Clear league/NSF code stored as club_member_number so existing members can enter their real club member number on the Profile page
UPDATE public.club_members cm
SET club_member_number = NULL,
    updated_at = now()
WHERE cm.club_member_number IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.platform_league_members plm
    WHERE plm.user_code ILIKE cm.club_member_number
  );
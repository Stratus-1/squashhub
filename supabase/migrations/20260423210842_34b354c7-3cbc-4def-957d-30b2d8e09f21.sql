-- Remove the over-eager auto-registration trigger.
-- It was inserting members into EVERY league in the club whenever their
-- club_member_number matched a platform_league_members.user_code, ignoring
-- gender and the admin's manual league allocation. League rosters are
-- managed exclusively via the Allocate to Leagues dialog.

DROP TRIGGER IF EXISTS trg_auto_create_league_registration ON public.club_members;
DROP FUNCTION IF EXISTS public.auto_create_league_registration_for_member();
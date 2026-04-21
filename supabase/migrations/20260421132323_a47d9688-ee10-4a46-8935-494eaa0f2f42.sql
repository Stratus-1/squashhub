-- Allocate next NSC member number to Susan Crafford (she was onboarded before
-- auto_number_existing_onboarding was enabled, so the wizard never assigned one).
UPDATE public.club_members
SET club_member_number = 'NSC-193',
    updated_at = now()
WHERE id = '21612dc7-2dc2-4bf4-aa16-3dcfba8d3505'
  AND club_member_number IS NULL;
-- Fix 1: Tighten notifications INSERT policy
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;

CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = user_id)
    OR (
      club_member_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.club_members cm
        WHERE cm.id = notifications.club_member_id
          AND public.is_club_admin(auth.uid(), cm.club_id)
      )
    )
  );

-- Fix 2: Drop sensitive columns from clubs table (already migrated to club_secrets)
ALTER TABLE public.clubs
  DROP COLUMN IF EXISTS smtp_pass,
  DROP COLUMN IF EXISTS smtp_user,
  DROP COLUMN IF EXISTS smtp_host,
  DROP COLUMN IF EXISTS smtp_port,
  DROP COLUMN IF EXISTS shelly_auth_key,
  DROP COLUMN IF EXISTS payment_gateway_secret_key,
  DROP COLUMN IF EXISTS sender_email,
  DROP COLUMN IF EXISTS sender_name,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_branch_code,
  DROP COLUMN IF EXISTS bank_reference,
  DROP COLUMN IF EXISTS bank_account_name,
  DROP COLUMN IF EXISTS bank_name;
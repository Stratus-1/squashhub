CREATE OR REPLACE FUNCTION public.request_account_delegation(_grantor_member_id uuid, _delegate_member_number text, _delegate_cell text)
 RETURNS member_account_delegations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_grantor public.club_members%ROWTYPE;
  v_delegate public.club_members%ROWTYPE;
  v_norm_cell text;
  v_active_count int;
  v_row public.member_account_delegations%ROWTYPE;
BEGIN
  SELECT * INTO v_grantor FROM public.club_members
   WHERE id = _grantor_member_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to grant access for this member';
  END IF;

  v_norm_cell := regexp_replace(coalesce(_delegate_cell,''), '[^0-9]', '', 'g');
  IF length(v_norm_cell) < 9 THEN
    RAISE EXCEPTION 'Please enter a valid cell phone number';
  END IF;

  SELECT * INTO v_delegate FROM public.club_members
   WHERE club_id = v_grantor.club_id
     AND lower(club_member_number) = lower(trim(_delegate_member_number))
     AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') LIKE '%' || v_norm_cell
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No member found with that member number and cell phone in your club';
  END IF;

  IF v_delegate.id = v_grantor.id THEN
    RAISE EXCEPTION 'You cannot delegate access to yourself';
  END IF;

  SELECT count(*) INTO v_active_count
    FROM public.member_account_delegations
   WHERE delegate_member_id = v_delegate.id
     AND status IN ('pending','active');
  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'This person already manages the maximum of 5 linked accounts';
  END IF;

  INSERT INTO public.member_account_delegations (
    club_id, grantor_member_id, delegate_member_id, scope, status, requested_by_user_id
  ) VALUES (
    v_grantor.club_id, v_grantor.id, v_delegate.id, 'fees', 'pending', auth.uid()
  )
  RETURNING * INTO v_row;

  -- Notify the delegate (only if they have a login linked)
  IF v_delegate.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, club_member_id, type, title, message, url, data)
    VALUES (
      v_delegate.user_id,
      v_delegate.id,
      'delegation_request',
      'Account access request',
      coalesce(v_grantor.name,'A club member') || ' wants you to manage and pay their account.',
      '/profile',
      jsonb_build_object('delegation_id', v_row.id, 'grantor_member_id', v_grantor.id)
    );
  END IF;

  RETURN v_row;
END;
$function$;
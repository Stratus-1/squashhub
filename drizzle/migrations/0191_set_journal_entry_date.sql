CREATE OR REPLACE FUNCTION public.set_journal_entry_date(_club_id uuid, _ref uuid, _date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, 'finance') THEN
    RAISE EXCEPTION 'You do not have finance permission for this club';
  END IF;
  IF _date IS NULL OR _date > (now() AT TIME ZONE 'Africa/Johannesburg')::date + 366 THEN
    RAISE EXCEPTION 'Invalid date';
  END IF;
  UPDATE public.club_journal_entries
     SET created_at = (_date::timestamp + time '12:00') AT TIME ZONE 'Africa/Johannesburg'
   WHERE club_id = _club_id AND journal_ref = _ref;
END $$;
REVOKE ALL ON FUNCTION public.set_journal_entry_date(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_journal_entry_date(uuid, uuid, date) TO authenticated;
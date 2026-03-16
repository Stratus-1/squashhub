
CREATE OR REPLACE FUNCTION public.get_next_member_number(_club_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix text;
  _length integer;
  _start integer;
  _max_num integer;
  _next_num integer;
  _result text;
BEGIN
  SELECT
    COALESCE(member_number_prefix, ''),
    COALESCE(member_number_length, 4),
    COALESCE(member_number_start, 1)
  INTO _prefix, _length, _start
  FROM public.clubs
  WHERE id = _club_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Find the highest existing number with this prefix
  SELECT COALESCE(MAX(
    CASE
      WHEN _prefix = '' THEN
        CASE WHEN club_member_number ~ '^\d+$' THEN club_member_number::integer ELSE NULL END
      WHEN club_member_number LIKE _prefix || '%' THEN
        CASE WHEN substring(club_member_number FROM length(_prefix) + 1) ~ '^\d+$'
             THEN substring(club_member_number FROM length(_prefix) + 1)::integer
             ELSE NULL END
      ELSE NULL
    END
  ), _start - 1)
  INTO _max_num
  FROM public.club_members
  WHERE club_id = _club_id
    AND club_member_number IS NOT NULL;

  _next_num := _max_num + 1;
  IF _next_num < _start THEN
    _next_num := _start;
  END IF;

  -- Use GREATEST to never truncate numbers longer than the configured length
  _result := _prefix || lpad(_next_num::text, GREATEST(_length, length(_next_num::text)), '0');
  RETURN _result;
END;
$$;

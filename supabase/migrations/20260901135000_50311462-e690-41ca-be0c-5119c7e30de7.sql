CREATE OR REPLACE FUNCTION public.default_member_number_prefix(_name text, _subdomain text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _w text;
  _out text := '';
BEGIN
  FOREACH _w IN ARRAY regexp_split_to_array(coalesce(_name, ''), '[^A-Za-z0-9]+')
  LOOP
    IF _w <> '' THEN
      _out := _out || upper(left(_w, 1));
    END IF;
  END LOOP;

  IF length(_out) < 2 THEN
    _out := upper(regexp_replace(coalesce(_subdomain, ''), '[^A-Za-z0-9]', '', 'g'));
  END IF;

  RETURN left(_out, 6);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_club_member_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _next text;
BEGIN
  IF NEW.club_member_number IS NOT NULL AND NEW.club_member_number <> '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.clubs
  SET member_number_prefix = public.default_member_number_prefix(name, subdomain)
  WHERE id = NEW.club_id AND COALESCE(member_number_prefix, '') = '';

  _next := public.get_next_member_number(NEW.club_id);
  IF _next IS NOT NULL AND _next <> '' THEN
    NEW.club_member_number := _next;
  END IF;

  RETURN NEW;
END;
$$;
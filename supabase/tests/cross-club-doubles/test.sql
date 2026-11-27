-- An eligible outside-club member may partner a host-club player.
INSERT INTO public.champ_doubles_pairs(champ_id, group_number, member_a, member_b)
VALUES (
  '00000000-0000-0000-0000-000000000010', 3,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000201'
);

-- A club outside the tournament remains blocked.
DO $$ BEGIN
  BEGIN
    INSERT INTO public.champ_doubles_pairs(champ_id, group_number, member_a, member_b)
    VALUES (
      '00000000-0000-0000-0000-000000000010', 3,
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000301'
    );
    RAISE EXCEPTION 'Outside tournament club was allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Partner is not eligible for this tournament' THEN RAISE; END IF;
  END;
END $$;

-- Mixed doubles still requires one man and one lady.
DO $$ BEGIN
  BEGIN
    INSERT INTO public.champ_doubles_pairs(champ_id, group_number, member_a, member_b)
    VALUES (
      '00000000-0000-0000-0000-000000000010', 3,
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000103'
    );
    RAISE EXCEPTION 'Same-gender mixed pair was allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Mixed doubles requires one man and one lady' THEN RAISE; END IF;
  END;
END $$;

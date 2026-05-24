DROP POLICY IF EXISTS "Club members can view champs" ON public.club_champs;
DROP POLICY IF EXISTS "Club admins can insert champs" ON public.club_champs;
DROP POLICY IF EXISTS "Club admins can update champs" ON public.club_champs;
DROP POLICY IF EXISTS "Club admins can delete champs" ON public.club_champs;

CREATE POLICY "Club members and tournament admins can view champs"
ON public.club_champs
FOR SELECT
TO authenticated
USING (
  public.is_club_member(auth.uid(), club_id)
  OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'champs')
);

CREATE POLICY "Tournament admins can insert champs"
ON public.club_champs
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_club_admin_or_permitted(auth.uid(), club_id, 'champs')
);

CREATE POLICY "Tournament admins can update champs"
ON public.club_champs
FOR UPDATE
TO authenticated
USING (
  public.is_club_admin_or_permitted(auth.uid(), club_id, 'champs')
)
WITH CHECK (
  public.is_club_admin_or_permitted(auth.uid(), club_id, 'champs')
);

CREATE POLICY "Tournament admins can delete champs"
ON public.club_champs
FOR DELETE
TO authenticated
USING (
  public.is_club_admin_or_permitted(auth.uid(), club_id, 'champs')
);

DROP POLICY IF EXISTS "Club members can view entries" ON public.club_champs_entries;
DROP POLICY IF EXISTS "Club admins can insert entries" ON public.club_champs_entries;
DROP POLICY IF EXISTS "Club admins can update entries" ON public.club_champs_entries;
DROP POLICY IF EXISTS "Club admins can delete entries" ON public.club_champs_entries;

CREATE POLICY "Club members and tournament admins can view entries"
ON public.club_champs_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_entries.champ_id
      AND (
        public.is_club_member(auth.uid(), c.club_id)
        OR public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
      )
  )
);

CREATE POLICY "Tournament admins can insert entries"
ON public.club_champs_entries
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_entries.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
);

CREATE POLICY "Tournament admins can update entries"
ON public.club_champs_entries
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_entries.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_entries.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
);

CREATE POLICY "Tournament admins can delete entries"
ON public.club_champs_entries
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_entries.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
);

DROP POLICY IF EXISTS "Club members can view champs matches" ON public.club_champs_matches;
DROP POLICY IF EXISTS "Club admins can insert champs matches" ON public.club_champs_matches;
DROP POLICY IF EXISTS "Club admins can update champs matches" ON public.club_champs_matches;
DROP POLICY IF EXISTS "Club admins can delete champs matches" ON public.club_champs_matches;

CREATE POLICY "Club members and tournament admins can view champs matches"
ON public.club_champs_matches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_matches.champ_id
      AND (
        public.is_club_member(auth.uid(), c.club_id)
        OR public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
      )
  )
);

CREATE POLICY "Tournament admins can insert champs matches"
ON public.club_champs_matches
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_matches.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
);

CREATE POLICY "Tournament admins can update champs matches"
ON public.club_champs_matches
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_matches.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_matches.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
);

CREATE POLICY "Tournament admins can delete champs matches"
ON public.club_champs_matches
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_matches.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
);

DROP POLICY IF EXISTS "Admins manage registrations" ON public.club_champs_registrations;
DROP POLICY IF EXISTS "Members view registrations in their club" ON public.club_champs_registrations;

CREATE POLICY "Tournament admins manage registrations"
ON public.club_champs_registrations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_registrations.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_registrations.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
  )
);

CREATE POLICY "Members view registrations in their club"
ON public.club_champs_registrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_registrations.champ_id
      AND (
        public.is_club_member(auth.uid(), c.club_id)
        OR public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs')
      )
  )
);
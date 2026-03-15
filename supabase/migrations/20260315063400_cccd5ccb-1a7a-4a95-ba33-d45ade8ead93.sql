
-- Security definer function to check if two users share a club
CREATE OR REPLACE FUNCTION public.is_club_mate(_user_id uuid, _other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members cm1
    JOIN public.club_members cm2 ON cm1.club_id = cm2.club_id
    WHERE cm1.user_id = _user_id
      AND cm2.user_id = _other_user_id
  )
$$;

-- Drop the overly broad policy
DROP POLICY IF EXISTS "Profiles viewable by all authenticated users" ON public.profiles;

-- Own profile: always readable
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Club mates: can see profiles of people in the same club
CREATE POLICY "Club mates can read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (is_club_mate(auth.uid(), id));

-- Platform admins: can read all profiles
CREATE POLICY "Platform admins can read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

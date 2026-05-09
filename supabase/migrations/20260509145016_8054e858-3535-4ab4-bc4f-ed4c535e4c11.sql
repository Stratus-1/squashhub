
UPDATE public.club_permission_roles
SET is_full_admin = true
WHERE lower(role_name) IN ('chairman','secretary','club captain','captain','full admin');

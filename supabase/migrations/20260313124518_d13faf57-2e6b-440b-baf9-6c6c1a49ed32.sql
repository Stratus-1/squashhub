-- Allow platform admins to delete clubs
CREATE POLICY "Platform admins can delete clubs"
ON public.clubs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow platform admins to update any club (not just club admins)
CREATE POLICY "Platform admins can update any club"
ON public.clubs
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
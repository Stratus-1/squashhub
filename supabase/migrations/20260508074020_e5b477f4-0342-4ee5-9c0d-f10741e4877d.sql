UPDATE public.bookings b
SET guest_name = 'League - ' || lh.name || ' vs ' || la.name
FROM public.leagues lh, public.leagues la
WHERE b.guest_name ~ '^League: NIL[0-9]+ vs NIL[0-9]+$'
  AND lh.code = split_part(split_part(b.guest_name, 'League: ', 2), ' vs ', 1)
  AND la.code = split_part(b.guest_name, ' vs ', 2);
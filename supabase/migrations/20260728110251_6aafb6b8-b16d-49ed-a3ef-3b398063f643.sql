UPDATE public.stitch_mandates
SET auth_url = split_part(auth_url, '?', 1)
WHERE status = 'pending'
  AND auth_url LIKE '%?redirect_url=%';
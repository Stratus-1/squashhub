ALTER TABLE public.clubs ADD COLUMN subdomain text UNIQUE;

-- Create index for fast subdomain lookups
CREATE INDEX idx_clubs_subdomain ON public.clubs (subdomain) WHERE subdomain IS NOT NULL;
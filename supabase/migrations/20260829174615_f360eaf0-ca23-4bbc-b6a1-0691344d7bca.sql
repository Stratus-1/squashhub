ALTER TABLE public.sportyhq_org_members ALTER COLUMN sportyhq_user_id DROP NOT NULL;
ALTER TABLE public.sportyhq_org_members ADD COLUMN ranking_slug text;
ALTER TABLE public.sportyhq_org_members ADD COLUMN rank_position integer;
ALTER TABLE public.sportyhq_org_members ADD COLUMN rank_points integer;
ALTER TABLE public.sportyhq_org_members ADD COLUMN rank_confidence text;
ALTER TABLE public.sportyhq_org_members ADD COLUMN club_label text;
ALTER TABLE public.sportyhq_org_members DROP CONSTRAINT sportyhq_org_members_org_id_sportyhq_user_id_key;
CREATE UNIQUE INDEX sportyhq_org_members_org_slug_key ON public.sportyhq_org_members (org_id, ranking_slug) WHERE ranking_slug IS NOT NULL;
CREATE UNIQUE INDEX sportyhq_org_members_org_user_key ON public.sportyhq_org_members (org_id, sportyhq_user_id) WHERE sportyhq_user_id IS NOT NULL;
ALTER TABLE public.club_champs_entries
ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY champ_id, group_number
      ORDER BY created_at, id
    ) - 1 AS rn
  FROM public.club_champs_entries
)
UPDATE public.club_champs_entries e
SET order_index = ranked.rn
FROM ranked
WHERE ranked.id = e.id;

CREATE INDEX IF NOT EXISTS idx_club_champs_entries_champ_group_order
ON public.club_champs_entries (champ_id, group_number, order_index);
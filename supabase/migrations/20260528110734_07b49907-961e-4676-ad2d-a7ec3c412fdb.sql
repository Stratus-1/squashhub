-- Remove duplicate Yoco-card credit transactions, keeping the earliest row per (club_member_id, reference)
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY club_member_id, reference
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.member_credit_transactions
  WHERE method = 'card'
    AND reference IS NOT NULL
    AND reference <> ''
)
DELETE FROM public.member_credit_transactions
WHERE id IN (SELECT id FROM dups WHERE rn > 1);

-- Prevent the same Yoco card charge from being recorded twice for a member going forward
CREATE UNIQUE INDEX IF NOT EXISTS member_credit_tx_card_ref_uniq
  ON public.member_credit_transactions (club_member_id, reference)
  WHERE method = 'card' AND reference IS NOT NULL AND reference <> '';

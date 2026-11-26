-- Chairmen may manage the bar/shop item catalogue (names, prices, sizes); stock purchases, cash-ups and ledger stay view-only.
DROP TRIGGER IF EXISTS chairman_finance_read_only ON public.bar_items;
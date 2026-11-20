CREATE INDEX IF NOT EXISTS bar_stock_movements_source_idx
  ON public.bar_stock_movements (club_id, source_table, source_id);
CREATE INDEX IF NOT EXISTS bar_tab_entries_club_created_idx
  ON public.bar_tab_entries (club_id, created_at);
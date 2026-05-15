
CREATE OR REPLACE FUNCTION public.bar_tab_entry_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_name text;
  v_member_name text;
  v_desc text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO v_item_name FROM bar_items WHERE id = NEW.bar_item_id;
    SELECT COALESCE(name, 'Member') INTO v_member_name FROM club_members WHERE id = NEW.club_member_id;
    v_desc := 'Bar sale: ' || NEW.quantity::text || '× ' || COALESCE(v_item_name, 'item') || ' — ' || v_member_name;

    INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description, club_member_id)
    VALUES
      (NEW.club_id, NEW.id, 'debtors',    NEW.total, 0,         v_desc, NEW.club_member_id),
      (NEW.club_id, NEW.id, 'bar_income', 0,         NEW.total, v_desc, NEW.club_member_id);

    IF NEW.settled THEN
      v_desc := 'Bar tab settled — ' || v_member_name;
      INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description, club_member_id)
      VALUES
        (NEW.club_id, NEW.id, 'bank_current', NEW.total, 0,         v_desc, NEW.club_member_id),
        (NEW.club_id, NEW.id, 'debtors',      0,         NEW.total, v_desc, NEW.club_member_id);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.settled AND NOT OLD.settled THEN
      SELECT COALESCE(name, 'Member') INTO v_member_name FROM club_members WHERE id = NEW.club_member_id;
      v_desc := 'Bar tab settled — ' || v_member_name;
      INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description, club_member_id)
      VALUES
        (NEW.club_id, NEW.id, 'bank_current', NEW.total, 0,         v_desc, NEW.club_member_id),
        (NEW.club_id, NEW.id, 'debtors',      0,         NEW.total, v_desc, NEW.club_member_id);
    ELSIF OLD.settled AND NOT NEW.settled THEN
      DELETE FROM club_journal_entries
       WHERE journal_ref = NEW.id
         AND (account = 'bank_current' OR (account = 'debtors' AND credit > 0));
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM club_journal_entries WHERE journal_ref = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bar_tab_entry_journal_trg ON public.bar_tab_entries;
CREATE TRIGGER bar_tab_entry_journal_trg
AFTER INSERT OR UPDATE OF settled OR DELETE ON public.bar_tab_entries
FOR EACH ROW EXECUTE FUNCTION public.bar_tab_entry_journal();

DO $$
DECLARE r record; v_item text; v_member text; v_desc text;
BEGIN
  FOR r IN
    SELECT bte.* FROM bar_tab_entries bte
    WHERE NOT EXISTS (SELECT 1 FROM club_journal_entries je WHERE je.journal_ref = bte.id AND je.account = 'bar_income')
  LOOP
    SELECT name INTO v_item FROM bar_items WHERE id = r.bar_item_id;
    SELECT COALESCE(name, 'Member') INTO v_member FROM club_members WHERE id = r.club_member_id;
    v_desc := 'Bar sale: ' || r.quantity::text || '× ' || COALESCE(v_item, 'item') || ' — ' || v_member;
    INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description, club_member_id)
    VALUES
      (r.club_id, r.id, 'debtors',    r.total, 0,       v_desc, r.club_member_id),
      (r.club_id, r.id, 'bar_income', 0,       r.total, v_desc, r.club_member_id);

    IF r.settled THEN
      v_desc := 'Bar tab settled — ' || v_member;
      INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description, club_member_id)
      VALUES
        (r.club_id, r.id, 'bank_current', r.total, 0,       v_desc, r.club_member_id),
        (r.club_id, r.id, 'debtors',      0,       r.total, v_desc, r.club_member_id);
    END IF;
  END LOOP;
END $$;

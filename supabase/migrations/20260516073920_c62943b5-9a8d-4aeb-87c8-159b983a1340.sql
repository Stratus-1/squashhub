CREATE OR REPLACE FUNCTION public.bar_tab_entry_account_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_name text;
  v_user_id uuid;
BEGIN
  SELECT name INTO v_item_name
  FROM public.bar_items
  WHERE id = NEW.bar_item_id;

  SELECT user_id INTO v_user_id
  FROM public.club_members
  WHERE id = NEW.club_member_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.member_credit_transactions (
    club_id,
    club_member_id,
    user_id,
    amount,
    type,
    method,
    description,
    reference,
    status,
    confirmed_at
  )
  VALUES (
    NEW.club_id,
    NEW.club_member_id,
    v_user_id,
    NEW.total,
    'credit',
    'bar',
    'Honesty Bar: ' || NEW.quantity::text || '× ' || COALESCE(v_item_name, 'Item'),
    'bar_tab_entry:' || NEW.id::text,
    'confirmed',
    now()
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bar_tab_entry_account_charge_trg ON public.bar_tab_entries;
CREATE TRIGGER bar_tab_entry_account_charge_trg
AFTER INSERT ON public.bar_tab_entries
FOR EACH ROW
EXECUTE FUNCTION public.bar_tab_entry_account_charge();

INSERT INTO public.member_credit_transactions (
  club_id,
  club_member_id,
  user_id,
  amount,
  type,
  method,
  description,
  reference,
  status,
  confirmed_at,
  created_at
)
SELECT
  bte.club_id,
  bte.club_member_id,
  cm.user_id,
  bte.total,
  'credit',
  'bar',
  'Honesty Bar: ' || bte.quantity::text || '× ' || COALESCE(bi.name, 'Item'),
  'bar_tab_entry:' || bte.id::text,
  'confirmed',
  COALESCE(bte.created_at, now()),
  COALESCE(bte.created_at, now())
FROM public.bar_tab_entries bte
JOIN public.club_members cm ON cm.id = bte.club_member_id
LEFT JOIN public.bar_items bi ON bi.id = bte.bar_item_id
WHERE bte.settled = false
  AND cm.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.member_credit_transactions mct
    WHERE mct.reference = 'bar_tab_entry:' || bte.id::text
  );

CREATE OR REPLACE FUNCTION public.bar_tab_entry_journal()
RETURNS trigger
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
    SELECT name INTO v_item_name FROM public.bar_items WHERE id = NEW.bar_item_id;
    SELECT COALESCE(name, 'Member') INTO v_member_name FROM public.club_members WHERE id = NEW.club_member_id;
    v_desc := 'Bar sale: ' || NEW.quantity::text || '× ' || COALESCE(v_item_name, 'item') || ' — ' || v_member_name;

    INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description, club_member_id)
    VALUES
      (NEW.club_id, NEW.id, 'debtors', NEW.total, 0, v_desc, NEW.club_member_id),
      (NEW.club_id, NEW.id, 'bar_income', 0, NEW.total, v_desc, NEW.club_member_id);

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.club_journal_entries WHERE journal_ref = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bar_tab_entry_journal_trg ON public.bar_tab_entries;
CREATE TRIGGER bar_tab_entry_journal_trg
AFTER INSERT OR DELETE ON public.bar_tab_entries
FOR EACH ROW
EXECUTE FUNCTION public.bar_tab_entry_journal();
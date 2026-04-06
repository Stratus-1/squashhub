
ALTER TABLE public.bar_stock_purchases
  ADD COLUMN invoice_number text,
  ADD COLUMN invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN payment_method text NOT NULL DEFAULT 'cash';

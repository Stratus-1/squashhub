ALTER TABLE public.shop_orders DROP CONSTRAINT shop_orders_back_name_check;
ALTER TABLE public.shop_orders ADD CONSTRAINT shop_orders_back_name_check CHECK (char_length(back_name) <= 20);
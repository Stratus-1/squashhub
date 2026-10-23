-- Club finance-permission holders (e.g. Treasurer role) may bill members and add outstanding balances in their own club.
CREATE OR REPLACE FUNCTION public.admin_bill_member_fee(_club_member_id uuid, _amount numeric, _fee_label text, _income_account text, _fee_type text DEFAULT 'club'::text, _date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;

CREATE OR REPLACE FUNCTION public.admin_add_member_outstanding_balance(_club_id uuid, _club_member_id uuid, _amount numeric, _description text, _date timestamp with time zone, _request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$;


CREATE OR REPLACE FUNCTION public.champ_fee_line_label(p_champ_id uuid, p_member_id uuid, p_groups integer[])
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- "No Frills Doubles – Jan Goosen – Mens Doubles & Mixed Doubles"
  SELECT coalesce((SELECT name FROM public.club_champs WHERE id = p_champ_id), 'Tournament')
      || ' – ' || coalesce((SELECT name FROM public.club_members WHERE id = p_member_id), 'player')
      || coalesce(' – ' || (
           SELECT string_agg(trim(regexp_replace(
                    public.tournament_group_display_label(t.beta_lifecycle, t.group_labels ->> g::text, g),
                    '\s*·\s*', ' ', 'g')), ' & ' ORDER BY g)
             FROM public.tournaments t, unnest(coalesce(p_groups, '{}'::int[])) g
            WHERE t.id = p_champ_id AND g > 0 AND nullif(trim(t.group_labels ->> g::text), '') IS NOT NULL), '');
$function$;

CREATE OR REPLACE FUNCTION public.champ_reg_fee_label(p_reg_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Label for the categories this player pays for themselves.
  SELECT public.champ_fee_line_label(r.champ_id, r.club_member_id,
           ARRAY(SELECT g FROM unnest(public.champ_reg_groups(r.division_choices)) g
                  WHERE NOT public.champ_event_covered_by_other(r.id, g) ORDER BY g))
    FROM public.club_champs_registrations r WHERE r.id = p_reg_id;
$function$;

REVOKE ALL ON FUNCTION public.champ_fee_line_label(uuid, uuid, integer[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.champ_reg_fee_label(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.champ_fee_line_label(uuid, uuid, integer[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.champ_reg_fee_label(uuid) TO authenticated, service_role;

CREATE FUNCTION pg_temp.fx_swap(d text, a text, b text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'expected fragment not found exactly once: %', left(a, 80);
  END IF;
  RETURN replace(d, a, b);
END $f$;

DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.ensure_tournament_entry_fee'::regproc);
  d := pg_temp.fx_swap(d, $x$v_label := coalesce(v_champ.name, 'Tournament') || ' entry fee';$x$,
    $x$v_label := coalesce(public.champ_reg_fee_label(p_registration_id), coalesce(v_champ.name, 'Tournament') || ' entry fee');$x$);
  EXECUTE d;

  d := pg_get_functiondef('public.refresh_tournament_entry_fee'::regproc);
  d := pg_temp.fx_swap(d, $x$v_label text; v_bill uuid;$x$, $x$v_label text; v_bill uuid; v_legacy text; v_new_label text;$x$);
  d := pg_temp.fx_swap(d, $x$  IF NOT f.paid AND f.invoice_issued_at IS NULL THEN
    RETURN public._champ_fee_adjust($x$,
    $x$  IF NOT f.paid AND f.invoice_issued_at IS NULL THEN
    -- Keep the unpaid line's name in step with the categories it now covers.
    v_new_label := public.champ_reg_fee_label(r.id);
    IF v_new_label IS NOT NULL AND v_new_label <> f.fee_label AND f.fee_label LIKE coalesce(ch.name, 'Tournament') || '%'
       AND NOT EXISTS (SELECT 1 FROM public.club_member_fee_payments y
                        WHERE y.club_member_id = f.club_member_id AND y.fee_type = f.fee_type
                          AND y.season_year = f.season_year AND y.fee_label = v_new_label AND y.id <> f.id) THEN
      UPDATE public.club_member_fee_payments SET fee_label = v_new_label WHERE id = f.id;
    END IF;
    RETURN public._champ_fee_adjust($x$);
  d := pg_temp.fx_swap(d, $x$v_label := coalesce(ch.name, 'Tournament') || ' entry fee – additional events';$x$,
    $x$v_label := coalesce(ch.name, 'Tournament') || ' – ' || coalesce((SELECT name FROM public.club_members WHERE id = r.club_member_id), 'player') || ' – additional categories';
  v_legacy := coalesce(ch.name, 'Tournament') || ' entry fee – additional events';$x$);
  d := pg_temp.fx_swap(d, $x$AND fee_label LIKE v_label || '%'
     AND season_year$x$,
    $x$AND (fee_label LIKE v_label || '%' OR fee_label LIKE v_legacy || '%')
     AND season_year$x$);
  d := pg_temp.fx_swap(d, $x$AND fee_label = v_label
$x$,
    $x$AND (fee_label LIKE v_label || '%' OR fee_label LIKE v_legacy || '%')
$x$);
  d := pg_temp.fx_swap(d, $x$AND fee_label LIKE v_label || '%'
                AND season_year$x$,
    $x$AND (fee_label LIKE v_label || '%' OR fee_label LIKE v_legacy || '%')
                AND season_year$x$);
  EXECUTE d;

  d := pg_get_functiondef('public.champ_partner_cover_cents'::regproc);
  d := pg_temp.fx_swap(d, $x$AND x.fee_label LIKE coalesce(c.name, 'Tournament') || ' entry fee – additional events%'));$x$,
    $x$AND (x.fee_label LIKE coalesce(c.name, 'Tournament') || ' entry fee – additional events%'
                  OR x.fee_label LIKE coalesce(c.name, 'Tournament') || ' – ' || coalesce((SELECT name FROM public.club_members WHERE id = r.club_member_id), 'player') || ' – additional categories%')));$x$);
  EXECUTE d;

  -- Card/bank partner payments: record the partner's entry on the payer's account.
  d := pg_get_functiondef('public._champ_record_partner_cover_fee'::regproc);
  d := pg_temp.fx_swap(d, $x$v_bill := public.resolve_host_billing_member(r.club_member_id, ch.club_id);$x$,
    $x$v_bill := public.resolve_host_billing_member(p_payer, ch.club_id);$x$);
  d := pg_temp.fx_swap(d, $x$v_label := coalesce(ch.name, 'Tournament') || ' entry fee – paid by ' || coalesce(v_payer_name, 'partner');$x$,
    $x$v_label := public.champ_fee_line_label(r.champ_id, r.club_member_id, ARRAY[coalesce(p_group, 0)]) || ' (paid by ' || coalesce(v_payer_name, 'partner') || ')';$x$);
  EXECUTE d;

  d := pg_get_functiondef('public.step_charge_pair_to_account'::regproc);
  d := pg_temp.fx_swap(d, $x$coalesce(v_champ.name,'Tournament') || ' entry fee – for ' || coalesce(v_pname,'partner')
          || CASE WHEN v_group > 0 THEN ' (' || public.champ_group_label(v_champ.id, v_group) || ')' ELSE '' END,$x$,
    $x$public.champ_fee_line_label(v_champ.id, v_partner.club_member_id, ARRAY[coalesce(v_group, 0)])
          || ' (paid by ' || coalesce((SELECT name FROM public.club_members WHERE id = v_payer), 'partner') || ')',$x$);
  EXECUTE d;

  d := pg_get_functiondef('public.invite_settle_entry'::regproc);
  d := pg_temp.fx_swap(d, $x$coalesce(c.name,'Tournament') || ' entry fee – for ' || coalesce(v_pname,'partner')
              || ' (' || public.champ_group_label(r.champ_id, p.group_number) || ')',$x$,
    $x$public.champ_fee_line_label(r.champ_id, v_partner, ARRAY[p.group_number])
              || ' (paid by ' || coalesce((SELECT name FROM public.club_members WHERE id = r.club_member_id), 'partner') || ')',$x$);
  EXECUTE d;
END $mig$;
DROP FUNCTION pg_temp.fx_swap(text, text, text);
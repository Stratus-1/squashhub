DO $test$
DECLARE s jsonb; n jsonb;
BEGIN
 s:=public._bar_cash_up_summary('d8397b8a-60d3-4c4b-afee-25dab218bf19','2026-10-25T14:17:05.443222Z','2026-10-27T04:42:51.33653Z');
 IF (s->>'cash_opening')::numeric<>230 OR (s->>'cash_movements')::numeric<>-230 OR (s->>'expected_cash')::numeric<>20 THEN RAISE EXCEPTION 'R230 expense must reduce R250 expected cash to R20: %',s; END IF;
 n:=public._bar_cash_up_summary('d8397b8a-60d3-4c4b-afee-25dab218bf19','2026-10-27T04:42:51.33653Z','2026-10-27T05:00:00Z');
 IF (n->>'cash_opening')::numeric<>20 OR (n->>'cash_movements')::numeric<>0 OR (n->>'expected_cash')::numeric<>20 THEN RAISE EXCEPTION 'Next shift must retain R20 without deducting expense again: %',n; END IF;
END $test$;
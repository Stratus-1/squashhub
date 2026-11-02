# Marker rules

- Doubles serving is a pure state machine in `src/lib/marker/doubles-serving.ts` (methods even_odd/by_position/second_server; even_odd side = combined score of both pairs, even → right); the method lives on `league_rules.doubles_serving_method` and `tournaments.doubles_serving_method` / `league_doubles_serving_methods` (null = manual legacy serving), and the marker persists positions + server state with its local session; why: the marker must know the real server per pair and singles must stay untouched.

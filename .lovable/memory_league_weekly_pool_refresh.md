---
name: League Weekly Pool Refresh
description: Fill Up Leagues must refresh weekly available pools from actual prior-week lineups/results
type: feature
---
Fill Up Leagues available pools must refresh every planning week from the previous week's actual played team first, then fall back to static `member_league_registrations`.

Sources of actual played team:
- `league_week_lineups` for the previous planning week
- saved `league_match_results` matched by fixture team code and player league number

If a League 7 player played for League 6 last week, they should appear in League 6's available pool for the next fill-up cycle, not only in League 7. Avoid duplicate pool entries by assigning each player one effective weekly home league.

# Roadmap

## Open
- [ ] Court grid must show 35-min champ games (names + championship) on every 45-min row they overlap — 19:10 game must not leave 18:45 row looking free (Willem, 18 Oct)
- [ ] Members must not be able to book a 45-min slot that overlaps a 35-min champ game (Willem, 18 Oct)
- [ ] Champ game reschedule must release the old court slot — remove hold-restore on move (Willem, 18 Oct)
- [ ] Reschedule dialog offers the champs' own 35-min slots inside the reserved evening; normal 45-min slots stay outside champs times (Willem, 18 Oct) — dialog done, needs tests + verification
- [ ] Awaiting Willem's go-ahead: publish these fixes (+ edge function deploy)
- [ ] Pending rollouts awaiting Willem's word: recurring transactions, average-cost fill-in, two-decimal money display, cost-per-tot hint on purchase lines, WhatsApp/SMS switches, Enter Transaction date fix, dialog size fix

## Done
- [x] Diagnosed blank Round 2 slots: 35-min games (19:10/20:20) don't align to the 45-min grid rows
- [x] Reverted grid-snapping approach — Willem confirmed 35-minute slots are intentional

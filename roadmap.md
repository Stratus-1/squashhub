# Roadmap

- [x] Remove Karel Budler's attendance (decline RSVP) for Thu 17 Sep 2026 Thursday Social (CSIR club)
- [x] Add 36-hour option to event reminder settings (CreateClubEvent form + reminder selection)
- [x] Ensure a scheduled job runs the event reminders (in-app + WhatsApp/email when chosen) at the configured hours-before time (24h or 36h) — daily cron `event-reminders-daily` at 06:00 SA
- [x] Confirm 24-hour reminders for tomorrow's event fire correctly once cron is wired — manual smoke test sent 8 in-app + 8 WhatsApp reminders; booking-null-UUID crash fixed; one-send-per-occurrence dedup in place
- [ ] Awaiting Willem's fresh Nelspruit guest tournament payment result (new link should contain nsc.squashhub.co.za/my-account)
- [ ] Deploy `family-invite` edge function (written, not deployed)
- [ ] Monitor Meta approval of the button-free `rsvp_question` template (v4)
- [x] Fix the Family Doubles accepted/unpaid invitation state so verification resumes the existing partner choice or loads eligible partners
- [x] Allow one Family Doubles invite holder to create multiple exact pairs and pay each selected player once
- [x] Correct Rachel's guest Stitch amount from R150 to R300 for her active two-player pair
- [x] Replace the stale app-shell worker that made valid tournament invitations appear unavailable on installed Android phones
- [x] Make the public tournament invitation lookup backward-compatible with short codes from older cached phone pages
- [x] Treat a player pulled out of a tournament as knocked out: no further fixtures/byes, name shown with a strike-through

## WhatsApp invite wording (16 Sep 2026)
- [x] Short, friendly invitation link instead of the long token URL
- [x] Reword invite: single "tap here to accept or decline" (new template awaiting WhatsApp approval)

# Roadmap

## Open
- WhatsApp "Pay my fee" button template (`club_notice_pay`) — submitted to Meta 2026-10-09, status `received` (up to ~48h). When approved it switches over automatically: `send-comms-campaign` already selects it for owing players with a `pay_token`. Check with `select key, approval_status from whatsapp_templates where key='club_notice_pay'`.
- Shorten the WhatsApp club notice opening line to "Update from <club>:" — waiting on Meta approval of `club_notice_v5`; when approved, update the `club_notice` row (body + content_sid + friendly_name) in `public.whatsapp_templates`.

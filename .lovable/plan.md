## Goal

Grow the outreach prospect list with squash clubs that aren't already in the CRM, worldwide, keeping only clubs with a real, usable email address.

## Current coverage (verified)

| Country | Prospects |
| --- | --- |
| South Africa | 63 |
| Canada | 40 |
| UK | 8 |
| Australia | 7 |
| New Zealand | 5 |
| USA / Ireland | 4 each |
| Singapore / Zimbabwe / Nigeria | 3 each |
| Hong Kong | 2 |
| Egypt / Namibia / Kenya | 1 each |

So the biggest gaps are UK, USA, Europe/Asia/Middle East, and the non-Gauteng SA provinces.

## Approach

**Round 1 — South Africa (all provinces)**
Search provincial federation and club directories (Western Province Squash, KZN Squash, Eastern Province, Free State, Boland, Border, North West, Limpopo, Mpumalanga) plus Squash SA affiliate lists and club websites. Target: fill the provinces currently thin next to the 63 mostly-Gauteng records.

**Round 2 — Commonwealth / English-speaking**
England Squash and county club finders, Scotland/Wales, Squash Ireland, US Squash club directory, Squash Canada provincial bodies, Squash Australia state bodies, Squash NZ districts.

**Round 3 — Rest of Africa**
Namibia, Zimbabwe, Botswana, Zambia, Kenya, Tanzania, Uganda, Egypt, Nigeria, Ghana, Mauritius.

**Round 4 — Everywhere else**
Europe (Netherlands, Germany, Switzerland, France, Nordics), Middle East (UAE, Qatar, Kuwait), Asia (Malaysia, India, Japan, Hong Kong extras).

Each round runs as parallel background research tasks so it doesn't take forever, pulling from federation directories and club sites and capturing:

- Club name, city, country
- Public email (mandatory — no email, no row)
- Contact person + role where published
- Website URL
- Source URL for verification
- Suggested tag (`sa-<province>`, `uk-clubs`, `us-clubs`, `africa`, `europe`, `asia`, etc.)

## Filtering rules applied before you see anything

- Drop any club with no discoverable email (contact-form-only or social-only clubs are excluded, as you chose).
- Drop obvious duplicates by name similarity and by exact email against existing `outreach_prospects` / `outreach_contacts`.
- Drop national federations themselves unless they're a genuine club (you already removed SSA and Northerns from a send, so governing bodies stay out by default).
- Flag anything that looks like a generic aggregator or stale listing rather than adding it silently.

## Review step

Results come back to you in chat as a table per region — club, country, email, contact, source link — with a count per region and a note on anything skipped as a suspected duplicate. Nothing touches the database until you say go.

## Import step (after your approval)

Approved rows are inserted into `outreach_prospects` with status **New**, plus one row per contact in `outreach_contacts`, tagged by region so campaign targeting can filter them the same way NSA clubs are filtered today. Re-checked against existing records at insert time so a slow review can't create duplicates.

## Technical notes

- Research uses web search and page fetches only — read-only, no code changes in this phase.
- Import is a single deduped SQL insert using `NOT EXISTS` on lower-cased club name and email, matching how the earlier international lists were loaded.
- No changes to the outreach send engine, rate limiting, or templates.

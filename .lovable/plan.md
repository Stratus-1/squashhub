## Migrate existing bar items to the new categories

Two legacy categories are still in use in `bar_items`: 13 × `alcohol` and 11 × `drinks`. I'll remap each row to one of the new values (`soft_drinks`, `water`, `energy`, `beer_cider`, `wine`, `spirits`, `hot_drinks`, `snacks`, `meals`, `other`) via a single `UPDATE`.

### Proposed mapping

**`drinks` → split into 3 buckets**
| New category | Items |
|---|---|
| `soft_drinks` | Coke, Coke (dup), Coke Zero, Fanta Orange, Sprite |
| `water` | Sparkling Water, Still Water |
| `energy` | Powerade Mountain Blast, Powerade Naartjie, Powerade Orange, Powerade Springbok |

**`alcohol` → split into 2 buckets**
| New category | Items |
|---|---|
| `beer_cider` | Castle Lite (×3), Casle Lite, Hansa, Windhoek Draught, Black Label, Flying Fish, Savanna, Bernini, Belgravia Peach |
| `spirits` | Belgravia Gin & Dark Cherry, Belgravia Gin & Dryn Lemon, Belgravia Gin and Pink Tonic |

Rationale: Belgravia Gin RTDs are spirit-based; Bernini (spritzer) and Belgravia Peach (cider) sit naturally with beers/ciders alongside Flying Fish & Savanna.

### Implementation

One `supabase--insert` call running a single `UPDATE bar_items SET category = CASE id WHEN ... END WHERE id IN (...)`. After it runs, every row uses the new vocabulary, the legacy fallback icons in code can stay (harmless) and the admin/visitor/honesty-bar UIs will group items under the new headings.

### Out of scope

- No schema change (column stays `text`).
- No code changes — already done in the previous turn.
- If you'd prefer a different mapping for any item (e.g. Bernini → `wine`, Belgravia RTDs → `beer_cider`), tell me and I'll adjust before running the update.

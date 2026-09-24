# Custom / mixed format: stage builder

## What changes for the owner
Choosing **I know what I want → Custom / mixed format** no longer opens the full "Guide me" builder. It opens a **Stage builder** for each division:

```text
Stage 1  Singles · Round robin · one field        [edit] [up] [down] [remove]
   ↓ same players continue · points carry forward
Stage 2  Doubles · Round robin · one field
   ↓
Final standings
+ Add stage
```

- **Add, remove, rename and reorder stages** with up/down buttons. Once any game in a stage has been played or started, that stage and every stage before it are locked. They can't be removed, moved or changed; only their label can be renamed.
- **Click a stage** (in the list or on the map) to open its settings. Questions show one at a time, and a question only appears once it applies:
  1. **Match type:** singles or doubles. Team events stay on the existing league/team setup rather than a new competing option.
  2. **Format:** round robin, Swiss or knockout.
  3. **Grouping:** one field, or pools (round robin only). If pools: how many or how big, names, and seeded spread.
  4. **Rounds:** Swiss asks for the number of rounds. Round robin asks once or twice, and its rounds are worked out automatically. Knockout rounds are worked out from the number of qualifiers.
  5. **Scheduling:** fixed dates, play-by deadline or date window, plus dates and courts.
  6. **How players move to the next stage** (asked on every stage except the first). Only options the engine can really run are shown:
     - **Qualifiers continue** (top N per pool): placement (cross-pool, re-seed or same pool), and whether the next stage is created automatically or after you confirm.
     - **Everyone continues:** points either **carry forward** or **reset** for the next stage.
     - **Singles → doubles:** you pick how pairs are formed. The choices are finishing positions (1+2, 3+4 …), standings split (1+last …) or pairs you set yourself. Singles players are never treated as doubles pairs.
- The **Tournament map** updates live with arrows and the transition text between stages. It ends with "Final standings" and shows whether points are cumulative or come from the last stage only.
- There is a **Diamond League** starting template: singles round robin → doubles round robin, everyone continues, points carry forward. You can edit every stage after loading it.
- **Guide me** is unchanged.

## Checks before Generate
Nothing is generated until every stage transition is resolved:
- Each later stage has a valid source: qualifiers with a number and a placement rule, or "everyone continues".
- A carry-forward or reset choice has been made wherever everyone continues.
- Singles → doubles has a pairing method, and it produces whole pairs (for example, an odd player count is flagged).
- The first stage's population comes from entries.
- Stages are in date order.
- Combinations the engine can't run are blocked with a plain explanation, for example Swiss inside pools, or a doubles stage feeding back into singles.

## Technical details
- **Data:** add to the existing `Stage` in `definition.ts` (these are additions only, and old drafts still load):
  - `order`
  - `progression: { mode: "qualifiers" | "all_continue" | "form_pairs", standings: "carry" | "reset", pairing?: "positions" | "fold" | "manual" }`
  - `discipline` (already present), `input.fromStageId` (already present)
  - `def.finalStandings: "last_stage" | "cumulative"`

  Each of these is a separate field; nothing is stored as a combined text label. The canonical spec (`PlannedStage`) gains the same `progression` block and `discipline`.
- **Engine:** one generator (`engine-service.ts` / `structured-persist.ts`), extended rather than duplicated:
  - `contractIssues` validates the new transition rules.
  - `nextStage(tid, div, stageId)` replaces the knockout-only follow-on. It routes "qualifiers" to the existing play-off path. For "all_continue" it takes the full population (seeded by standings) into a new RR/Swiss/KO stage. For "form_pairs" it builds pair entrant units from standings (as `champ_doubles_pairs` rows, inside the same atomic commit) and generates the doubles stage.
  - Carry-forward is applied when standings are calculated (`final-standings.ts`): cumulative points across stages that share participants. "Reset" uses only that stage.
- **Locking:** `classifyEdit` treats reordering, removing or changing the kind of a stage that has played or started games as blocked. `StructuredEditorDialog` shows the same stage list read-only up to the last locked stage.
- **UI:** new `StageBuilder.tsx` (stage list, per-stage panel, live map), rendered in place of `DesignCanvas` when `quickPath = "custom"`. The "Open full builder" link stays available.
- **Tests:** new cases for:
  - RR→RR→KO
  - Swiss→KO
  - Diamond League (singles RR → pairs formed → doubles RR → cumulative final standings) in the disposable full simulation
  - locked-stage reorder refused
  - odd count for singles→doubles blocked
  - unresolved transition blocks Generate
- **Docs:** `TOURNAMENT_ENGINE_INTEGRITY.md` and the issue log updated. Nothing is published.

## Assumptions to confirm
- **Diamond League final result:** by default, total points across both stages. It can be switched to "last stage only".
- **Default pairing for singles → doubles:** fold (1st with last, 2nd with second-last), to balance the pairs. Positions (1+2) and manual pairs are the alternatives.

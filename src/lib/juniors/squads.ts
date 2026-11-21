/** Junior squads: Boys / Girls × U11–U19. Pure helpers shared by the Leagues tab and junior body workspaces. */
export const AGE_GROUPS = ["U11", "U13", "U15", "U17", "U19"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];
export type GenderGroup = "boys" | "girls";

export type SquadRow = {
  member_id: string;
  club_id: string;
  club_name: string | null;
  name: string | null;
  age: number | null;
  auto_gender_group: GenderGroup | null;
  auto_age_group: AgeGroup | null;
  age_source: "age" | "sportyhq" | null;
  gender_group: GenderGroup | null;
  age_group: AgeGroup | null;
  moved: boolean;
  junior_player: boolean;
  junior_source: string | null;
  has_person: boolean;
};

export type GenderKey = GenderGroup | "unknown";
export type AgeKey = AgeGroup | "none";
export type SquadGrid = Record<GenderKey, Record<AgeKey, SquadRow[]>>;

const emptyRow = (): Record<AgeKey, SquadRow[]> => ({ U11: [], U13: [], U15: [], U17: [], U19: [], none: [] });

/** Places each junior in the cell of their effective group (saved move, else automatic). */
export function groupSquads(rows: SquadRow[]): SquadGrid {
  const grid: SquadGrid = { boys: emptyRow(), girls: emptyRow(), unknown: emptyRow() };
  for (const r of rows) {
    const g: GenderKey = r.gender_group ?? "unknown";
    const a: AgeKey = r.age_group && (AGE_GROUPS as readonly string[]).includes(r.age_group) ? r.age_group : "none";
    grid[g][a].push(r);
  }
  for (const g of Object.values(grid)) for (const list of Object.values(g)) list.sort((x, y) => (x.name ?? "").localeCompare(y.name ?? ""));
  return grid;
}

export type MoveAction =
  | { kind: "noop" }
  | { kind: "reset" }
  | { kind: "move"; gender: GenderGroup; age: AgeGroup };

/** Dropping a junior on a group. Dropping back on their automatic group clears the move instead of saving a copy. */
export function moveTarget(row: SquadRow, gender: GenderGroup, age: AgeGroup): MoveAction {
  if (row.gender_group === gender && row.age_group === age) return { kind: "noop" };
  if (row.auto_gender_group === gender && row.auto_age_group === age) return { kind: "reset" };
  return { kind: "move", gender, age };
}

export const genderLabel = (g: GenderKey) => (g === "boys" ? "Boys" : g === "girls" ? "Girls" : "Boy/girl not set");

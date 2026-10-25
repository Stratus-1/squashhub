import { defaultPools, orderUnits, rankingIssue, unitsFor, type RegLite } from "./step-draw";
import type { PoolAllocationMode } from "../tournaments/pools";

/** Read-only pool projection from selected entrants; never invent doubles partners. */
export function pickPoolPreview(input: {
  ids: string[]; pairs: Array<[string, string]>; registrations: RegLite[];
  group: number; groups: number; doubles: boolean; pools: number;
  seeding: string | null; scope: string | null; points: Map<string, number | null>;
  ladder: Map<string, number | null>; order?: string[]; mode: PoolAllocationMode;
}) {
  const regs = input.ids.map((id): RegLite => {
    const saved = input.registrations.find((r) => r.club_member_id === id);
    const partner = input.pairs.find((p) => p.includes(id))?.find((p) => p !== id);
    return { club_member_id: id, partner_member_id: partner ?? saved?.partner_member_id ?? null,
      division_partners: partner ? { [String(input.group)]: partner } : saved?.division_partners,
      status: "confirmed", division_choices: [input.group] };
  });
  const field = unitsFor(regs, input.group, input.groups, input.doubles);
  const seeding = input.seeding === "ranking" || input.seeding === "ladder" || input.seeding === "random" ? input.seeding : "entry_order";
  const issue = field.errors[0] ?? (seeding === "ranking" ? rankingIssue(field.units, input.scope, input.points) : null);
  if (issue) return { pools: Array.from({ length: input.pools }, () => [] as typeof field.units), issue };
  let units = orderUnits(field.units, seeding, { seed: 1 + input.group, points: input.points, ladder: input.ladder });
  if (input.order?.length) {
    const order = input.order;
    const at = (id: string) => { const i = order.indexOf(id); return i < 0 ? Infinity : i; };
    const rank = (u: typeof units[number]) => Math.min(at(u.member), u.partner ? at(u.partner) : Infinity);
    units = [...units].sort((a, b) => rank(a) - rank(b));
  }
  const byId = new Map(units.map((u) => [u.partner ? `${u.member}+${u.partner}` : u.member, u]));
  return { pools: defaultPools(units, input.pools, input.mode).map((pool) => pool.flatMap((id) => {
    const unit = byId.get(id); return unit ? [unit] : [];
  })), issue: null };
}
import { describe, it, expect } from "vitest";
import { finishingOrder } from "@/lib/tournaments/stage-order";
import { BellsFormat } from "@/lib/tournament-formats/bells";
import { pairFromOrder } from "@/lib/tournaments/stage-sequence";

const members = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `p${n}`, name: `Player ${n}` }));

/** Timed match: whoever scored more points wins. */
const m = (a: string, b: string, pa: number, pb: number) => ({
  status: "completed",
  player_a_member_id: a,
  player_b_member_id: b,
  side_a_points: pa,
  side_b_points: pb,
  winner_member_id: pa >= pb ? a : b,
});

describe("finishingOrder", () => {
  it("ranks a timed singles stage strongest first", () => {
    const matches = [
      m("p1", "p2", 30, 20),
      m("p1", "p3", 30, 10),
      m("p2", "p3", 25, 15),
      m("p4", "p5", 22, 20),
      m("p4", "p6", 21, 10),
      m("p5", "p6", 19, 12),
    ];
    const order = finishingOrder({ members, matches, format: BellsFormat });
    expect(order.map((r) => r.memberId)).toEqual(["p1", "p4", "p5", "p2", "p6", "p3"]);
  });

  it("feeds adjacent pairing so the bottom two play together", () => {
    const matches = [m("p1", "p2", 30, 10), m("p3", "p4", 30, 10), m("p5", "p6", 30, 10)];
    const order = finishingOrder({ members, matches, format: BellsFormat });
    const { pairs, unpaired } = pairFromOrder(
      order.map((r) => r.memberId),
      "adjacent",
    );
    expect(unpaired).toEqual([]);
    expect(pairs).toHaveLength(3);
    // Adjacent pairing starts at the bottom: the last two finishers play together.
    expect(pairs[0]).toEqual({ a: order[4].memberId, b: order[5].memberId });
    expect(pairs[pairs.length - 1]).toEqual({ a: order[0].memberId, b: order[1].memberId });
  });
});

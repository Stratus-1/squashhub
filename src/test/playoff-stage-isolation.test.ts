import { describe, it, expect } from "vitest";
import { persistedStage } from "@/lib/tournaments/structured-persist";

const spec = (kind2: string) => ({
  divisions: [{ divisionId: "d", stages: [{ id: "main", order: 0, kind: "pools" }, { id: "po1", order: 1, kind: kind2 }, { id: "po2", order: 2, kind: "mapped" }] }],
}) as any;

describe("play-off stages never persist as pool-stage games", () => {
  it("first stage stays a pool/group stage", () => {
    expect(persistedStage(spec("mapped"), { divisionId: "d", stageId: "main", stageKind: "round_robin" as any })).toBe("group");
  });
  it("a mapped QF/SF/Final after the pools is a play-off (singles and doubles alike)", () => {
    for (const id of ["po1", "po2"]) expect(persistedStage(spec("mapped"), { divisionId: "d", stageId: id, stageKind: "mapped" as any })).toBe("ko");
  });
  it("knockout kind is always a play-off", () => {
    expect(persistedStage(spec("knockout"), { divisionId: "d", stageId: "po1", stageKind: "knockout" as any })).toBe("ko");
  });
});

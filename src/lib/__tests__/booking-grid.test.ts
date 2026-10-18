import { describe, expect, it } from "vitest";
import { bookingsForGridRow } from "../booking-grid";

const games = [
  { id: "first", court_id: 27, start_time: "18:00:00", end_time: "18:35:00" },
  { id: "second", court_id: 27, start_time: "18:35:00", end_time: "19:10:00" },
  { id: "third", court_id: 27, start_time: "19:10:00", end_time: "19:45:00" },
];

describe("35-minute championship games on a 45-minute grid", () => {
  it("retains both games sharing a row regardless of query order", () => {
    const reversed = [...games].reverse();
    expect(bookingsForGridRow(reversed, 27, "18:00", 45).map(b => b.id)).toEqual(["first", "second"]);
    expect(bookingsForGridRow(reversed, 27, "18:45", 45).map(b => b.id)).toEqual(["second", "third"]);
    expect(bookingsForGridRow(reversed, 27, "19:30", 45).map(b => b.id)).toEqual(["third"]);
  });
  it("gives every game exactly one starting row while retaining continuations", () => {
    const starts = ["18:00", "18:45", "19:30"].flatMap(time =>
      bookingsForGridRow(games, 27, time, 45).filter(b => b.start_time.slice(0, 5) >= time).map(b => b.id));
    expect(starts).toEqual(["first", "second", "third"]);
  });
  it("does not occupy another court or a row after the game ends", () => {
    expect(bookingsForGridRow(games, 28, "18:00", 45)).toEqual([]);
    expect(bookingsForGridRow(games, 27, "19:45", 45)).toEqual([]);
  });
  it("frees the old row after a game moves", () => {
    const moved = [{ ...games[0], start_time: "20:00", end_time: "20:35" }];
    expect(bookingsForGridRow(moved, 27, "18:00", 45)).toEqual([]);
    expect(bookingsForGridRow(moved, 27, "20:00", 45).map(b => b.id)).toEqual(["first"]);
  });
});

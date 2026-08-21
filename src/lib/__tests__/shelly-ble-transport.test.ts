import { describe, expect, it } from "vitest";
import {
  assertResponseLength,
  chunkPayload,
  encodeFrameLength,
  parseFrameLength,
  pollResponseLength,
  readResponseBody,
  withBleTimeout,
} from "../shelly-ble-transport";

const noSleep = async () => {};

describe("shelly BLE transport hardening", () => {
  it("round-trips the big-endian frame length", () => {
    expect(parseFrameLength(encodeFrameLength(1234))).toBe(1234);
  });

  it("rejects absurd response lengths", () => {
    expect(() => assertResponseLength(0)).toThrow();
    expect(() => assertResponseLength(70_000)).toThrow();
    expect(assertResponseLength(42)).toBe(42);
  });

  it("chunks payloads to MTU-safe writes", () => {
    const chunks = chunkPayload(new Uint8Array(45));
    expect(chunks.map((c) => c.byteLength)).toEqual([20, 20, 5]);
  });

  it("keeps polling Rx-CTL while the device reports zero length", async () => {
    let call = 0;
    const length = await pollResponseLength(
      async () => {
        call += 1;
        return call < 3 ? encodeFrameLength(0) : encodeFrameLength(17);
      },
      { sleep: noSleep },
    );
    expect(length).toBe(17);
    expect(call).toBe(3);
  });

  it("gives up with a friendly message when the device never answers", async () => {
    await expect(
      pollResponseLength(async () => encodeFrameLength(0), { attempts: 3, sleep: noSleep }),
    ).rejects.toThrow(/did not answer over Bluetooth/i);
  });

  it("tolerates empty reads while assembling the reply", async () => {
    const parts = [new Uint8Array(0), new Uint8Array([1, 2]), new Uint8Array([3])];
    let i = 0;
    const body = await readResponseBody(3, async () => parts[i++] ?? new Uint8Array(0), { sleep: noSleep });
    expect(Array.from(body)).toEqual([1, 2, 3]);
  });

  it("fails after too many empty reads instead of looping forever", async () => {
    await expect(
      readResponseBody(3, async () => new Uint8Array(0), { emptyReadLimit: 2, sleep: noSleep }),
    ).rejects.toThrow(/incomplete/i);
  });

  it("times out a hung GATT operation", async () => {
    await expect(
      withBleTimeout(() => new Promise(() => {}), 10, "reading reply"),
    ).rejects.toThrow(/timed out \(reading reply\)/);
  });

  it("passes through a fast operation", async () => {
    await expect(withBleTimeout(async () => "ok", 500, "x")).resolves.toBe("ok");
  });
});

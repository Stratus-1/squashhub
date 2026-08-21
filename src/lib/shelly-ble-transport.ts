/**
 * Shared BLE transport hardening helpers for the Shelly fallback path.
 *
 * These exist because a Shelly's GATT RPC channel is timing-sensitive:
 *  - the device needs a few ms to latch the frame length written to Tx-CTL
 *    before the payload chunks arrive;
 *  - the Rx-CTL length register reads back 0 until the device has finished
 *    building its reply, so the first read must be retried, not trusted;
 *  - a GATT operation that never resolves (device drifted out of range mid
 *    exchange) would otherwise hang the unlock UI forever.
 *
 * Kept transport-agnostic (no Web Bluetooth / Capacitor imports) so both
 * `shelly-ble.ts` and `shelly-ble-native.ts` share identical behaviour and the
 * logic stays unit-testable.
 */

/** ms to let the device latch a control-register write before the next op. */
export const BLE_SETTLE_MS = 30;
/** ms budget for a single GATT read/write. */
export const BLE_OP_TIMEOUT_MS = 6000;
/** ms budget for one full request→response RPC exchange. */
export const BLE_EXCHANGE_TIMEOUT_MS = 15000;
/** How many times to poll Rx-CTL before giving up on a reply. */
export const BLE_RX_POLL_ATTEMPTS = 25;
/** Delay between Rx-CTL polls. */
export const BLE_RX_POLL_INTERVAL_MS = 60;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rejects with a readable message if `op` does not settle in time. */
export async function withBleTimeout<T>(
  op: () => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Bluetooth timed out (${label}). Stay within a few metres of the Shelly and try again.`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Big-endian 4-byte frame length used by the Shelly RPC control registers. */
export function encodeFrameLength(byteLength: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, byteLength, false);
  return buf;
}

export function parseFrameLength(bytes: Uint8Array): number {
  if (bytes.byteLength < 4) {
    throw new Error("Shelly returned an invalid response length.");
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
}

export function assertResponseLength(length: number): number {
  if (!Number.isFinite(length) || length < 1 || length > 64 * 1024) {
    throw new Error(`Shelly returned an invalid response length (${length}).`);
  }
  return length;
}

/**
 * Poll Rx-CTL until the device reports a non-zero reply length.
 * A zero length simply means "not ready yet" — the old code treated that first
 * read as authoritative and failed the unlock for a device that was fine.
 */
export async function pollResponseLength(
  readRxCtl: () => Promise<Uint8Array>,
  opts: { attempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<number> {
  const attempts = opts.attempts ?? BLE_RX_POLL_ATTEMPTS;
  const intervalMs = opts.intervalMs ?? BLE_RX_POLL_INTERVAL_MS;
  const sleep = opts.sleep ?? delay;

  for (let i = 0; i < attempts; i += 1) {
    const raw = await readRxCtl();
    const length = raw.byteLength >= 4 ? parseFrameLength(raw) : 0;
    if (length > 0) return assertResponseLength(length);
    if (i < attempts - 1) await sleep(intervalMs);
  }
  throw new Error("The Shelly did not answer over Bluetooth. Move closer, make sure no other phone is connected to it, and try again.");
}

/**
 * Read the reply payload chunk by chunk. Empty reads are tolerated (the device
 * may still be filling its buffer) up to a bounded number of retries.
 */
export async function readResponseBody(
  responseLength: number,
  readData: () => Promise<Uint8Array>,
  opts: { emptyReadLimit?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Uint8Array> {
  const emptyReadLimit = opts.emptyReadLimit ?? 10;
  const intervalMs = opts.intervalMs ?? BLE_RX_POLL_INTERVAL_MS;
  const sleep = opts.sleep ?? delay;

  const response = new Uint8Array(responseLength);
  let offset = 0;
  let emptyReads = 0;

  while (offset < responseLength) {
    const bytes = await readData();
    if (!bytes.byteLength) {
      emptyReads += 1;
      if (emptyReads > emptyReadLimit) {
        throw new Error("Shelly returned an incomplete Bluetooth response.");
      }
      await sleep(intervalMs);
      continue;
    }
    emptyReads = 0;
    const remaining = responseLength - offset;
    response.set(bytes.subarray(0, remaining), offset);
    offset += Math.min(bytes.byteLength, remaining);
  }
  return response;
}

/** Split an encoded RPC payload into MTU-safe write chunks. */
export function chunkPayload(payload: Uint8Array, chunkSize = 20): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < payload.byteLength; i += chunkSize) {
    chunks.push(payload.slice(i, i + chunkSize));
  }
  return chunks;
}

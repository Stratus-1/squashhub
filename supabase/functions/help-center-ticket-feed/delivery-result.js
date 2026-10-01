export const MAX_DELIVERY_ATTEMPTS = 12;

export function classifyDeliveryResponse(status) {
  if (status >= 200 && status < 300) {
    return { ok: true, errorCode: null, maxAttempts: MAX_DELIVERY_ATTEMPTS };
  }

  // The receiver uses 409 for event-ID/body conflicts, tenant-scope changes,
  // and retained deletion tombstones. Retrying cannot make these valid.
  if (status === 409) {
    return { ok: false, errorCode: "http_409_conflict", maxAttempts: 1 };
  }

  return { ok: false, errorCode: `http_${status}`, maxAttempts: MAX_DELIVERY_ATTEMPTS };
}

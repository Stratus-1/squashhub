import assert from "node:assert/strict";
import test from "node:test";
import { classifyDeliveryResponse, MAX_DELIVERY_ATTEMPTS } from "./delivery-result.js";

test("accepted and idempotent receiver responses mark delivery successful", () => {
  assert.deepEqual(classifyDeliveryResponse(202), {
    ok: true,
    errorCode: null,
    maxAttempts: MAX_DELIVERY_ATTEMPTS,
  });
  assert.deepEqual(classifyDeliveryResponse(200), {
    ok: true,
    errorCode: null,
    maxAttempts: MAX_DELIVERY_ATTEMPTS,
  });
});

test("receiver conflicts dead-letter the event after the current claim", () => {
  assert.deepEqual(classifyDeliveryResponse(409), {
    ok: false,
    errorCode: "http_409_conflict",
    maxAttempts: 1,
  });
});

test("transient responses retain bounded retry behavior", () => {
  assert.deepEqual(classifyDeliveryResponse(429), {
    ok: false,
    errorCode: "http_429",
    maxAttempts: MAX_DELIVERY_ATTEMPTS,
  });
  assert.deepEqual(classifyDeliveryResponse(503), {
    ok: false,
    errorCode: "http_503",
    maxAttempts: MAX_DELIVERY_ATTEMPTS,
  });
});

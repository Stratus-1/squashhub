export const SHELLY_RPC_SERVICE = "5f6d4f53-5f52-5043-5f52-4f4f4653435f";
export const SHELLY_RPC_DATA = "5f6d4f53-5f52-5043-5f64-6174615f5f5f";
export const SHELLY_RPC_TXCTL = "5f6d4f53-5f52-5043-5f74-785f63746c5f";
export const SHELLY_RPC_RXCTL = "5f6d4f53-5f52-5043-5f72-785f63746c5f";

export type ShellyRpcRequest = {
  id: number;
  src: string;
  method: string;
  params: Record<string, unknown>;
  auth?: Record<string, unknown>;
};

type ShellyRpcError = { code?: number; message?: string };
type ShellyRpcResponse = {
  id?: number;
  result?: Record<string, unknown>;
  error?: ShellyRpcError;
};

type AuthChallenge = {
  realm: string;
  nonce: string | number;
  algorithm?: string;
};

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseChallenge(error: ShellyRpcError | undefined): AuthChallenge | null {
  if (error?.code !== 401 || !error.message) return null;
  try {
    const parsed = JSON.parse(error.message) as Partial<AuthChallenge>;
    if (!parsed.realm || parsed.nonce === undefined) return null;
    return {
      realm: parsed.realm,
      nonce: parsed.nonce,
      algorithm: parsed.algorithm,
    };
  } catch {
    return null;
  }
}

export function encodeShellyRpc(request: ShellyRpcRequest): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(request));
}

export function decodeShellyRpc(bytes: Uint8Array): ShellyRpcResponse {
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text) as ShellyRpcResponse;
  } catch {
    throw new Error(`Shelly returned an invalid Bluetooth response: ${text || "empty response"}`);
  }
}

export function assertShellyRpcSuccess(response: ShellyRpcResponse): void {
  if (!response.error) return;
  const detail = response.error.message || `RPC error ${response.error.code ?? "unknown"}`;
  throw new Error(`Shelly rejected the Bluetooth command: ${detail}`);
}

export async function authenticateShellyRpc(
  request: ShellyRpcRequest,
  response: ShellyRpcResponse,
  password: string | null | undefined,
): Promise<ShellyRpcRequest | null> {
  const challenge = parseChallenge(response.error);
  if (!challenge) return null;
  if (!password) {
    throw new Error("The Shelly requires Bluetooth RPC authentication, but no device password is configured.");
  }

  const username = "admin";
  const nc = "00000001";
  const cnonce = crypto.getRandomValues(new Uint32Array(1))[0];
  const ha1 = await sha256(`${username}:${challenge.realm}:${password}`);
  const ha2 = await sha256("dummy_method:dummy_uri");
  const digest = await sha256(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`);

  return {
    ...request,
    id: request.id + 1,
    auth: {
      realm: challenge.realm,
      username,
      nonce: challenge.nonce,
      cnonce,
      nc,
      response: digest,
      algorithm: challenge.algorithm || "SHA-256",
    },
  };
}

export async function executeShellyRpc(
  request: ShellyRpcRequest,
  password: string | null | undefined,
  exchange: (payload: Uint8Array) => Promise<Uint8Array>,
): Promise<void> {
  let response = decodeShellyRpc(await exchange(encodeShellyRpc(request)));
  const authenticated = await authenticateShellyRpc(request, response, password);
  if (authenticated) {
    response = decodeShellyRpc(await exchange(encodeShellyRpc(authenticated)));
  }
  assertShellyRpcSuccess(response);
}
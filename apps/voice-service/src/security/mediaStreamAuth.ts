import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config.js";

const TOKEN_TTL_MS = 5 * 60 * 1000;

interface StreamAuthPayload {
  callId: string;
  callSid: string;
  exp: number;
}

function sign(payload: StreamAuthPayload): string {
  const body = `${payload.callId}.${payload.callSid}.${payload.exp}`;
  const mac = createHmac("sha256", env.VOICE_WEBHOOK_SECRET).update(body).digest("hex");
  return `${Buffer.from(body).toString("base64url")}.${mac}`;
}

/**
 * Produces a short-lived, tamper-proof token embedded in the Media Stream
 * WebSocket URL we hand Twilio in the TwiML response. Without this, anyone
 * who discovered the wss:// endpoint could open arbitrary sessions against
 * our OpenAI Realtime credentials.
 */
export function createStreamToken(callId: string, callSid: string): string {
  return sign({ callId, callSid, exp: Date.now() + TOKEN_TTL_MS });
}

export function verifyStreamToken(token: string, callSid: string): { callId: string } | null {
  const [encodedBody, mac] = token.split(".");
  if (!encodedBody || !mac) return null;

  let body: string;
  try {
    body = Buffer.from(encodedBody, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const [callId, tokenCallSid, expStr] = body.split(".");
  if (!callId || !tokenCallSid || !expStr) return null;

  const expected = createHmac("sha256", env.VOICE_WEBHOOK_SECRET).update(body).digest("hex");
  const macBuffer = Buffer.from(mac, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (macBuffer.length !== expectedBuffer.length || !timingSafeEqual(macBuffer, expectedBuffer)) {
    return null;
  }

  if (tokenCallSid !== callSid) return null;
  if (Date.now() > Number(expStr)) return null;

  return { callId };
}

export type MediaStreamUpgradeResult =
  | { ok: true; callId: string; callSid: string }
  | { ok: false; reason: "wrong_path" | "missing_params" | "invalid_token" };

/**
 * The full gate a WebSocket upgrade request must pass before we hand it to
 * the WebSocketServer: right path, both params present, token verifies for
 * the claimed callSid. Pulled out of the HTTP `upgrade` handler in
 * index.ts so this security-critical logic can be unit tested directly
 * instead of only through a live server.
 */
export function authorizeMediaStreamUpgrade(pathname: string, searchParams: URLSearchParams): MediaStreamUpgradeResult {
  if (pathname !== "/media-stream") {
    return { ok: false, reason: "wrong_path" };
  }

  const token = searchParams.get("token");
  const callSid = searchParams.get("callSid");
  if (!token || !callSid) {
    return { ok: false, reason: "missing_params" };
  }

  const verified = verifyStreamToken(token, callSid);
  if (!verified) {
    return { ok: false, reason: "invalid_token" };
  }

  return { ok: true, callId: verified.callId, callSid };
}

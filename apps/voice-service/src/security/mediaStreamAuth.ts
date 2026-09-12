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

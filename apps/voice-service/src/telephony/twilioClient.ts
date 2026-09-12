import twilio from "twilio";
import { logger } from "@phone-ai/shared";
import { env } from "../config.js";
import { createStreamToken } from "../security/mediaStreamAuth.js";

const client = twilio(env.TELEPHONY_ACCOUNT_ID, env.TELEPHONY_AUTH_TOKEN);

/**
 * Builds the initial TwiML that opens a bidirectional Media Stream back to
 * this service for the given call. This is what makes the call real-time:
 * Twilio streams raw audio frames over the WebSocket as they arrive rather
 * than waiting for a full utterance/recording.
 */
export function buildStreamTwiml(callId: string, callSid: string, callerPhone: string): string {
  const token = createStreamToken(callId, callSid);
  const wsUrl = `${env.PUBLIC_BASE_URL.replace(/^http/, "ws")}/media-stream?token=${encodeURIComponent(token)}&callSid=${encodeURIComponent(callSid)}`;

  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();
  const stream = connect.stream({ url: wsUrl });
  stream.parameter({ name: "callerPhone", value: callerPhone });
  return response.toString();
}

export interface TransferResult {
  ok: boolean;
  errorCode?: string;
}

/**
 * Transfers a LIVE call to a human by replacing its currently-executing
 * TwiML with a <Dial> to the transfer number. This actually moves the
 * call — it does not just read the number aloud to the caller.
 */
export async function transferLiveCall(callSid: string, transferTo: string): Promise<TransferResult> {
  try {
    const response = new twilio.twiml.VoiceResponse();
    response.dial({ callerId: env.TELEPHONY_PHONE_NUMBER }, transferTo);
    await client.calls(callSid).update({ twiml: response.toString() });
    return { ok: true };
  } catch (err) {
    logger.error("twilio_transfer_failed", {
      callId: callSid,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorCode: "TRANSFER_API_FAILED" };
  }
}

/** Ends a live call from our side (used when the AI determines the call is complete). */
export async function hangupLiveCall(callSid: string): Promise<TransferResult> {
  try {
    await client.calls(callSid).update({ status: "completed" });
    return { ok: true };
  } catch (err) {
    logger.error("twilio_hangup_failed", {
      callId: callSid,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorCode: "HANGUP_API_FAILED" };
  }
}

import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger, normalizePhoneNumber } from "@phone-ai/shared";
import { supabase } from "../config.js";
import { verifyTwilioSignature } from "../security/twilioSignature.js";
import { buildStreamTwiml } from "../telephony/twilioClient.js";
import { startCallRecord } from "../callLogger.js";

export const twilioVoiceRouter = Router();

/**
 * Twilio calls this webhook the instant a call to the shop's number
 * connects. It creates the call record and returns TwiML that opens a
 * real-time Media Stream back to this service — no audio file round trip.
 */
twilioVoiceRouter.post("/twilio/voice", verifyTwilioSignature, async (req, res) => {
  const callSid = String(req.body.CallSid ?? "");
  const from = String(req.body.From ?? "");

  if (!callSid) {
    logger.error("twilio_voice_missing_call_sid");
    res.status(400).send("Missing CallSid");
    return;
  }

  const callerPhone = normalizePhoneNumber(from) ?? from;
  const callId = await startCallRecord(supabase, { callId: uuidv4(), providerCallId: callSid, callerPhone });

  const twiml = buildStreamTwiml(callId, callSid, callerPhone);
  res.type("text/xml").send(twiml);
});

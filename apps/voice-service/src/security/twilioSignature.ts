import type { NextFunction, Request, Response } from "express";
import twilio from "twilio";
import { logger } from "@phone-ai/shared";
import { env } from "../config.js";

/**
 * Verifies the X-Twilio-Signature header on every inbound Twilio webhook.
 * Twilio signs the exact public URL + posted form params using the auth
 * token, so PUBLIC_BASE_URL must match exactly what Twilio was configured
 * to call (scheme + host, no trailing slash) or every request will be
 * (correctly) rejected.
 *
 * Requests with a missing/invalid signature, or that aren't POST with a
 * parsed body, are rejected with 403 before any business logic runs.
 */
export function verifyTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const signature = req.header("X-Twilio-Signature");
  if (!signature) {
    logger.warn("twilio_webhook_missing_signature", { path: req.path });
    res.status(403).json({ error: "missing_signature" });
    return;
  }

  const fullUrl = `${env.PUBLIC_BASE_URL}${req.originalUrl}`;
  const params = (req.body ?? {}) as Record<string, string>;

  const valid = twilio.validateRequest(env.TELEPHONY_AUTH_TOKEN, signature, fullUrl, params);
  if (!valid) {
    logger.warn("twilio_webhook_invalid_signature", { path: req.path });
    res.status(403).json({ error: "invalid_signature" });
    return;
  }

  next();
}

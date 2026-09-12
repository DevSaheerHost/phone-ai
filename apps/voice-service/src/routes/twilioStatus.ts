import { Router } from "express";
import { claimWebhookEvent, logger } from "@phone-ai/shared";
import { supabase } from "../config.js";
import { verifyTwilioSignature } from "../security/twilioSignature.js";

export const twilioStatusRouter = Router();

const TERMINAL_STATUSES = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);

/**
 * Backup finalization path: the media bridge normally closes out the call
 * record when the Media Stream WebSocket closes, but if that never
 * happens (network drop, the call never even connected to streaming — e.g.
 * busy/no-answer/failed), this status callback is the only signal the call
 * ended at all. Idempotent via webhook_events since Twilio may retry.
 */
twilioStatusRouter.post("/twilio/status", verifyTwilioSignature, async (req, res) => {
  const callSid = String(req.body.CallSid ?? "");
  const callStatus = String(req.body.CallStatus ?? "");

  if (!callSid || !callStatus) {
    res.status(400).send("Missing CallSid or CallStatus");
    return;
  }

  const isNew = await claimWebhookEvent(supabase, "twilio_status", `${callSid}:${callStatus}`);
  if (!isNew) {
    res.status(200).send("OK");
    return;
  }

  if (TERMINAL_STATUSES.has(callStatus)) {
    const { data: call } = await supabase
      .from("calls")
      .select("id, started_at, ended_at")
      .eq("provider_call_id", callSid)
      .maybeSingle();

    if (call && !call.ended_at) {
      const endedAt = new Date();
      const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - new Date(call.started_at).getTime()) / 1000));
      const outcome = callStatus === "completed" ? "completed_by_ai" : "abandoned";

      const { error } = await supabase
        .from("calls")
        .update({
          ended_at: endedAt.toISOString(),
          duration_seconds: durationSeconds,
          outcome,
          error_code: callStatus === "completed" ? null : callStatus,
        })
        .eq("id", call.id);

      if (error) {
        logger.error("twilio_status_finalize_failed", { callId: call.id, message: error.message });
      }
    }
  }

  res.status(200).send("OK");
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger, maskPhoneNumber, type CallOutcome, type CustomerRequestType } from "@phone-ai/shared";

/**
 * Creates the call record, keyed uniquely by provider_call_id. Twilio can
 * retry the /twilio/voice webhook (e.g. on a slow response), so this must
 * be idempotent: on a retry we return the call_id from the FIRST insert
 * rather than minting a second one, so the caller builds Media Stream
 * TwiML pointing at the call that's actually being tracked.
 */
export async function startCallRecord(
  supabase: SupabaseClient,
  params: { callId: string; providerCallId: string; callerPhone: string | null },
): Promise<string> {
  const { error } = await supabase.from("calls").insert({
    call_id: params.callId,
    provider_call_id: params.providerCallId,
    caller_phone: params.callerPhone,
  });

  if (!error) {
    logger.info("call_started", { callId: params.callId, caller: maskPhoneNumber(params.callerPhone) });
    return params.callId;
  }

  if (error.code === "23505") {
    const { data: existing } = await supabase
      .from("calls")
      .select("call_id")
      .eq("provider_call_id", params.providerCallId)
      .maybeSingle();
    if (existing) {
      logger.info("call_start_deduplicated", { callId: existing.call_id, providerCallId: params.providerCallId });
      return existing.call_id;
    }
  }

  logger.error("start_call_record_failed", { callId: params.callId, message: error.message });
  return params.callId;
}

export async function recordCallEvent(
  supabase: SupabaseClient,
  callId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  logger.debug("call_event", { callId, eventType });
  const { data: call } = await supabase.from("calls").select("id").eq("call_id", callId).maybeSingle();
  if (!call) return;
  const { error } = await supabase.from("call_events").insert({ call_id: call.id, event_type: eventType, payload });
  if (error) {
    logger.error("record_call_event_failed", { callId, eventType, message: error.message });
  }
}

export interface FinalizeCallParams {
  callId: string;
  outcome: CallOutcome;
  transferredToHuman?: boolean;
  transferReason?: string | null;
  customerRequestType?: CustomerRequestType | null;
  createdServiceRequestId?: string | null;
  createdBookingId?: string | null;
  errorCode?: string | null;
  languageDetected?: string | null;
}

export async function finalizeCallRecord(supabase: SupabaseClient, params: FinalizeCallParams): Promise<void> {
  const endedAt = new Date();
  const { data: existing } = await supabase
    .from("calls")
    .select("started_at")
    .eq("call_id", params.callId)
    .maybeSingle();

  const durationSeconds = existing?.started_at
    ? Math.max(0, Math.round((endedAt.getTime() - new Date(existing.started_at).getTime()) / 1000))
    : null;

  const { error } = await supabase
    .from("calls")
    .update({
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      outcome: params.outcome,
      transferred_to_human: params.transferredToHuman ?? false,
      transfer_reason: params.transferReason ?? null,
      customer_request_type: params.customerRequestType ?? null,
      created_service_request_id: params.createdServiceRequestId ?? null,
      created_booking_id: params.createdBookingId ?? null,
      error_code: params.errorCode ?? null,
      language_detected: params.languageDetected ?? null,
    })
    .eq("call_id", params.callId);

  if (error) {
    logger.error("finalize_call_record_failed", { callId: params.callId, message: error.message });
  }
  logger.info("call_ended", { callId: params.callId, outcome: params.outcome, durationSeconds });
}

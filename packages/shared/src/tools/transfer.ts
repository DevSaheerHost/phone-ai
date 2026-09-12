import { z } from "zod";
import type { ToolResult } from "../types.js";

export const TRANSFER_REASONS = [
  "customer_requested",
  "complex_technical_question",
  "unreliable_information",
  "pricing_dispute",
  "requires_staff_approval",
  "customer_frustrated",
  "emergency_or_security",
  "backend_failure",
] as const;
export type TransferReason = (typeof TRANSFER_REASONS)[number];

export const transferToHumanInputSchema = z.object({
  reason: z.enum(TRANSFER_REASONS),
  context: z.string().trim().max(500).optional(),
});

/**
 * Validates a transfer request. This tool does NOT perform the telephony
 * transfer itself — it only decides whether the request is well-formed.
 * The voice-service's tool executor calls this first, then, on ok:true,
 * invokes the Twilio call-transfer flow (see apps/voice-service/src/
 * telephony/twilioClient.ts) which is the part that actually moves the
 * live call.
 */
export function validateTransferRequest(rawInput: unknown): ToolResult<{ reason: TransferReason; context?: string }> {
  const parsed = transferToHumanInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, reason: "Invalid transfer request.", errorCode: "INVALID_INPUT" };
  }
  return { ok: true, data: parsed.data };
}

export const endCallInputSchema = z.object({
  summary: z.string().trim().max(500).optional(),
});

export function validateEndCallRequest(rawInput: unknown): ToolResult<{ summary?: string }> {
  const parsed = endCallInputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, reason: "Invalid end-call request.", errorCode: "INVALID_INPUT" };
  }
  return { ok: true, data: parsed.data };
}

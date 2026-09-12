import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { RepairTicket, ToolResult } from "../types.js";
import { ticketNumberSchema } from "../validation.js";
import { logger } from "../logger.js";

export const checkRepairStatusInputSchema = z.object({
  ticketNumber: ticketNumberSchema,
});

/** Only the fields safe to speak back to an unauthenticated caller. */
export interface RepairStatusSummary {
  ticketNumber: string;
  deviceModel: string;
  status: RepairTicket["status"];
  estimatedPrice: number | null;
}

export async function checkRepairStatus(
  supabase: SupabaseClient,
  rawInput: unknown,
): Promise<ToolResult<RepairStatusSummary>> {
  const parsed = checkRepairStatusInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, reason: "That doesn't look like a valid ticket number.", errorCode: "INVALID_INPUT" };
  }

  const { data, error } = await supabase
    .from("repair_tickets")
    .select("ticket_number, device_model, status, estimated_price")
    .eq("ticket_number", parsed.data.ticketNumber)
    .maybeSingle();

  if (error) {
    logger.error("check_repair_status_failed", { errorCode: error.code, message: error.message });
    return {
      ok: false,
      reason: "I couldn't check repair status right now due to a system issue.",
      errorCode: "STATUS_LOOKUP_FAILED",
    };
  }

  if (!data) {
    return { ok: false, reason: "I couldn't find a repair ticket with that number.", errorCode: "TICKET_NOT_FOUND" };
  }

  return {
    ok: true,
    data: {
      ticketNumber: data.ticket_number,
      deviceModel: data.device_model,
      status: data.status,
      estimatedPrice: data.estimated_price,
    },
  };
}

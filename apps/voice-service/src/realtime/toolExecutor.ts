import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTool, logger, type ToolResult } from "@phone-ai/shared";
import type { RealtimeToolCall } from "./openaiRealtimeClient.js";

export type PendingAction = { type: "transfer"; reason: string } | { type: "end_call"; summary?: string } | null;

export interface ToolExecutionOutcome {
  result: ToolResult;
  pendingAction: PendingAction;
  customerRequestType: string | null;
  createdServiceRequestId: string | null;
  createdBookingId: string | null;
}

const REQUEST_TYPE_BY_TOOL: Record<string, string> = {
  getRepairPrice: "pricing_inquiry",
  checkPartAvailability: "pricing_inquiry",
  checkRepairStatus: "repair_status",
  createBooking: "booking",
  createServiceRequest: "service_request",
  getShopInformation: "shop_information",
  getOpeningHours: "shop_information",
  transferToHuman: "human_transfer",
};

/**
 * Runs one AI-invoked tool call through the shared, validated tool
 * registry (packages/shared/src/tools/registry.ts) and translates the
 * result into call-record bookkeeping and any telephony side effect the
 * media bridge must carry out (transfer or hang up).
 *
 * Parsing failures and unknown tools never reach the database — executeTool
 * itself validates every input against its zod schema first.
 */
export async function runToolCall(
  supabase: SupabaseClient,
  callId: string,
  toolCall: RealtimeToolCall,
): Promise<ToolExecutionOutcome> {
  let args: unknown = {};
  try {
    args = toolCall.argumentsJson ? JSON.parse(toolCall.argumentsJson) : {};
  } catch {
    logger.warn("tool_call_arguments_unparseable", { callId, tool: toolCall.name });
    return {
      result: { ok: false, reason: "Invalid tool arguments.", errorCode: "INVALID_ARGUMENTS_JSON" },
      pendingAction: null,
      customerRequestType: null,
      createdServiceRequestId: null,
      createdBookingId: null,
    };
  }

  const result = await executeTool(supabase, toolCall.name, args);
  logger.info("tool_call_executed", { callId, tool: toolCall.name, ok: result.ok, errorCode: result.errorCode });

  let pendingAction: PendingAction = null;
  let createdServiceRequestId: string | null = null;
  let createdBookingId: string | null = null;

  if (toolCall.name === "transferToHuman" && result.ok) {
    const reason = (result.data as { reason?: string })?.reason ?? "unspecified";
    pendingAction = { type: "transfer", reason };
  } else if (toolCall.name === "endCall" && result.ok) {
    const summary = (result.data as { summary?: string })?.summary;
    pendingAction = { type: "end_call", summary };
  } else if (toolCall.name === "createServiceRequest" && result.ok) {
    createdServiceRequestId = (result.data as { id?: string })?.id ?? null;
  } else if (toolCall.name === "createBooking" && result.ok) {
    createdBookingId = (result.data as { id?: string })?.id ?? null;
  }

  return {
    result,
    pendingAction,
    customerRequestType: REQUEST_TYPE_BY_TOOL[toolCall.name] ?? null,
    createdServiceRequestId,
    createdBookingId,
  };
}

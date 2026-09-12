import type { SupabaseClient } from "@supabase/supabase-js";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolResult } from "../types.js";
import {
  getRepairPrice,
  getRepairPriceInputSchema,
  checkPartAvailability,
  checkPartAvailabilityInputSchema,
} from "./pricing.js";
import { checkRepairStatus, checkRepairStatusInputSchema } from "./repairStatus.js";
import { getShopInformation, getOpeningHours } from "./shopInfo.js";
import {
  createServiceRequest,
  createServiceRequestInputSchema,
  createBooking,
  createBookingInputSchema,
} from "./booking.js";
import {
  validateTransferRequest,
  transferToHumanInputSchema,
  validateEndCallRequest,
  endCallInputSchema,
} from "./transfer.js";
import { z } from "zod";

/**
 * Every business tool the AI voice agent is allowed to call. This is the
 * ONLY interface between the model and business data — the model never
 * gets direct database or SQL access. Each entry pairs an input schema
 * (used both for the JSON schema advertised to the model and for runtime
 * validation) with a handler that talks to Supabase through the shared
 * tool functions above.
 *
 * `readOnly` tools are safe to execute without additional side effects;
 * `sideEffecting` tools create records and are called out for logging.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  sideEffecting: boolean;
  execute: (supabase: SupabaseClient, input: unknown) => Promise<ToolResult>;
}

const emptySchema = z.object({}).strict();

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "getRepairPrice",
    description:
      "Look up the approved repair price for a device model, variant, and part. Returns all matching approved price entries; if more than one matches, ask the customer to clarify (e.g. original vs compatible part) rather than picking one.",
    inputSchema: getRepairPriceInputSchema,
    sideEffecting: false,
    execute: (supabase, input) => getRepairPrice(supabase, input),
  },
  {
    name: "checkRepairStatus",
    description: "Look up the current status of a repair by its ticket number.",
    inputSchema: checkRepairStatusInputSchema,
    sideEffecting: false,
    execute: (supabase, input) => checkRepairStatus(supabase, input),
  },
  {
    name: "checkPartAvailability",
    description: "Check whether a part is in stock for a given device model.",
    inputSchema: checkPartAvailabilityInputSchema,
    sideEffecting: false,
    execute: (supabase, input) => checkPartAvailability(supabase, input),
  },
  {
    name: "getShopInformation",
    description:
      "Get shop identity details: name, address, phone, services offered, accepted payment methods, warranty and repair policy.",
    inputSchema: emptySchema,
    sideEffecting: false,
    execute: (supabase) => getShopInformation(supabase),
  },
  {
    name: "getOpeningHours",
    description: "Get the shop's opening hours for each day of the week and upcoming holiday closures.",
    inputSchema: emptySchema,
    sideEffecting: false,
    execute: (supabase) => getOpeningHours(supabase),
  },
  {
    name: "createServiceRequest",
    description:
      "Log a new service/repair request for a customer who wants to bring in a device but is not booking a specific time slot yet. Requires the customer's name and phone number.",
    inputSchema: createServiceRequestInputSchema,
    sideEffecting: true,
    execute: (supabase, input) => createServiceRequest(supabase, input),
  },
  {
    name: "createBooking",
    description:
      "Create a booking for a specific service at a specific future date and time. Requires the customer's name and phone number.",
    inputSchema: createBookingInputSchema,
    sideEffecting: true,
    execute: (supabase, input) => createBooking(supabase, input),
  },
  {
    name: "transferToHuman",
    description:
      "Request that the live call be transferred to a human technician. Use when the customer explicitly asks for a human, asks something you cannot reliably answer, disputes pricing, needs staff approval, sounds frustrated, or when a backend tool failure prevents you from helping.",
    inputSchema: transferToHumanInputSchema,
    sideEffecting: true,
    execute: async (_supabase, input) => validateTransferRequest(input),
  },
  {
    name: "endCall",
    description:
      "End the call gracefully once the customer's request has been fully handled and they have nothing further.",
    inputSchema: endCallInputSchema,
    sideEffecting: false,
    execute: async (_supabase, input) => validateEndCallRequest(input),
  },
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find((t) => t.name === name);
}

/** Builds the OpenAI Realtime API `tools` array from the shared registry. */
export function buildOpenAiToolSpecs(): Array<{
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return toolDefinitions.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.inputSchema, { target: "openApi3" }) as Record<string, unknown>,
  }));
}

/**
 * Validates and executes a tool call by name. This is the single choke
 * point every AI-invoked tool call passes through — unknown tool names and
 * malformed arguments are rejected here before any database access.
 */
export async function executeTool(supabase: SupabaseClient, name: string, rawArgs: unknown): Promise<ToolResult> {
  const tool = getToolDefinition(name);
  if (!tool) {
    return { ok: false, reason: "That action is not available.", errorCode: "UNKNOWN_TOOL" };
  }
  try {
    return await tool.execute(supabase, rawArgs);
  } catch (err) {
    return {
      ok: false,
      reason: "A system issue prevented completing that action.",
      errorCode: err instanceof Error ? err.message : "TOOL_EXECUTION_FAILED",
    };
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ToolResult } from "../types.js";
import { nonEmptyTrimmedString, phoneNumberSchema } from "../validation.js";
import { logger } from "../logger.js";

const customerDetailsSchema = z.object({
  name: nonEmptyTrimmedString,
  phoneNumber: phoneNumberSchema,
});

/**
 * Finds an existing customer by phone or creates one. Phone number is the
 * natural key for a walk-in/call-in shop — customers rarely have accounts.
 */
async function upsertCustomer(
  supabase: SupabaseClient,
  details: z.infer<typeof customerDetailsSchema>,
): Promise<{ id: string } | null> {
  const { data: existing, error: findError } = await supabase
    .from("customers")
    .select("id")
    .eq("phone_number", details.phoneNumber)
    .maybeSingle();

  if (findError) {
    logger.error("customer_lookup_failed", { errorCode: findError.code, message: findError.message });
    return null;
  }
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from("customers")
    .insert({ phone_number: details.phoneNumber, name: details.name })
    .select("id")
    .single();

  if (createError) {
    logger.error("customer_create_failed", { errorCode: createError.code, message: createError.message });
    return null;
  }
  return created;
}

export const createServiceRequestInputSchema = z.object({
  customerDetails: customerDetailsSchema,
  deviceModel: nonEmptyTrimmedString,
  issue: nonEmptyTrimmedString,
  // Not something the model is expected to supply — the voice-service
  // fills this in from the Realtime API's own function-call id before
  // executing the tool (see toolExecutor.ts), so a redelivered/duplicate
  // call is deduped even though the model never reasons about idempotency.
  idempotencyKey: z.string().min(1).max(200).optional(),
});

export async function createServiceRequest(
  supabase: SupabaseClient,
  rawInput: unknown,
): Promise<ToolResult<{ id: string }>> {
  const parsed = createServiceRequestInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "I need the customer's name, phone number, device model, and the issue to log a service request.",
      errorCode: "INVALID_INPUT",
    };
  }
  const { customerDetails, deviceModel, issue, idempotencyKey } = parsed.data;

  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("service_requests")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return { ok: true, data: { id: existing.id } };
  }

  const customer = await upsertCustomer(supabase, customerDetails);
  if (!customer) {
    return {
      ok: false,
      reason: "I couldn't save that request right now due to a system issue.",
      errorCode: "CUSTOMER_UPSERT_FAILED",
    };
  }

  const { data, error } = await supabase
    .from("service_requests")
    .insert({
      customer_id: customer.id,
      device_model: deviceModel,
      issue,
      status: "new",
      idempotency_key: idempotencyKey ?? null,
    })
    .select("id")
    .single();

  if (error) {
    logger.error("create_service_request_failed", { errorCode: error.code, message: error.message });
    return {
      ok: false,
      reason: "I couldn't save that request right now due to a system issue.",
      errorCode: "SERVICE_REQUEST_CREATE_FAILED",
    };
  }

  return { ok: true, data: { id: data.id } };
}

export const createBookingInputSchema = z.object({
  customerDetails: customerDetailsSchema,
  service: nonEmptyTrimmedString,
  requestedDateTime: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(1000).optional(),
  // See the comment on createServiceRequestInputSchema — filled in by the
  // voice-service, not the model.
  idempotencyKey: z.string().min(1).max(200).optional(),
});

export async function createBooking(supabase: SupabaseClient, rawInput: unknown): Promise<ToolResult<{ id: string }>> {
  const parsed = createBookingInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "I need the customer's name, phone number, the service, and the requested date/time to book.",
      errorCode: "INVALID_INPUT",
    };
  }
  const { customerDetails, service, requestedDateTime, notes, idempotencyKey } = parsed.data;

  const requested = new Date(requestedDateTime);
  if (requested.getTime() <= Date.now()) {
    return {
      ok: false,
      reason: "That booking time is in the past — please give a future date and time.",
      errorCode: "INVALID_DATETIME",
    };
  }

  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("bookings")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return { ok: true, data: { id: existing.id } };
  }

  const customer = await upsertCustomer(supabase, customerDetails);
  if (!customer) {
    return {
      ok: false,
      reason: "I couldn't create that booking right now due to a system issue.",
      errorCode: "CUSTOMER_UPSERT_FAILED",
    };
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      customer_id: customer.id,
      service,
      requested_at: requested.toISOString(),
      status: "requested",
      notes: notes ?? null,
      idempotency_key: idempotencyKey ?? null,
    })
    .select("id")
    .single();

  if (error) {
    logger.error("create_booking_failed", { errorCode: error.code, message: error.message });
    return {
      ok: false,
      reason: "I couldn't create that booking right now due to a system issue.",
      errorCode: "BOOKING_CREATE_FAILED",
    };
  }

  return { ok: true, data: { id: data.id } };
}

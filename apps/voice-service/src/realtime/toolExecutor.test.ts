import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createMockSupabaseClient, ok } from "@phone-ai/shared/testUtils";
import { runToolCall } from "./toolExecutor.js";

describe("runToolCall", () => {
  it("rejects an unknown tool without a pending action", async () => {
    const supabase = createMockSupabaseClient({});
    const outcome = await runToolCall(supabase, "call-1", { callId: "x1", name: "dropTables", argumentsJson: "{}" });
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.errorCode).toBe("UNKNOWN_TOOL");
    expect(outcome.pendingAction).toBeNull();
  });

  it("returns INVALID_ARGUMENTS_JSON for unparseable arguments instead of crashing", async () => {
    const supabase = createMockSupabaseClient({});
    const outcome = await runToolCall(supabase, "call-1", {
      callId: "x1",
      name: "getShopInformation",
      argumentsJson: "{not json",
    });
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.errorCode).toBe("INVALID_ARGUMENTS_JSON");
  });

  it("queues a transfer pending action on a valid transferToHuman call", async () => {
    const supabase = createMockSupabaseClient({});
    const outcome = await runToolCall(supabase, "call-1", {
      callId: "x1",
      name: "transferToHuman",
      argumentsJson: JSON.stringify({ reason: "customer_requested" }),
    });
    expect(outcome.result.ok).toBe(true);
    expect(outcome.pendingAction).toEqual({ type: "transfer", reason: "customer_requested" });
    expect(outcome.customerRequestType).toBe("human_transfer");
  });

  it("queues an end_call pending action on a valid endCall call", async () => {
    const supabase = createMockSupabaseClient({});
    const outcome = await runToolCall(supabase, "call-1", { callId: "x1", name: "endCall", argumentsJson: "{}" });
    expect(outcome.result.ok).toBe(true);
    expect(outcome.pendingAction).toEqual({ type: "end_call", summary: undefined });
  });

  it("tracks the created booking id and request type on a successful createBooking call", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const supabase = createMockSupabaseClient({
      customers: [ok({ id: "cust1" })],
      bookings: [ok({ id: "booking-1" })],
    });
    const outcome = await runToolCall(supabase, "call-1", {
      callId: "x1",
      name: "createBooking",
      argumentsJson: JSON.stringify({
        customerDetails: { name: "Anand", phoneNumber: "+919876543210" },
        service: "Screen replacement",
        requestedDateTime: future,
      }),
    });
    expect(outcome.result.ok).toBe(true);
    expect(outcome.createdBookingId).toBe("booking-1");
    expect(outcome.customerRequestType).toBe("booking");
    expect(outcome.pendingAction).toBeNull();
  });

  it("stamps the Realtime API's function-call id as the idempotency key when the model didn't supply one", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    let insertedPayload: Record<string, unknown> | undefined;
    const supabase: SupabaseClient = {
      from(table: string) {
        if (table === "customers") {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "cust1" }, error: null }) }),
            }),
          };
        }
        // table === "bookings"
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          insert: (payload: Record<string, unknown>) => {
            insertedPayload = payload;
            return { select: () => ({ single: () => Promise.resolve({ data: { id: "booking-1" }, error: null }) }) };
          },
        };
      },
    } as unknown as SupabaseClient;

    await runToolCall(supabase, "call-1", {
      callId: "call_realtime_abc123",
      name: "createBooking",
      argumentsJson: JSON.stringify({
        customerDetails: { name: "Anand", phoneNumber: "+919876543210" },
        service: "Screen replacement",
        requestedDateTime: future,
      }),
    });

    expect(insertedPayload?.idempotency_key).toBe("call_realtime_abc123");
  });

  it("does not override an idempotency key the model already supplied", async () => {
    let lookupKey: unknown;
    const supabase: SupabaseClient = {
      from(table: string) {
        if (table === "service_requests") {
          return {
            select: () => ({
              eq: (_col: string, value: unknown) => {
                lookupKey = value;
                return { maybeSingle: () => Promise.resolve({ data: { id: "already-there" }, error: null }) };
              },
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const outcome = await runToolCall(supabase, "call-1", {
      callId: "call_realtime_xyz",
      name: "createServiceRequest",
      argumentsJson: JSON.stringify({
        customerDetails: { name: "Anand", phoneNumber: "+919876543210" },
        deviceModel: "Samsung A15",
        issue: "cracked screen",
        idempotencyKey: "model-supplied-key",
      }),
    });

    expect(lookupKey).toBe("model-supplied-key");
    expect(outcome.result.ok).toBe(true);
  });
});

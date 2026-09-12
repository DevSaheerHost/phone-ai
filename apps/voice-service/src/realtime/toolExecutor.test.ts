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
});

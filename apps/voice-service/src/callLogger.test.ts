import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, dbError, ok } from "@phone-ai/shared/testUtils";
import { finalizeCallRecord, startCallRecord } from "./callLogger.js";

describe("startCallRecord", () => {
  it("returns the given call_id on a fresh insert", async () => {
    const supabase = createMockSupabaseClient({ calls: [ok(null)] });
    const callId = await startCallRecord(supabase, {
      callId: "call-1",
      providerCallId: "CA1",
      callerPhone: "+919876543210",
    });
    expect(callId).toBe("call-1");
  });

  it("deduplicates a Twilio webhook retry by returning the original call's id", async () => {
    // First .from("calls") call is the insert (conflict), second is the
    // lookup for the call that already owns this provider_call_id.
    const supabase = createMockSupabaseClient({
      calls: [dbError("23505"), ok({ call_id: "original-call-id" })],
    });
    const callId = await startCallRecord(supabase, { callId: "call-2", providerCallId: "CA1", callerPhone: null });
    expect(callId).toBe("original-call-id");
  });

  it("falls back to the newly generated id if the conflicting row can't be found", async () => {
    const supabase = createMockSupabaseClient({
      calls: [dbError("23505"), ok(null)],
    });
    const callId = await startCallRecord(supabase, { callId: "call-3", providerCallId: "CA1", callerPhone: null });
    expect(callId).toBe("call-3");
  });

  it("does not throw on an unrelated database error, and returns the attempted id", async () => {
    const supabase = createMockSupabaseClient({ calls: [dbError("500", "connection reset")] });
    const callId = await startCallRecord(supabase, { callId: "call-4", providerCallId: "CA1", callerPhone: null });
    expect(callId).toBe("call-4");
  });
});

function createFinalizeMockSupabase(startedAt: string | null) {
  let updatePayload: Record<string, unknown> | null = null;
  const client = {
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: startedAt ? { started_at: startedAt } : null, error: null }),
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return chain;
        },
        then: (onFulfilled: (v: { data: null; error: null }) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(onFulfilled),
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, getUpdatePayload: () => updatePayload };
}

describe("finalizeCallRecord", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes duration_seconds from the call's started_at", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:05:00.000Z"));
    const { client, getUpdatePayload } = createFinalizeMockSupabase("2024-01-01T00:00:00.000Z");

    await finalizeCallRecord(client, { callId: "call-1", outcome: "completed_by_ai" });

    expect(getUpdatePayload()).toMatchObject({ duration_seconds: 300, outcome: "completed_by_ai" });
  });

  it("stores a null duration when the call's start time can't be found", async () => {
    const { client, getUpdatePayload } = createFinalizeMockSupabase(null);

    await finalizeCallRecord(client, { callId: "unknown-call", outcome: "error" });

    expect(getUpdatePayload()).toMatchObject({ duration_seconds: null, outcome: "error" });
  });

  it("records transfer details when a call was handed off to a human", async () => {
    const { client, getUpdatePayload } = createFinalizeMockSupabase("2024-01-01T00:00:00.000Z");

    await finalizeCallRecord(client, {
      callId: "call-1",
      outcome: "transferred_to_human",
      transferredToHuman: true,
      transferReason: "customer_requested",
    });

    expect(getUpdatePayload()).toMatchObject({
      transferred_to_human: true,
      transfer_reason: "customer_requested",
    });
  });
});

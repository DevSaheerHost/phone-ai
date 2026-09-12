import { describe, expect, it } from "vitest";
import { createBooking, createServiceRequest } from "./booking.js";
import { createMockSupabaseClient, ok } from "../testUtils.js";

const customerDetails = { name: "Anand", phoneNumber: "+919876543210" };

describe("createServiceRequest", () => {
  it("rejects missing customer details", async () => {
    const supabase = createMockSupabaseClient({});
    const result = await createServiceRequest(supabase, { deviceModel: "A15", issue: "cracked screen" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("INVALID_INPUT");
  });

  it("creates a new customer and a service request", async () => {
    const supabase = createMockSupabaseClient({
      customers: [ok(null), ok({ id: "cust1" })],
      service_requests: [ok({ id: "sr1" })],
    });
    const result = await createServiceRequest(supabase, {
      customerDetails,
      deviceModel: "Samsung A15",
      issue: "cracked screen",
    });
    expect(result.ok).toBe(true);
    expect(result.data?.id).toBe("sr1");
  });

  it("reuses an existing customer instead of creating a duplicate", async () => {
    const supabase = createMockSupabaseClient({
      customers: [ok({ id: "cust1" })],
      service_requests: [ok({ id: "sr2" })],
    });
    const result = await createServiceRequest(supabase, {
      customerDetails,
      deviceModel: "Samsung A15",
      issue: "battery drain",
    });
    expect(result.ok).toBe(true);
  });

  it("short-circuits on a repeated idempotency key without re-inserting", async () => {
    const idempotencyKey = "11111111-1111-1111-1111-111111111111";
    const supabase = createMockSupabaseClient({
      service_requests: [ok({ id: "already-created" })],
    });
    const result = await createServiceRequest(supabase, {
      customerDetails,
      deviceModel: "Samsung A15",
      issue: "battery drain",
      idempotencyKey,
    });
    expect(result.ok).toBe(true);
    expect(result.data?.id).toBe("already-created");
  });
});

describe("createBooking", () => {
  it("rejects a booking time in the past", async () => {
    const supabase = createMockSupabaseClient({});
    const result = await createBooking(supabase, {
      customerDetails,
      service: "Screen replacement",
      requestedDateTime: "2000-01-01T10:00:00Z",
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("INVALID_DATETIME");
  });

  it("creates a booking for a future date/time", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const supabase = createMockSupabaseClient({
      customers: [ok({ id: "cust1" })],
      bookings: [ok({ id: "b1" })],
    });
    const result = await createBooking(supabase, {
      customerDetails,
      service: "Screen replacement",
      requestedDateTime: future,
    });
    expect(result.ok).toBe(true);
    expect(result.data?.id).toBe("b1");
  });
});

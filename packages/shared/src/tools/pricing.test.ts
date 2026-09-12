import { describe, expect, it } from "vitest";
import { checkPartAvailability, getRepairPrice } from "./pricing.js";
import { createMockSupabaseClient, dbError, ok } from "../testUtils.js";

const basePricingRow = {
  id: "p1",
  model: "Samsung A15",
  variant: null,
  part: "display",
  quality: "original",
  price: 3500,
  labor_charge: 500,
  currency: "INR",
  valid_from: "2020-01-01T00:00:00Z",
  valid_until: null,
  active: true,
};

describe("getRepairPrice", () => {
  it("rejects invalid input without querying the database", async () => {
    const supabase = createMockSupabaseClient({});
    const result = await getRepairPrice(supabase, { model: "" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("INVALID_INPUT");
  });

  it("returns a single confirmed match without needing clarification", async () => {
    const supabase = createMockSupabaseClient({ device_pricing: [ok([basePricingRow])] });
    const result = await getRepairPrice(supabase, { model: "Samsung A15", part: "display" });
    expect(result.ok).toBe(true);
    expect(result.data?.needsClarification).toBe(false);
    expect(result.data?.matches).toHaveLength(1);
    expect(result.data?.matches[0].total).toBe(4000);
  });

  it("flags multiple matches as needing clarification instead of picking one", async () => {
    const compatibleRow = { ...basePricingRow, id: "p2", quality: "compatible", price: 1800 };
    const supabase = createMockSupabaseClient({ device_pricing: [ok([basePricingRow, compatibleRow])] });
    const result = await getRepairPrice(supabase, { model: "Samsung A15", part: "display" });
    expect(result.ok).toBe(true);
    expect(result.data?.needsClarification).toBe(true);
    expect(result.data?.matches).toHaveLength(2);
  });

  it("never fabricates a price when none is on file", async () => {
    const supabase = createMockSupabaseClient({ device_pricing: [ok([])] });
    const result = await getRepairPrice(supabase, { model: "Unknown Phone", part: "display" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PRICE_NOT_FOUND");
  });

  it("returns a safe fallback reason on a database error", async () => {
    const supabase = createMockSupabaseClient({ device_pricing: [dbError()] });
    const result = await getRepairPrice(supabase, { model: "Samsung A15", part: "display" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PRICING_LOOKUP_FAILED");
    expect(result.reason).not.toMatch(/db error/);
  });
});

describe("checkPartAvailability", () => {
  it("rejects invalid input", async () => {
    const supabase = createMockSupabaseClient({});
    const result = await checkPartAvailability(supabase, {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("INVALID_INPUT");
  });

  it("returns availability rows when found", async () => {
    const row = {
      id: "a1",
      model: "Samsung A15",
      part: "display",
      quality: "original",
      in_stock: true,
      quantity: 2,
      updated_at: "2024-01-01",
    };
    const supabase = createMockSupabaseClient({ part_availability: [ok([row])] });
    const result = await checkPartAvailability(supabase, { model: "Samsung A15", part: "display" });
    expect(result.ok).toBe(true);
    expect(result.data?.[0].in_stock).toBe(true);
  });

  it("reports not found instead of guessing", async () => {
    const supabase = createMockSupabaseClient({ part_availability: [ok([])] });
    const result = await checkPartAvailability(supabase, { model: "Samsung A15", part: "battery" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PART_NOT_FOUND");
  });
});

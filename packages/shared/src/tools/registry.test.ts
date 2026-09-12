import { describe, expect, it } from "vitest";
import { buildOpenAiToolSpecs, executeTool, toolDefinitions } from "./registry.js";
import { createMockSupabaseClient, ok } from "../testUtils.js";

describe("tool registry", () => {
  it("advertises every business tool as an OpenAI function spec", () => {
    const specs = buildOpenAiToolSpecs();
    expect(specs).toHaveLength(toolDefinitions.length);
    const names = specs.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "getRepairPrice",
        "checkRepairStatus",
        "checkPartAvailability",
        "getShopInformation",
        "getOpeningHours",
        "createServiceRequest",
        "createBooking",
        "transferToHuman",
        "endCall",
      ]),
    );
  });

  it("rejects an unknown tool name without touching the database", async () => {
    const supabase = createMockSupabaseClient({});
    const result = await executeTool(supabase, "dropAllTables", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("UNKNOWN_TOOL");
  });

  it("dispatches a known tool to its handler", async () => {
    const shopConfig = {
      shop_name: "Test Shop",
      address: "123 Main St",
      phone_number: "+10000000000",
      greeting: "Hello",
      hours: [],
      holidays: [],
      services: ["repair"],
      accepted_payment_methods: ["cash"],
      warranty_policy: "30 days",
      repair_policy: "standard",
      human_transfer_number: "+10000000001",
      updated_at: new Date().toISOString(),
    };
    const supabase = createMockSupabaseClient({ shop_config: [ok(shopConfig)] });
    const result = await executeTool(supabase, "getShopInformation", {});
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ shop_name: "Test Shop" });
  });

  it("never lets a handler exception leak internal details to the caller", async () => {
    const throwingSupabase = {
      from() {
        throw new Error("internal stack trace with secrets");
      },
    } as never;
    const result = await executeTool(throwingSupabase, "getShopInformation", {});
    expect(result.ok).toBe(false);
    expect(result.reason).not.toMatch(/secrets/);
  });
});

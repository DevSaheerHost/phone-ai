import { describe, expect, it } from "vitest";
import { checkRepairStatus } from "./repairStatus.js";
import { createMockSupabaseClient, dbError, ok } from "../testUtils.js";

describe("checkRepairStatus", () => {
  it("normalizes and finds a ticket", async () => {
    const row = { ticket_number: "RP1024", device_model: "Samsung A15", status: "in_progress", estimated_price: 4000 };
    const supabase = createMockSupabaseClient({ repair_tickets: [ok(row)] });
    const result = await checkRepairStatus(supabase, { ticketNumber: " rp1024 " });
    expect(result.ok).toBe(true);
    expect(result.data?.ticketNumber).toBe("RP1024");
    expect(result.data?.status).toBe("in_progress");
  });

  it("returns TICKET_NOT_FOUND for an invalid ticket number rather than fabricating status", async () => {
    const supabase = createMockSupabaseClient({ repair_tickets: [ok(null)] });
    const result = await checkRepairStatus(supabase, { ticketNumber: "RP9999" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("TICKET_NOT_FOUND");
  });

  it("rejects empty input", async () => {
    const supabase = createMockSupabaseClient({});
    const result = await checkRepairStatus(supabase, { ticketNumber: "" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("INVALID_INPUT");
  });

  it("returns a safe reason on database failure", async () => {
    const supabase = createMockSupabaseClient({ repair_tickets: [dbError()] });
    const result = await checkRepairStatus(supabase, { ticketNumber: "RP1024" });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("STATUS_LOOKUP_FAILED");
  });
});

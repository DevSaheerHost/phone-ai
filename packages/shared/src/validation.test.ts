import { describe, expect, it } from "vitest";
import { normalizePhoneNumber, normalizeTicketNumber, phoneNumberSchema, ticketNumberSchema } from "./validation.js";

describe("normalizePhoneNumber", () => {
  it("normalizes a plain number to E.164-ish form", () => {
    expect(normalizePhoneNumber("9876543210")).toBe("+9876543210");
  });

  it("preserves an existing plus and strips formatting", () => {
    expect(normalizePhoneNumber("+91 98765 43210")).toBe("+919876543210");
  });

  it("rejects numbers that are too short", () => {
    expect(normalizePhoneNumber("12345")).toBeNull();
  });

  it("rejects numbers that are too long", () => {
    expect(normalizePhoneNumber("1".repeat(20))).toBeNull();
  });
});

describe("normalizeTicketNumber", () => {
  it("uppercases and strips whitespace", () => {
    expect(normalizeTicketNumber(" rp 1024 ")).toBe("RP1024");
  });
});

describe("schemas", () => {
  it("phoneNumberSchema rejects invalid input via zod", () => {
    const result = phoneNumberSchema.safeParse("abc");
    expect(result.success).toBe(false);
  });

  it("ticketNumberSchema normalizes valid input", () => {
    const result = ticketNumberSchema.safeParse("rp1024");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("RP1024");
  });
});

import { z } from "zod";

/**
 * Normalizes a phone number to E.164-ish digits-with-leading-plus form for
 * storage/lookup consistency. Rejects obviously invalid input rather than
 * guessing a country code.
 */
export function normalizePhoneNumber(raw: string): string | null {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `${hasPlus ? "+" : "+"}${digits}`;
}

/** Ticket numbers are shop-issued, e.g. "RP1024". Case/space tolerant. */
export function normalizeTicketNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export const phoneNumberSchema = z
  .string()
  .min(7)
  .max(20)
  .transform((v, ctx) => {
    const normalized = normalizePhoneNumber(v);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid phone number" });
      return z.NEVER;
    }
    return normalized;
  });

export const ticketNumberSchema = z
  .string()
  .min(1)
  .max(32)
  .transform((v) => normalizeTicketNumber(v));

export const nonEmptyTrimmedString = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1).max(500));

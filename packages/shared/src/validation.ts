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

/**
 * Builds a safe `ilike` "contains" pattern for a user/AI-supplied value:
 * escapes Postgres LIKE wildcards (`%`, `_`, `\`) in the value itself so it
 * can't broaden the match beyond a literal substring, then wraps it in `%`
 * for a case-insensitive substring search. Used for fields like device
 * model/part where the AI's transcribed spelling (e.g. "A15") may be a
 * substring of the shop's stored value ("Samsung Galaxy A15") rather than
 * an exact match — without this, an exact `ilike` would spuriously report
 * "no price on file" for real, configured devices.
 */
export function likeContains(value: string): string {
  const escaped = value.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

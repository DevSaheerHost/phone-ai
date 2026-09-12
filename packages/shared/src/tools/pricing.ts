import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { DevicePricing, PartAvailability, ToolResult } from "../types.js";
import { nonEmptyTrimmedString } from "../validation.js";
import { logger } from "../logger.js";

export const getRepairPriceInputSchema = z.object({
  model: nonEmptyTrimmedString,
  variant: z.string().trim().max(200).optional(),
  part: nonEmptyTrimmedString,
  quality: z.string().trim().max(100).optional(),
});
export type GetRepairPriceInput = z.infer<typeof getRepairPriceInputSchema>;

export interface RepairPriceQuote {
  model: string;
  variant: string | null;
  part: string;
  quality: string;
  price: number;
  labor_charge: number;
  total: number;
  currency: string;
}

/**
 * Looks up an approved repair price. Never returns a guessed/derived price —
 * only rows explicitly configured in device_pricing. If more than one
 * active row matches (e.g. original vs compatible display), all candidates
 * are returned so the caller (AI) must ask the customer to disambiguate
 * rather than picking one silently.
 */
export async function getRepairPrice(
  supabase: SupabaseClient,
  rawInput: unknown,
): Promise<ToolResult<{ matches: RepairPriceQuote[]; needsClarification: boolean }>> {
  const parsed = getRepairPriceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, reason: "I need the device model and the part to check pricing.", errorCode: "INVALID_INPUT" };
  }
  const { model, variant, part, quality } = parsed.data;

  let query = supabase
    .from("device_pricing")
    .select("*")
    .eq("active", true)
    .ilike("model", model)
    .ilike("part", part)
    .lte("valid_from", new Date().toISOString())
    .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`);

  if (variant) query = query.ilike("variant", variant);
  if (quality) query = query.ilike("quality", quality);

  const { data, error } = await query;

  if (error) {
    logger.error("get_repair_price_failed", { errorCode: error.code, message: error.message });
    return {
      ok: false,
      reason: "I couldn't check pricing right now due to a system issue.",
      errorCode: "PRICING_LOOKUP_FAILED",
    };
  }

  const rows = (data ?? []) as DevicePricing[];
  if (rows.length === 0) {
    return {
      ok: false,
      reason: "There is no confirmed price on file for that device/part combination.",
      errorCode: "PRICE_NOT_FOUND",
    };
  }

  const matches: RepairPriceQuote[] = rows.map((row) => ({
    model: row.model,
    variant: row.variant,
    part: row.part,
    quality: row.quality,
    price: row.price,
    labor_charge: row.labor_charge,
    total: row.price + row.labor_charge,
    currency: row.currency,
  }));

  return { ok: true, data: { matches, needsClarification: matches.length > 1 } };
}

export const checkPartAvailabilityInputSchema = z.object({
  model: nonEmptyTrimmedString,
  part: nonEmptyTrimmedString,
  quality: z.string().trim().max(100).optional(),
});
export type CheckPartAvailabilityInput = z.infer<typeof checkPartAvailabilityInputSchema>;

export async function checkPartAvailability(
  supabase: SupabaseClient,
  rawInput: unknown,
): Promise<ToolResult<PartAvailability[]>> {
  const parsed = checkPartAvailabilityInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, reason: "I need the device model and part to check availability.", errorCode: "INVALID_INPUT" };
  }
  const { model, part, quality } = parsed.data;

  let query = supabase.from("part_availability").select("*").ilike("model", model).ilike("part", part);
  if (quality) query = query.ilike("quality", quality);

  const { data, error } = await query;

  if (error) {
    logger.error("check_part_availability_failed", { errorCode: error.code, message: error.message });
    return {
      ok: false,
      reason: "I couldn't check part availability right now due to a system issue.",
      errorCode: "AVAILABILITY_LOOKUP_FAILED",
    };
  }

  const rows = (data ?? []) as PartAvailability[];
  if (rows.length === 0) {
    return { ok: false, reason: "I don't have availability information for that part.", errorCode: "PART_NOT_FOUND" };
  }
  return { ok: true, data: rows };
}

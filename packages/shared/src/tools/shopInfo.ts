import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShopConfig, ToolResult } from "../types.js";
import { logger } from "../logger.js";

/**
 * shop_config is a singleton table (always id = 1). It is the single
 * source of truth for shop identity, hours, and policies so the AI never
 * has hard-coded business facts scattered through prompts/code.
 */
export async function getShopConfig(supabase: SupabaseClient): Promise<ShopConfig | null> {
  const { data, error } = await supabase.from("shop_config").select("*").eq("id", 1).maybeSingle();

  if (error) {
    logger.error("shop_config_fetch_failed", { errorCode: error.code, message: error.message });
    return null;
  }
  return data as ShopConfig | null;
}

export async function getShopInformation(supabase: SupabaseClient): Promise<ToolResult<ShopConfig>> {
  const config = await getShopConfig(supabase);
  if (!config) {
    return { ok: false, reason: "Shop information is not available right now.", errorCode: "SHOP_CONFIG_MISSING" };
  }
  return { ok: true, data: config };
}

export async function getOpeningHours(
  supabase: SupabaseClient,
): Promise<ToolResult<Pick<ShopConfig, "hours" | "holidays">>> {
  const config = await getShopConfig(supabase);
  if (!config) {
    return { ok: false, reason: "Opening hours are not available right now.", errorCode: "SHOP_CONFIG_MISSING" };
  }
  return { ok: true, data: { hours: config.hours, holidays: config.holidays } };
}

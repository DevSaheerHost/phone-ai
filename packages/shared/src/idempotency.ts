import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Records a provider webhook event exactly once. Returns false if this
 * (provider, provider_event_id) pair was already seen — the caller should
 * then skip re-processing (e.g. re-creating a booking) while still
 * returning a 200 to the provider so it stops retrying.
 */
export async function claimWebhookEvent(
  supabase: SupabaseClient,
  provider: string,
  providerEventId: string,
): Promise<boolean> {
  const { error } = await supabase.from("webhook_events").insert({ provider, provider_event_id: providerEventId });

  if (!error) return true;

  // Postgres unique_violation
  if (error.code === "23505") return false;

  throw new Error(`Failed to record webhook event: ${error.message}`);
}

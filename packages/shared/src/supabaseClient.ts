import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client authenticated with the service-role key.
 *
 * SECURITY: this client bypasses Row Level Security. It must only ever be
 * constructed in trusted server-side code (voice-service, Next.js route
 * handlers/server components) and its key must never reach a browser
 * bundle. Business tools accept this client as a parameter rather than
 * importing a singleton so tests can inject a fake/mock client instead.
 */
export function createServiceRoleClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export type { SupabaseClient };

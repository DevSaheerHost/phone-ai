function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * These are the only Supabase values the web app ever holds. The
 * service-role key lives exclusively in apps/voice-service — this app
 * always talks to Supabase as the signed-in user, so Row Level Security
 * (admin_roles) is what actually authorizes every read/write here.
 */
export const supabaseUrl = () => requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const supabaseAnonKey = () => requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

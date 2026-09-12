import { z } from "zod";

/**
 * Server-side environment schema. Import this only from server code
 * (voice-service, Next.js route handlers / server components) — never
 * from client-bundled code, since it includes secret keys.
 */
const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().min(1).default("gpt-realtime"),
  TELEPHONY_ACCOUNT_ID: z.string().min(1, "TELEPHONY_ACCOUNT_ID is required"),
  TELEPHONY_AUTH_TOKEN: z.string().min(1, "TELEPHONY_AUTH_TOKEN is required"),
  TELEPHONY_PHONE_NUMBER: z.string().min(1, "TELEPHONY_PHONE_NUMBER is required"),
  HUMAN_TRANSFER_NUMBER: z.string().min(1, "HUMAN_TRANSFER_NUMBER is required"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  PUBLIC_BASE_URL: z.string().url("PUBLIC_BASE_URL must be a valid URL"),
  VOICE_WEBHOOK_SECRET: z.string().min(16, "VOICE_WEBHOOK_SECRET must be at least 16 characters"),
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CALL_RECORD_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  ENABLE_TRANSCRIPT_STORAGE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Parses and validates process.env once, caching the result. Throws with a
 * precise, actionable message (naming the missing variable) rather than
 * letting the service start in a half-configured state.
 */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid or missing environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only helper to reset the cache between test cases. */
export function __resetServerEnvCacheForTests(): void {
  cached = undefined;
}

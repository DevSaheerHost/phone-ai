import { afterEach, describe, expect, it } from "vitest";
import { __resetServerEnvCacheForTests, loadServerEnv } from "./env.js";

const validEnv = {
  OPENAI_API_KEY: "sk-test",
  OPENAI_MODEL: "gpt-realtime",
  TELEPHONY_ACCOUNT_ID: "ACtest",
  TELEPHONY_AUTH_TOKEN: "authtoken",
  TELEPHONY_PHONE_NUMBER: "+15551234567",
  HUMAN_TRANSFER_NUMBER: "+15559876543",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  PUBLIC_BASE_URL: "https://voice.example.com",
  VOICE_WEBHOOK_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("loadServerEnv", () => {
  afterEach(() => {
    __resetServerEnvCacheForTests();
  });

  it("parses a fully valid environment", () => {
    const env = loadServerEnv(validEnv);
    expect(env.TELEPHONY_PHONE_NUMBER).toBe("+15551234567");
    expect(env.PORT).toBe(8080);
    expect(env.ENABLE_TRANSCRIPT_STORAGE).toBe(false);
  });

  it("throws a precise error naming the missing variable", () => {
    const { OPENAI_API_KEY: _omit, ...incomplete } = validEnv;
    expect(() => loadServerEnv(incomplete)).toThrow(/OPENAI_API_KEY/);
  });

  it("rejects a non-URL SUPABASE_URL", () => {
    expect(() => loadServerEnv({ ...validEnv, SUPABASE_URL: "not-a-url" })).toThrow(/SUPABASE_URL/);
  });

  it("rejects a webhook secret that is too short", () => {
    expect(() => loadServerEnv({ ...validEnv, VOICE_WEBHOOK_SECRET: "short" })).toThrow(/VOICE_WEBHOOK_SECRET/);
  });
});

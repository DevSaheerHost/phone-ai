import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, dbError, ok } from "@phone-ai/shared/testUtils";

const AUTH_TOKEN = process.env.TELEPHONY_AUTH_TOKEN as string;
const BASE_URL = process.env.PUBLIC_BASE_URL as string;

function signTwilioRequest(url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", AUTH_TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");
}

function mockConfigWithSupabase(supabase: unknown) {
  vi.doMock("../config.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../config.js")>();
    return { ...actual, supabase };
  });
}

describe("POST /twilio/voice", () => {
  it("creates a call record and returns TwiML that opens a Media Stream", async () => {
    vi.resetModules();
    mockConfigWithSupabase(createMockSupabaseClient({ calls: [ok(null)] }));
    const { twilioVoiceRouter } = await import("./twilioVoice.js");
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(twilioVoiceRouter);

    const params = { CallSid: "CA123", From: "+15550001111" };
    const signature = signTwilioRequest(`${BASE_URL}/twilio/voice`, params);

    const res = await request(app).post("/twilio/voice").set("X-Twilio-Signature", signature).type("form").send(params);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/xml/);
    expect(res.text).toContain("<Stream");
    expect(res.text).toContain("wss://");
    expect(res.text).toContain("callSid=CA123");
  });

  it("reuses the original call's id in the stream token when Twilio retries the webhook", async () => {
    vi.resetModules();
    const { verifyStreamToken } = await import("../security/mediaStreamAuth.js");
    // First .from("calls") is the insert (conflict from the retry), second
    // is the lookup that resolves it back to the call already on file.
    mockConfigWithSupabase(
      createMockSupabaseClient({ calls: [dbError("23505"), ok({ call_id: "original-call-id" })] }),
    );
    const { twilioVoiceRouter } = await import("./twilioVoice.js");
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(twilioVoiceRouter);

    const params = { CallSid: "CA123", From: "+15550001111" };
    const signature = signTwilioRequest(`${BASE_URL}/twilio/voice`, params);

    const res = await request(app).post("/twilio/voice").set("X-Twilio-Signature", signature).type("form").send(params);

    const tokenMatch = res.text.match(/token=([^&"]+)/);
    expect(tokenMatch).not.toBeNull();
    const token = decodeURIComponent(tokenMatch![1]);
    expect(verifyStreamToken(token, "CA123")).toEqual({ callId: "original-call-id" });
  });

  it("rejects a request without a valid Twilio signature", async () => {
    vi.resetModules();
    mockConfigWithSupabase(createMockSupabaseClient({ calls: [ok(null)] }));
    const { twilioVoiceRouter } = await import("./twilioVoice.js");
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(twilioVoiceRouter);

    const res = await request(app).post("/twilio/voice").type("form").send({ CallSid: "CA123", From: "+15550001111" });

    expect(res.status).toBe(403);
  });

  it("rejects a signed request missing CallSid", async () => {
    vi.resetModules();
    mockConfigWithSupabase(createMockSupabaseClient({ calls: [ok(null)] }));
    const { twilioVoiceRouter } = await import("./twilioVoice.js");
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(twilioVoiceRouter);

    const params = { From: "+15550001111" };
    const signature = signTwilioRequest(`${BASE_URL}/twilio/voice`, params);

    const res = await request(app).post("/twilio/voice").set("X-Twilio-Signature", signature).type("form").send(params);

    expect(res.status).toBe(400);
  });
});

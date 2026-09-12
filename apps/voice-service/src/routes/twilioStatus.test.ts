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

async function buildApp() {
  const { twilioStatusRouter } = await import("./twilioStatus.js");
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(twilioStatusRouter);
  return app;
}

describe("POST /twilio/status", () => {
  it("finalizes a completed call that the media bridge never closed out", async () => {
    vi.resetModules();
    mockConfigWithSupabase(
      createMockSupabaseClient({
        webhook_events: [ok(null)], // insert succeeds -> new event
        calls: [ok({ id: "row-1", started_at: "2024-01-01T00:00:00Z", ended_at: null }), ok(null)],
      }),
    );
    const app = await buildApp();

    const params = { CallSid: "CA123", CallStatus: "completed" };
    const signature = signTwilioRequest(`${BASE_URL}/twilio/status`, params);

    const res = await request(app)
      .post("/twilio/status")
      .set("X-Twilio-Signature", signature)
      .type("form")
      .send(params);

    expect(res.status).toBe(200);
  });

  it("does not re-finalize a call that was already ended", async () => {
    vi.resetModules();
    let updateCalled = false;
    const supabase = {
      from(table: string) {
        if (table === "webhook_events") {
          return { insert: () => Promise.resolve({ error: null }) };
        }
        // table === "calls"
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () =>
            Promise.resolve({
              data: { id: "row-1", started_at: "2024-01-01T00:00:00Z", ended_at: "2024-01-01T00:05:00Z" },
              error: null,
            }),
          update: () => {
            updateCalled = true;
            return chain;
          },
        };
        return chain;
      },
    };
    mockConfigWithSupabase(supabase);
    const app = await buildApp();

    const params = { CallSid: "CA123", CallStatus: "completed" };
    const signature = signTwilioRequest(`${BASE_URL}/twilio/status`, params);

    const res = await request(app)
      .post("/twilio/status")
      .set("X-Twilio-Signature", signature)
      .type("form")
      .send(params);

    expect(res.status).toBe(200);
    expect(updateCalled).toBe(false);
  });

  it("is idempotent: a duplicate status callback for the same CallSid+CallStatus is skipped", async () => {
    vi.resetModules();
    const supabase = createMockSupabaseClient({
      // A conflict (23505) on the webhook_events insert means this exact
      // (provider, provider_event_id) pair was already processed.
      webhook_events: [dbError("23505", "duplicate")],
    });
    mockConfigWithSupabase(supabase);
    const app = await buildApp();

    const params = { CallSid: "CA123", CallStatus: "completed" };
    const signature = signTwilioRequest(`${BASE_URL}/twilio/status`, params);

    const res = await request(app)
      .post("/twilio/status")
      .set("X-Twilio-Signature", signature)
      .type("form")
      .send(params);

    expect(res.status).toBe(200);
  });

  it("ignores non-terminal statuses (e.g. ringing) without touching the calls table", async () => {
    vi.resetModules();
    mockConfigWithSupabase(createMockSupabaseClient({ webhook_events: [ok(null)] }));
    const app = await buildApp();

    const params = { CallSid: "CA123", CallStatus: "ringing" };
    const signature = signTwilioRequest(`${BASE_URL}/twilio/status`, params);

    const res = await request(app)
      .post("/twilio/status")
      .set("X-Twilio-Signature", signature)
      .type("form")
      .send(params);

    expect(res.status).toBe(200);
  });

  it("rejects a request without a valid Twilio signature", async () => {
    vi.resetModules();
    mockConfigWithSupabase(createMockSupabaseClient({}));
    const app = await buildApp();

    const res = await request(app)
      .post("/twilio/status")
      .type("form")
      .send({ CallSid: "CA123", CallStatus: "completed" });

    expect(res.status).toBe(403);
  });

  it("rejects a signed request missing CallStatus", async () => {
    vi.resetModules();
    mockConfigWithSupabase(createMockSupabaseClient({}));
    const app = await buildApp();

    const params = { CallSid: "CA123" };
    const signature = signTwilioRequest(`${BASE_URL}/twilio/status`, params);

    const res = await request(app)
      .post("/twilio/status")
      .set("X-Twilio-Signature", signature)
      .type("form")
      .send(params);

    expect(res.status).toBe(400);
  });
});

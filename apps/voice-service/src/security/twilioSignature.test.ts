import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { verifyTwilioSignature } from "./twilioSignature.js";

const AUTH_TOKEN = process.env.TELEPHONY_AUTH_TOKEN as string;
const BASE_URL = process.env.PUBLIC_BASE_URL as string;

/** Reproduces Twilio's own request-signing algorithm to produce a valid test signature. */
function signTwilioRequest(url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", AUTH_TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");
}

function buildApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.post("/twilio/voice", verifyTwilioSignature, (_req, res) => res.status(200).send("OK"));
  return app;
}

describe("verifyTwilioSignature", () => {
  it("rejects requests with no signature header", async () => {
    const app = buildApp();
    const res = await request(app).post("/twilio/voice").type("form").send({ CallSid: "CA123" });
    expect(res.status).toBe(403);
  });

  it("rejects requests with an invalid signature", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/twilio/voice")
      .set("X-Twilio-Signature", "bogus")
      .type("form")
      .send({ CallSid: "CA123" });
    expect(res.status).toBe(403);
  });

  it("rejects a tampered payload even with a signature present", async () => {
    const app = buildApp();
    const params = { CallSid: "CA123", From: "+15550001111" };
    const validSignature = signTwilioRequest(`${BASE_URL}/twilio/voice`, params);
    const res = await request(app)
      .post("/twilio/voice")
      .set("X-Twilio-Signature", validSignature)
      .type("form")
      .send({ CallSid: "CA123", From: "+15559999999" }); // tampered
    expect(res.status).toBe(403);
  });

  it("accepts a correctly signed request", async () => {
    const app = buildApp();
    const params = { CallSid: "CA123", From: "+15550001111" };
    const validSignature = signTwilioRequest(`${BASE_URL}/twilio/voice`, params);
    const res = await request(app)
      .post("/twilio/voice")
      .set("X-Twilio-Signature", validSignature)
      .type("form")
      .send(params);
    expect(res.status).toBe(200);
  });

  it("rejects non-POST methods", async () => {
    const app = express();
    app.get("/twilio/voice", verifyTwilioSignature, (_req, res) => res.status(200).send("OK"));
    const res = await request(app).get("/twilio/voice");
    expect(res.status).toBe(405);
  });
});

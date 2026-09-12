import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { healthRouter } from "./health.js";

describe("health routes", () => {
  it("GET /health returns 200 without requiring the database", async () => {
    const app = express();
    app.use(healthRouter);
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /health never leaks configuration or secrets", async () => {
    const app = express();
    app.use(healthRouter);
    const res = await request(app).get("/health");
    expect(JSON.stringify(res.body)).not.toMatch(/key|token|secret/i);
  });
});

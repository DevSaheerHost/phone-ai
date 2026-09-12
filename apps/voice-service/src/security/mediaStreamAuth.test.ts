import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeMediaStreamUpgrade, createStreamToken, verifyStreamToken } from "./mediaStreamAuth.js";

describe("media stream token", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifies a freshly issued token for the matching callSid", () => {
    const token = createStreamToken("call-1", "CA123");
    const result = verifyStreamToken(token, "CA123");
    expect(result).toEqual({ callId: "call-1" });
  });

  it("rejects a token presented with a different callSid", () => {
    const token = createStreamToken("call-1", "CA123");
    const result = verifyStreamToken(token, "CA999");
    expect(result).toBeNull();
  });

  it("rejects a tampered token", () => {
    const token = createStreamToken("call-1", "CA123");
    const tampered = token.slice(0, -2) + "00";
    expect(verifyStreamToken(tampered, "CA123")).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyStreamToken("not-a-token", "CA123")).toBeNull();
    expect(verifyStreamToken("", "CA123")).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    const token = createStreamToken("call-1", "CA123");
    vi.setSystemTime(new Date("2024-01-01T00:10:00Z")); // 10 minutes later, TTL is 5
    expect(verifyStreamToken(token, "CA123")).toBeNull();
  });
});

describe("authorizeMediaStreamUpgrade", () => {
  it("accepts a request at the right path with a valid token for the given callSid", () => {
    const token = createStreamToken("call-1", "CA123");
    const params = new URLSearchParams({ token, callSid: "CA123" });

    const result = authorizeMediaStreamUpgrade("/media-stream", params);

    expect(result).toEqual({ ok: true, callId: "call-1", callSid: "CA123" });
  });

  it("rejects any path other than /media-stream", () => {
    const token = createStreamToken("call-1", "CA123");
    const params = new URLSearchParams({ token, callSid: "CA123" });

    const result = authorizeMediaStreamUpgrade("/", params);

    expect(result).toEqual({ ok: false, reason: "wrong_path" });
  });

  it("rejects a request missing the token", () => {
    const params = new URLSearchParams({ callSid: "CA123" });
    expect(authorizeMediaStreamUpgrade("/media-stream", params)).toEqual({ ok: false, reason: "missing_params" });
  });

  it("rejects a request missing the callSid", () => {
    const token = createStreamToken("call-1", "CA123");
    const params = new URLSearchParams({ token });
    expect(authorizeMediaStreamUpgrade("/media-stream", params)).toEqual({ ok: false, reason: "missing_params" });
  });

  it("rejects a token that was issued for a different callSid", () => {
    const token = createStreamToken("call-1", "CA123");
    const params = new URLSearchParams({ token, callSid: "CA999" });
    expect(authorizeMediaStreamUpgrade("/media-stream", params)).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("rejects a garbage token instead of throwing", () => {
    const params = new URLSearchParams({ token: "garbage", callSid: "CA123" });
    expect(authorizeMediaStreamUpgrade("/media-stream", params)).toEqual({ ok: false, reason: "invalid_token" });
  });
});

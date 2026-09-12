import { describe, expect, it, vi } from "vitest";

const updateMock = vi.fn();

vi.mock("twilio", () => {
  const VoiceResponse = class {
    private parts: string[] = [];
    connect() {
      return {
        stream: (opts: { url: string }) => {
          this.parts.push(`<Stream url="${opts.url}">`);
          return {
            parameter: (p: { name: string; value: string }) => {
              this.parts.push(`<Parameter name="${p.name}" value="${p.value}"/>`);
            },
          };
        },
      };
    }
    dial(_opts: { callerId: string }, to: string) {
      this.parts.push(`<Dial>${to}</Dial>`);
    }
    toString() {
      return `<Response>${this.parts.join("")}</Response>`;
    }
  };

  const twilioFactory = vi.fn(() => ({
    calls: (_callSid: string) => ({ update: updateMock }),
  })) as unknown as {
    (...args: unknown[]): unknown;
    twiml: { VoiceResponse: typeof VoiceResponse };
    validateRequest: () => boolean;
  };

  twilioFactory.twiml = { VoiceResponse };
  twilioFactory.validateRequest = () => true;

  return { default: twilioFactory };
});

const { buildStreamTwiml, transferLiveCall, hangupLiveCall } = await import("./twilioClient.js");

describe("buildStreamTwiml", () => {
  it("embeds a wss:// stream URL and the caller's phone as a parameter", () => {
    const twiml = buildStreamTwiml("call-1", "CA123", "+919876543210");
    expect(twiml).toContain("wss://voice.example.com/media-stream");
    expect(twiml).toContain("callSid=CA123");
    expect(twiml).toContain('name="callerPhone" value="+919876543210"');
  });
});

describe("transferLiveCall", () => {
  it("returns ok:true when the Twilio API call succeeds", async () => {
    updateMock.mockResolvedValueOnce({});
    const result = await transferLiveCall("CA123", "+15559876543");
    expect(result.ok).toBe(true);
  });

  it("returns a safe error code instead of throwing when the Twilio API call fails", async () => {
    updateMock.mockRejectedValueOnce(new Error("network down"));
    const result = await transferLiveCall("CA123", "+15559876543");
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("TRANSFER_API_FAILED");
  });
});

describe("hangupLiveCall", () => {
  it("returns ok:true when the Twilio API call succeeds", async () => {
    updateMock.mockResolvedValueOnce({});
    const result = await hangupLiveCall("CA123");
    expect(result.ok).toBe(true);
  });

  it("returns a safe error code instead of throwing when the Twilio API call fails", async () => {
    updateMock.mockRejectedValueOnce(new Error("network down"));
    const result = await hangupLiveCall("CA123");
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("HANGUP_API_FAILED");
  });
});

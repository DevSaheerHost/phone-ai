import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];

  constructor(
    public url: string,
    public opts: unknown,
  ) {
    super();
    instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }
}

const instances: FakeWebSocket[] = [];

vi.mock("ws", () => ({ default: FakeWebSocket }));

const { OpenAiRealtimeClient } = await import("./openaiRealtimeClient.js");

function sentTypes(ws: FakeWebSocket): string[] {
  return ws.sent.map((s) => JSON.parse(s).type);
}

function latestWs(): FakeWebSocket {
  const ws = instances[instances.length - 1];
  if (!ws) throw new Error("no FakeWebSocket instance created");
  return ws;
}

beforeEach(() => {
  instances.length = 0;
});

describe("OpenAiRealtimeClient — function call sequencing", () => {
  it("does not emit toolCall until response.done, even though arguments finished earlier", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();

    const events: string[] = [];
    client.on("toolCall", () => events.push("toolCall"));
    client.on("responseDone", () => events.push("responseDone"));

    ws.emit("message", JSON.stringify({ type: "response.created" }));
    ws.emit(
      "message",
      JSON.stringify({
        type: "response.function_call_arguments.done",
        call_id: "call-abc",
        name: "getShopInformation",
        arguments: "{}",
      }),
    );

    // The response containing the function call hasn't completed yet —
    // emitting toolCall here would let a caller send response.create
    // while the API still considers the response active.
    expect(events).toEqual([]);

    ws.emit("message", JSON.stringify({ type: "response.done" }));

    expect(events).toEqual(["toolCall", "responseDone"]);
  });

  it("emits every buffered function call, in order, once the response completes", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();

    const calledTools: string[] = [];
    client.on("toolCall", (call) => calledTools.push(call.name));

    ws.emit("message", JSON.stringify({ type: "response.created" }));
    ws.emit(
      "message",
      JSON.stringify({
        type: "response.function_call_arguments.done",
        call_id: "1",
        name: "getRepairPrice",
        arguments: "{}",
      }),
    );
    ws.emit(
      "message",
      JSON.stringify({
        type: "response.function_call_arguments.done",
        call_id: "2",
        name: "getOpeningHours",
        arguments: "{}",
      }),
    );
    ws.emit("message", JSON.stringify({ type: "response.done" }));

    expect(calledTools).toEqual(["getRepairPrice", "getOpeningHours"]);
  });

  it("clears the buffer between responses so a stale call is never replayed", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();

    const calledTools: string[] = [];
    client.on("toolCall", (call) => calledTools.push(call.name));

    ws.emit("message", JSON.stringify({ type: "response.created" }));
    ws.emit(
      "message",
      JSON.stringify({
        type: "response.function_call_arguments.done",
        call_id: "1",
        name: "getRepairPrice",
        arguments: "{}",
      }),
    );
    ws.emit("message", JSON.stringify({ type: "response.done" }));

    // A second, unrelated response with no function call.
    ws.emit("message", JSON.stringify({ type: "response.created" }));
    ws.emit("message", JSON.stringify({ type: "response.done" }));

    expect(calledTools).toEqual(["getRepairPrice"]);
  });
});

describe("OpenAiRealtimeClient — response-active guards", () => {
  it("does not send response.cancel when nothing is playing", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();

    client.cancelResponse();

    expect(sentTypes(ws)).not.toContain("response.cancel");
  });

  it("sends response.cancel while a response is active (real barge-in)", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();

    ws.emit("message", JSON.stringify({ type: "response.created" }));
    client.cancelResponse();

    expect(sentTypes(ws)).toContain("response.cancel");
  });

  it("clears the active flag once response.done arrives, so a later cancel is a no-op again", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();

    ws.emit("message", JSON.stringify({ type: "response.created" }));
    ws.emit("message", JSON.stringify({ type: "response.done" }));
    ws.sent.length = 0;

    client.cancelResponse();

    expect(sentTypes(ws)).not.toContain("response.cancel");
  });

  it("speak() is a no-op while a response is active, so the silence timer can't collide with it", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();

    ws.emit("message", JSON.stringify({ type: "response.created" }));
    client.speak("Are you still there?");

    expect(sentTypes(ws)).not.toContain("response.create");
  });

  it("speak() sends response.create when nothing is active", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();

    client.speak("Are you still there?");

    expect(sentTypes(ws)).toContain("response.create");
  });
});

describe("OpenAiRealtimeClient — audio and session wiring", () => {
  it("forwards response.audio.delta payloads to listeners", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();

    const deltas: string[] = [];
    client.on("audioDelta", (d) => deltas.push(d));

    ws.emit("message", JSON.stringify({ type: "response.audio.delta", delta: "base64audio" }));

    expect(deltas).toEqual(["base64audio"]);
  });

  it("configureSession sends a session.update followed by a response.create for the greeting", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();

    client.configureSession("system instructions", [], "Hello, welcome!");

    const messages = ws.sent.map((s) => JSON.parse(s));
    expect(messages[0].type).toBe("session.update");
    expect(messages[0].session.instructions).toBe("system instructions");
    expect(messages[1].type).toBe("response.create");
    expect(messages[1].response.instructions).toContain("Hello, welcome!");
  });

  it("sendToolResult appends the function output and always requests a follow-up response", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();

    client.sendToolResult("call-abc", { ok: true, data: { price: 100 } });

    const messages = ws.sent.map((s) => JSON.parse(s));
    expect(messages[0].type).toBe("conversation.item.create");
    expect(messages[0].item.call_id).toBe("call-abc");
    expect(JSON.parse(messages[0].item.output)).toEqual({ ok: true, data: { price: 100 } });
    expect(messages[1].type).toBe("response.create");
  });

  it("drops outbound messages once the socket is closed, instead of throwing", () => {
    const client = new OpenAiRealtimeClient("call-1");
    client.connect();
    const ws = latestWs();
    ws.close();

    expect(() => client.speak("hello")).not.toThrow();
  });
});

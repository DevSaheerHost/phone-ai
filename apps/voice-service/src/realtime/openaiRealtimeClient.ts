import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { logger } from "@phone-ai/shared";
import { env, OPENAI_REALTIME_URL, REALTIME_AUDIO_FORMAT } from "../config.js";

export interface RealtimeToolCall {
  callId: string;
  name: string;
  argumentsJson: string;
}

interface RealtimeClientEvents {
  open: () => void;
  audioDelta: (base64Audio: string) => void;
  speechStarted: () => void;
  toolCall: (call: RealtimeToolCall) => void;
  responseDone: () => void;
  callerTranscript: (text: string) => void;
  error: (message: string) => void;
  close: () => void;
}

/**
 * Thin wrapper around the OpenAI Realtime API WebSocket. Speech-to-speech
 * (audio in, audio out) with server-side voice activity detection, which is
 * what makes low-latency barge-in possible: OpenAI emits
 * `input_audio_buffer.speech_started` the instant the caller starts talking,
 * even mid-response, so the bridge can cancel playback immediately.
 */
export class OpenAiRealtimeClient extends EventEmitter {
  private ws: WebSocket | undefined;
  private readonly callId: string;

  constructor(callId: string) {
    super();
    this.callId = callId;
  }

  override on<E extends keyof RealtimeClientEvents>(event: E, listener: RealtimeClientEvents[E]): this {
    return super.on(event, listener);
  }

  override emit<E extends keyof RealtimeClientEvents>(event: E, ...args: Parameters<RealtimeClientEvents[E]>): boolean {
    return super.emit(event, ...args);
  }

  connect(): void {
    this.ws = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    this.ws.on("open", () => this.emit("open"));
    this.ws.on("message", (raw) => this.handleMessage(raw.toString()));
    this.ws.on("error", (err) => {
      logger.error("openai_realtime_socket_error", { callId: this.callId, message: err.message });
      this.emit("error", err.message);
    });
    this.ws.on("close", () => this.emit("close"));
  }

  private handleMessage(raw: string): void {
    let event: { type: string; [key: string]: unknown };
    try {
      event = JSON.parse(raw);
    } catch {
      logger.warn("openai_realtime_unparseable_message", { callId: this.callId });
      return;
    }

    switch (event.type) {
      case "response.audio.delta": {
        const delta = event.delta as string | undefined;
        if (delta) this.emit("audioDelta", delta);
        break;
      }
      case "input_audio_buffer.speech_started":
        this.emit("speechStarted");
        break;
      case "response.function_call_arguments.done": {
        const callId = event.call_id as string;
        const name = event.name as string;
        const argumentsJson = event.arguments as string;
        this.emit("toolCall", { callId, name, argumentsJson });
        break;
      }
      case "response.done":
        this.emit("responseDone");
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const transcript = event.transcript as string | undefined;
        if (transcript) this.emit("callerTranscript", transcript);
        break;
      }
      case "error": {
        const message = (event.error as { message?: string } | undefined)?.message ?? "unknown_realtime_error";
        logger.error("openai_realtime_api_error", { callId: this.callId, message });
        this.emit("error", message);
        break;
      }
      default:
        break;
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  configureSession(instructions: string, tools: Array<Record<string, unknown>>, greeting: string): void {
    this.send({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        instructions,
        voice: "alloy",
        input_audio_format: REALTIME_AUDIO_FORMAT,
        output_audio_format: REALTIME_AUDIO_FORMAT,
        // Used only to detect spoken language for logging (see mediaBridge) —
        // raw transcript text is discarded unless ENABLE_TRANSCRIPT_STORAGE=true.
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: { type: "server_vad" },
        tools,
        tool_choice: "auto",
      },
    });

    // Speak the configured greeting as the first turn instead of waiting on the caller.
    this.send({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: `Greet the caller with exactly: "${greeting}"`,
      },
    });
  }

  appendCallerAudio(base64Audio: string): void {
    this.send({ type: "input_audio_buffer.append", audio: base64Audio });
  }

  /** Cancels the in-flight response — used the instant the caller barges in. */
  cancelResponse(): void {
    this.send({ type: "response.cancel" });
  }

  sendToolResult(callId: string, result: unknown): void {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    this.send({ type: "response.create" });
  }

  /** Injects a system-authored utterance (e.g. a silence check-in) without waiting for caller input. */
  speak(instructionText: string): void {
    this.send({
      type: "response.create",
      response: { modalities: ["audio", "text"], instructions: instructionText },
    });
  }

  close(): void {
    this.ws?.close();
  }
}

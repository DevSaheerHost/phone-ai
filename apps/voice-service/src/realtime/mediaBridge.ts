import type WebSocket from "ws";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getShopConfig,
  buildSystemPrompt,
  buildGreeting,
  buildOpenAiToolSpecs,
  getFallbackMessage,
  logger,
  type ShopConfig,
} from "@phone-ai/shared";
import { env, SILENCE_CHECK_IN_SECONDS, SILENCE_HANGUP_SECONDS } from "../config.js";
import { OpenAiRealtimeClient } from "./openaiRealtimeClient.js";
import { runToolCall, type PendingAction } from "./toolExecutor.js";
import { detectLanguageTag } from "./languageDetect.js";
import { transferLiveCall, hangupLiveCall } from "../telephony/twilioClient.js";
import { recordCallEvent, finalizeCallRecord } from "../callLogger.js";
import type { CallOutcome, CustomerRequestType } from "@phone-ai/shared";

interface TwilioStartEvent {
  event: "start";
  start: { streamSid: string; callSid: string; customParameters?: Record<string, string> };
}
interface TwilioMediaEvent {
  event: "media";
  media: { payload: string };
}
interface TwilioStopEvent {
  event: "stop";
}
type TwilioStreamMessage = TwilioStartEvent | TwilioMediaEvent | TwilioStopEvent | { event: string };

/**
 * Owns one phone call end to end: bridges Twilio's Media Stream WebSocket
 * to the OpenAI Realtime WebSocket, executes AI tool calls through the
 * shared business-tool registry, carries out transfer/hang-up side
 * effects, and writes the call's log record. One instance per call.
 */
export class MediaBridge {
  private readonly twilioWs: WebSocket;
  private readonly supabase: SupabaseClient;
  private readonly callId: string;
  private readonly expectedCallSid: string;

  private openai: OpenAiRealtimeClient | undefined;
  private streamSid: string | undefined;
  private callerPhone: string | null = null;

  private pendingAction: PendingAction = null;
  private customerRequestType: CustomerRequestType | null = null;
  private createdServiceRequestId: string | null = null;
  private createdBookingId: string | null = null;
  private languageDetected: string | null = null;
  private finalized = false;

  private lastActivityAt = Date.now();
  private checkInSent = false;
  private silenceInterval: NodeJS.Timeout | undefined;

  constructor(twilioWs: WebSocket, supabase: SupabaseClient, callId: string, expectedCallSid: string) {
    this.twilioWs = twilioWs;
    this.supabase = supabase;
    this.callId = callId;
    this.expectedCallSid = expectedCallSid;
  }

  start(): void {
    this.twilioWs.on("message", (raw) => this.handleTwilioMessage(raw.toString()));
    this.twilioWs.on("close", () => this.handleTwilioClose());
    this.silenceInterval = setInterval(() => this.checkSilence(), 5_000);
  }

  private async handleTwilioMessage(raw: string): Promise<void> {
    let message: TwilioStreamMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.event === "start") {
      await this.handleStart(message as TwilioStartEvent);
    } else if (message.event === "media") {
      const media = (message as TwilioMediaEvent).media;
      if (media?.payload) this.openai?.appendCallerAudio(media.payload);
    } else if (message.event === "stop") {
      await this.finalize("abandoned");
    }
  }

  private async handleStart(message: TwilioStartEvent): Promise<void> {
    const { streamSid, callSid, customParameters } = message.start;

    if (callSid !== this.expectedCallSid) {
      logger.error("media_stream_callsid_mismatch", { callId: this.callId });
      this.twilioWs.close();
      return;
    }

    this.streamSid = streamSid;
    this.callerPhone = customParameters?.callerPhone ?? null;

    const shopConfig = await getShopConfig(this.supabase);
    if (!shopConfig) {
      logger.error("media_stream_missing_shop_config", { callId: this.callId });
      await this.failAndHangUp("SHOP_CONFIG_MISSING");
      return;
    }

    this.openai = new OpenAiRealtimeClient(this.callId);
    this.wireOpenAiEvents(shopConfig);
    this.openai.connect();
  }

  private wireOpenAiEvents(shopConfig: ShopConfig): void {
    const openai = this.openai;
    if (!openai) return;

    openai.on("open", () => {
      const instructions = buildSystemPrompt(shopConfig);
      const greeting = buildGreeting(shopConfig);
      openai.configureSession(instructions, buildOpenAiToolSpecs(), greeting);
      void recordCallEvent(this.supabase, this.callId, "ai_connected");
    });

    openai.on("audioDelta", (base64Audio) => {
      this.sendTwilioMedia(base64Audio);
    });

    openai.on("speechStarted", () => {
      this.lastActivityAt = Date.now();
      this.checkInSent = false;
      // Barge-in: caller started talking over the AI — stop playback immediately.
      this.sendTwilioClear();
      openai.cancelResponse();
    });

    openai.on("callerTranscript", (text) => {
      this.languageDetected = detectLanguageTag(text);
      void recordCallEvent(
        this.supabase,
        this.callId,
        "caller_speech_detected",
        env.ENABLE_TRANSCRIPT_STORAGE ? { transcript: text } : {},
      );
    });

    openai.on("toolCall", async (toolCall) => {
      void recordCallEvent(this.supabase, this.callId, "tool_call_requested", { tool: toolCall.name });
      const outcome = await runToolCall(this.supabase, this.callId, toolCall);
      openai.sendToolResult(toolCall.callId, outcome.result);

      if (outcome.pendingAction) this.pendingAction = outcome.pendingAction;
      if (outcome.customerRequestType) this.customerRequestType = outcome.customerRequestType as CustomerRequestType;
      if (outcome.createdServiceRequestId) this.createdServiceRequestId = outcome.createdServiceRequestId;
      if (outcome.createdBookingId) this.createdBookingId = outcome.createdBookingId;

      void recordCallEvent(this.supabase, this.callId, "tool_call_result", {
        tool: toolCall.name,
        ok: outcome.result.ok,
        errorCode: outcome.result.errorCode,
      });
    });

    openai.on("responseDone", () => {
      void this.runPendingActionIfAny();
    });

    openai.on("error", (message) => {
      void recordCallEvent(this.supabase, this.callId, "realtime_error", { message });
    });

    openai.on("close", () => {
      void this.finalize(this.finalized ? undefined : "error");
    });
  }

  /** Executes a transfer/end-call decided by the AI, after it has finished speaking that turn. */
  private async runPendingActionIfAny(): Promise<void> {
    if (!this.pendingAction || !this.streamSid) return;
    const action = this.pendingAction;
    this.pendingAction = null;

    const callSid = this.expectedCallSid;

    if (action.type === "transfer") {
      const result = await transferLiveCall(callSid, env.HUMAN_TRANSFER_NUMBER);
      void recordCallEvent(this.supabase, this.callId, "transfer_attempted", { reason: action.reason, ok: result.ok });
      if (result.ok) {
        await this.finalize("transferred_to_human", { transferredToHuman: true, transferReason: action.reason });
      } else {
        this.openai?.speak(this.localizedFallback("transferFailed"));
        await this.finalize("transfer_failed_callback_taken", {
          transferredToHuman: false,
          transferReason: action.reason,
          errorCode: result.errorCode,
        });
      }
      return;
    }

    if (action.type === "end_call") {
      await hangupLiveCall(callSid);
      await this.finalize("completed_by_ai");
    }
  }

  private localizedFallback(key: Parameters<typeof getFallbackMessage>[0]): string {
    const lang = this.languageDetected === "ml" || this.languageDetected === "mixed" ? "ml" : "en";
    return getFallbackMessage(key, lang);
  }

  private async failAndHangUp(errorCode: string): Promise<void> {
    await this.finalize("error", { errorCode });
    this.twilioWs.close();
  }

  private sendTwilioMedia(base64Audio: string): void {
    if (!this.streamSid || this.twilioWs.readyState !== this.twilioWs.OPEN) return;
    this.twilioWs.send(JSON.stringify({ event: "media", streamSid: this.streamSid, media: { payload: base64Audio } }));
  }

  private sendTwilioClear(): void {
    if (!this.streamSid || this.twilioWs.readyState !== this.twilioWs.OPEN) return;
    this.twilioWs.send(JSON.stringify({ event: "clear", streamSid: this.streamSid }));
  }

  private checkSilence(): void {
    if (!this.openai || this.finalized) return;
    const idleSeconds = (Date.now() - this.lastActivityAt) / 1000;

    if (idleSeconds >= SILENCE_HANGUP_SECONDS) {
      void hangupLiveCall(this.expectedCallSid);
      void this.finalize("abandoned");
      return;
    }

    if (idleSeconds >= SILENCE_CHECK_IN_SECONDS && !this.checkInSent) {
      this.checkInSent = true;
      this.openai.speak(this.localizedFallback("callTimeout"));
    }
  }

  private handleTwilioClose(): void {
    void this.finalize(this.finalized ? undefined : "abandoned");
  }

  private async finalize(
    outcome?: CallOutcome,
    extra: { transferredToHuman?: boolean; transferReason?: string; errorCode?: string } = {},
  ): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;

    if (this.silenceInterval) clearInterval(this.silenceInterval);
    this.openai?.close();
    if (this.twilioWs.readyState === this.twilioWs.OPEN) this.twilioWs.close();

    if (outcome) {
      await finalizeCallRecord(this.supabase, {
        callId: this.callId,
        outcome,
        transferredToHuman: extra.transferredToHuman ?? false,
        transferReason: extra.transferReason ?? null,
        customerRequestType: this.customerRequestType,
        createdServiceRequestId: this.createdServiceRequestId,
        createdBookingId: this.createdBookingId,
        errorCode: extra.errorCode ?? null,
        languageDetected: this.languageDetected,
      });
    }
  }
}

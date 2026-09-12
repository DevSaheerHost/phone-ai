import { createServer } from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import { logger } from "@phone-ai/shared";
import { env, supabase } from "./config.js";
import { healthRouter } from "./routes/health.js";
import { twilioVoiceRouter } from "./routes/twilioVoice.js";
import { twilioStatusRouter } from "./routes/twilioStatus.js";
import { webhookRateLimiter } from "./security/rateLimit.js";
import { verifyStreamToken } from "./security/mediaStreamAuth.js";
import { MediaBridge } from "./realtime/mediaBridge.js";

const app = express();
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(healthRouter);
app.use("/twilio", webhookRateLimiter);
app.use(twilioVoiceRouter);
app.use(twilioStatusRouter);

app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("unhandled_request_error", { message: err.message });
  res.status(500).json({ error: "internal_error" });
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "", "http://internal");
  if (url.pathname !== "/media-stream") {
    socket.destroy();
    return;
  }

  const token = url.searchParams.get("token");
  const callSid = url.searchParams.get("callSid");
  if (!token || !callSid) {
    socket.destroy();
    return;
  }

  const verified = verifyStreamToken(token, callSid);
  if (!verified) {
    logger.warn("media_stream_auth_rejected");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    const bridge = new MediaBridge(ws, supabase, verified.callId, callSid);
    bridge.start();
  });
});

server.listen(env.PORT, () => {
  logger.info("voice_service_started", { port: env.PORT, env: env.NODE_ENV });
});

function shutdown(signal: string): void {
  logger.info("voice_service_shutting_down", { signal });
  wss.clients.forEach((client) => client.close());
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

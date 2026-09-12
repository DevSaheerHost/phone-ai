import { loadServerEnv, createServiceRoleClient, type ServerEnv } from "@phone-ai/shared";

export const env: ServerEnv = loadServerEnv();

export const supabase = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(env.OPENAI_MODEL)}`;

/** Twilio sends/receives 8kHz mu-law over Media Streams; matching this on the OpenAI side avoids transcoding. */
export const REALTIME_AUDIO_FORMAT = "g711_ulaw";

/** Seconds of caller silence before the AI checks in, and before it gives up and ends the call. */
export const SILENCE_CHECK_IN_SECONDS = 12;
export const SILENCE_HANGUP_SECONDS = 30;

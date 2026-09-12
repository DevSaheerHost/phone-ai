/**
 * Structured JSON logger. Every log line is one JSON object so it can be
 * shipped to any log aggregator. Never pass secrets or full PII — use
 * redact() for anything derived from caller-provided data.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const SECRET_KEY_PATTERN = /(key|token|secret|password|authorization)/i;

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return "[redacted]";
  return value;
}

function safeStringify(obj: Record<string, unknown>): string {
  try {
    return JSON.stringify(obj, (key, value) => redactValue(key, value));
  } catch {
    return JSON.stringify({ error: "log_serialization_failed" });
  }
}

export interface LogFields {
  callId?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, fields: LogFields = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  const line = safeStringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, fields?: LogFields) => log("debug", message, fields),
  info: (message: string, fields?: LogFields) => log("info", message, fields),
  warn: (message: string, fields?: LogFields) => log("warn", message, fields),
  error: (message: string, fields?: LogFields) => log("error", message, fields),
};

/** Masks all but the last 4 digits of a phone number for safe logging. */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "unknown";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `****${digits.slice(-4)}`;
}

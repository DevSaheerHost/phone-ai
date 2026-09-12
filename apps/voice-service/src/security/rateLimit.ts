import rateLimit from "express-rate-limit";

/**
 * Defense-in-depth on top of signature verification: caps how many webhook
 * requests any single source IP can make per minute, so a replayed or
 * spoofed burst can't hammer the database/OpenAI budget even if a
 * signature were somehow valid (e.g. a leaked auth token).
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited" },
});

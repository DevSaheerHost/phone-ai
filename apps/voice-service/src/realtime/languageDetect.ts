const MALAYALAM_RANGE = /[ഀ-ൿ]/;

/**
 * Coarse language tag for the calls.language_detected column. This is a
 * heuristic over the transcript text (Unicode-block based), not a
 * committed classification — good enough for dashboard visibility, not for
 * anything safety-critical.
 */
export function detectLanguageTag(transcript: string): "ml" | "en" | "mixed" {
  const hasMalayalam = MALAYALAM_RANGE.test(transcript);
  const hasLatin = /[A-Za-z]/.test(transcript);
  if (hasMalayalam && hasLatin) return "mixed";
  if (hasMalayalam) return "ml";
  return "en";
}

/**
 * Bilingual fallback phrases for failure paths the AI can hit mid-call.
 * These are spoken directly (via the Realtime session's text-to-speech),
 * not composed by the model, so a backend failure never surfaces a raw
 * error or an invented excuse to the caller.
 */
export const FALLBACK_MESSAGES = {
  genericError: {
    en: "Sorry, I ran into a technical issue. Let me try to connect you with a technician.",
    ml: "ക്ഷമിക്കണം, ഒരു technical issue ഉണ്ടായി. Technician-നോട് connect ചെയ്യാൻ ശ്രമിക്കാം.",
  },
  transferFailed: {
    en: "I'm sorry, I couldn't connect you to a technician right now. Can I take your name and phone number so staff can call you back?",
    ml: "I'm sorry, technician-നെ ഇപ്പോൾ connect ചെയ്യാൻ കഴിഞ്ഞില്ല. നിങ്ങളുടെ name and phone number എടുത്ത് staff-ന് callback request നൽകട്ടേ?",
  },
  noPriceOnFile: {
    en: "I don't have a confirmed price for that right now. I can connect you with a technician.",
    ml: "ഇതിന് exact price ഇപ്പോൾ confirm ചെയ്യാൻ കഴിയുന്നില്ല. Technician-നോട് connect ചെയ്യട്ടേ?",
  },
  ticketNotFound: {
    en: "I couldn't find a repair with that ticket number. Could you double-check it?",
    ml: "ആ ticket number-ൽ ഒരു repair കണ്ടെത്താൻ കഴിഞ്ഞില്ല. ഒന്നുകൂടി check ചെയ്യാമോ?",
  },
  callTimeout: {
    en: "Are you still there? I'll stay on the line a little longer.",
    ml: "നിങ്ങൾ ഇപ്പോഴും ഉണ്ടോ? ഞാൻ ഒന്നുകൂടി കാത്തിരിക്കാം.",
  },
} as const;

export type FallbackMessageKey = keyof typeof FALLBACK_MESSAGES;
export type SupportedLanguage = "en" | "ml";

export function getFallbackMessage(key: FallbackMessageKey, language: SupportedLanguage = "en"): string {
  return FALLBACK_MESSAGES[key][language];
}

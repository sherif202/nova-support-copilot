// Input checks that run in code before any model call (build step 9).
// Masking happens here, so the raw card number, CVV, PIN, OTP or national ID never reaches
// the model, a ticket, the log or the screen.

const MAX_LENGTH = 1000;

// Arabic-Indic digits to Latin, so masking catches "٤١١١ ..." too.
const latinDigits = (text) => text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function mask(text) {
  return latinDigits(text)
    // CVV, PIN and OTP/code values that follow those words (English, Franco-Arabic, Arabic).
    .replace(/\b(cvv2?|cvc|security code)(\s*(?:is|:|=)?\s*)\d{3,4}\b/gi, "$1$2[removed]")
    .replace(/\b(pin(?:\s*(?:code|number))?)(\s*(?:is|:|=)?\s*)\d{4,6}\b/gi, "$1$2[removed]")
    .replace(/\b(otp|one[- ]time (?:password|code)|verification code|passcode|code|kod|el code)(\s*(?:is|:|=)?\s*)\d{4,8}\b/gi, "$1$2[removed]")
    .replace(/(الكود|كود|الرمز|رمز|الرقم السري|الباسورد|باسورد|كلمة السر)(\s*(?:هو|:|=)?\s*)\d{3,8}/g, "$1$2[removed]")
    // A 14-digit Egyptian national ID (starts with 2 or 3).
    .replace(/\b[23]\d{13}\b/g, "[national ID removed]")
    // Full card numbers, 13 to 19 digits with optional spaces or dashes: keep the last 4 only.
    .replace(/\b\d(?:[ -]?\d){12,18}\b/g, (match) => "**** " + match.replace(/\D/g, "").slice(-4));
}

const FILLER = new Set(["test", "testing", "just testing", "just a test", "test test", "random", "random text", "lorem ipsum", "asdf"]);
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

// A Latin word that is keyboard mashing: a run of 4+ keys along one row, or 5+ letters with no vowel.
function isMash(word) {
  if (!/^[a-z]+$/.test(word)) return false;
  for (let i = 0; i + 4 <= word.length; i++) {
    if (KEYBOARD_ROWS.some((row) => row.includes(word.slice(i, i + 4)))) return true;
  }
  return word.length >= 5 && !/[aeiouy]/.test(word);
}

function isJunk(text) {
  const plain = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (!/\p{L}/u.test(plain)) return true;
  if (FILLER.has(plain)) return true;
  const words = plain.split(" ");
  return words.some(isMash) && words.every((w) => isMash(w) || w.length <= 3);
}

const INJECTION_PATTERNS = [
  /ignore (?:all |your |the |any )?(?:previous |prior )?(?:rules|instructions|prompt)/i,
  /disregard (?:your|the|all) (?:rules|instructions)/i,
  /^\s*system\s*:/im,
  /\b(?:admin|developer|god|dan) mode\b/i,
  /\byou are now\b/i,
  /\bpretend (?:you are|you're|to be)\b/i,
  /\b(?:you have|with) no (?:rules|limits|restrictions)\b/i,
  /\b(?:print|show|reveal|repeat|output)\b.{0,30}\b(?:system prompt|your prompt|your instructions)\b/i,
  /\bdecode this\b/i,
  /\bjailbreak\b/i,
  /تجاهل (?:كل )?(?:القواعد|التعليمات|الأوامر)/,
  /انسى (?:كل )?(?:القواعد|التعليمات)/,
  /\b(?:enssa|ensa|insa|ignore) (?:el )?(?:rules|ta3limat|qawa3ed)\b/i,
];

const flagInjection = (text) => INJECTION_PATTERNS.some((pattern) => pattern.test(text));

const looksArabic = (text) => /[؀-ۿ]/.test(text);

// Returns { stop: "R-EMPTY" | "R-TOO-LONG" | null, masked, injection_flagged, language }.
function guard(message) {
  const raw = String(message || "");
  const language = looksArabic(raw) ? "arabic" : "english";
  if (raw.length > MAX_LENGTH) return { stop: "R-TOO-LONG", masked: mask(raw.slice(0, 200)) + " …", injection_flagged: false, language };
  const masked = mask(raw.trim());
  if (!masked || isJunk(masked)) return { stop: "R-EMPTY", masked, injection_flagged: false, language };
  return { stop: null, masked, injection_flagged: flagInjection(masked), language };
}

module.exports = { guard, mask };

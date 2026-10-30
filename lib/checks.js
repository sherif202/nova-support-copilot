// Output checks on every model answer, in code, before the customer sees it (build step 12).
// Each check returns null when it passes, or { check, detail } naming the failure for prompts/retry.md.

const fs = require("fs");
const path = require("path");

const POLICIES = fs.readFileSync(path.join(__dirname, "..", "knowledge", "nova-policies.md"), "utf8").replace(/\r\n/g, "\n");

// Rule ID -> the text of that rule, from lines like "- **FEE-2.4** Withdrawal abroad: ...".
const RULES = Object.fromEntries(
  [...POLICIES.matchAll(/^\s*-\s*\*\*([A-Z]{2,4}-\d+(?:\.\d+)?)\*\*\s*(.*)$/gm)].map((m) => [m[1], m[2]])
);

const latinDigits = (text) => String(text).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

// Record, rule and notice IDs are not amounts.
const ID_PATTERN = /\b(?:TXN-\d{4}-\d{2}-\d{2}-\d{4}|D-\d{4}-\d{4}|CARD-\d{4}-\d+|ANN-\d{4}-\d{2}-\d{2}-\d{2}|TCK-\d{4}|C-\d{4}|[A-Z]{2,4}-\d+(?:\.\d+)?)\b/g;

function numbersIn(text) {
  return (latinDigits(text).replace(ID_PATTERN, " ").replace(/(\d),(\d{3})\b/g, "$1$2").replace(/(\d)٬(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) || [])
    .map(Number);
}

function checkSources(answer, ctx) {
  const known = new Set([...Object.keys(RULES), ...ctx.recordIds, ...ctx.noticeIds]);
  const unknown = answer.sources.filter((id) => !known.has(id));
  return unknown.length ? { check: "unknown_source", detail: { UNKNOWN_IDS: unknown.join(", ") } } : null;
}

// Every amount must be in the cited rules, the passed records or notices, or the customer's message.
// A percentage a cited rule states, applied to an amount from the sources, is allowed (FEE-2.4: 3% of 2,000 is 60).
function checkNumbers(answer, ctx) {
  const ruleText = answer.sources.filter((id) => RULES[id]).map((id) => RULES[id]).join(" ");
  const sourceText = [ruleText, ...ctx.records.map((r) => JSON.stringify(r)), ...ctx.notices.map((n) => JSON.stringify(n)), ctx.message].join(" ");
  const allowed = new Set(numbersIn(sourceText));
  // Dates in records ("2026-09-08") also allow the day and month written on their own.
  for (const match of sourceText.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) [match[1], match[2], match[3]].forEach((n) => allowed.add(Number(n)));
  const percents = [...ruleText.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  for (const p of percents) for (const n of [...allowed]) allowed.add(Math.round(p * n) / 100);
  const ungrounded = [...new Set(numbersIn(answer.answer_text))].filter((n) => !allowed.has(n));
  return ungrounded.length ? { check: "ungrounded_number", detail: { NUMBERS: ungrounded.join(", ") } } : null;
}

const PROMISES = [
  /\b(approved|refunded|waived|reimbursed|credited back)\b/i,
  /\bwill be (returned|refunded|reversed)\b/i,
  /\b(you will|you'll) (get|receive) (your|the) money back\b/i,
  /(تمت الموافقة|اتوافق على|اتقبل الاعتراض|هيترد|هيتردلك|هترجعلك|هيرجعلك|فلوسك هترجع|تم استرداد|اترد(ت)? ليك|تم الإعفاء|اتشالت الرسوم|اتلغت الرسوم)/,
];
const NEGATION = /\b(not|never|no|can't|cannot|can not|won't|isn't|unable|couldn't|don't)\b|مش|مقدرش|ما |لا |مينفعش|لسه/i;

// A promise word is fine only when the same sentence clearly negates it.
function checkPromises(answer) {
  const sentences = answer.answer_text.split(/(?<=[.!?؟。])\s+|\n+/);
  for (const sentence of sentences) {
    for (const pattern of PROMISES) {
      const match = sentence.match(pattern);
      if (match) {
        const before = sentence.slice(0, match.index);
        if (!NEGATION.test(before)) return { check: "promise_word", detail: { WORD: match[0] } };
      }
    }
  }
  return null;
}

function checkLanguage(answer, ctx) {
  const text = answer.answer_text.replace(ID_PATTERN, " ");
  const arabic = (text.match(/[؀-ۿ]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const wantArabic = ctx.inputLanguage === "arabic" || ctx.inputLanguage === "franco";
  const isArabic = arabic > latin;
  return wantArabic === isArabic ? null : { check: "wrong_language", detail: { INPUT_LANGUAGE: ctx.inputLanguage } };
}

function checkCardDigits(answer) {
  // Dates such as 2026-09-06 are not card numbers.
  const text = latinDigits(answer.answer_text).replace(ID_PATTERN, " ").replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  return /\d(?:[ -]?\d){7,}/.test(text) ? { check: "card_digits", detail: {} } : null;
}

// ---- Security checks (build step 15, docs/03-SECURITY-AND-FRAUD.md). A failure here is never retried. ----

// The copilot never asks for a PIN, OTP, CVV, password or full card number (FRD-4, CRD-5, red-team R12).
// (\b only works for Latin letters in JavaScript, so the Arabic verbs are matched as plain text.)
const ASK_VERBS = /\b(send|give|tell|share|enter|type|provide|confirm|verify|need|reply with|ma7tag|ebaatli|2oly|ektb)\b|ابعت|قولي|اكتب|محتاج|ادخل|دخّل|أرسل/i;
const SECRETS = /\b(pin|otp|cvv|cvc|password|passcode|card number|full card|verification code|one[- ]time)\b|الرقم السري|كلمة السر|الباسورد|رقم الكارت|رمز التحقق|الكود/i;
const NEGATED = /\b(never|don't|do not|not|won't|no one|nobody)\b|متديش|ما تديش|متقولش|متبعتش|عمرها ما|أبدا|ابدا|مش هنطلب|لا تشارك/i;
function checkSecretRequest(answer) {
  for (const sentence of answer.answer_text.split(/(?<=[.!?؟])\s+|\n+/)) {
    if (ASK_VERBS.test(sentence) && SECRETS.test(sentence) && !NEGATED.test(sentence)) {
      return { check: "secret_request", detail: {} };
    }
  }
  return null;
}

// Never quote the system prompt or the taxonomy (red-team R3).
const PROMPT_MARKERS = [
  "# 1. Role", "# 2. Context", "# 8. Output format", "<taxonomy>", "<policies>", "<examples>", "{{",
  "You are the first step", "You are Nova Bank's support assistant", "Fraud word list", "Non-negotiable", "Traps to watch", "| fee.", "| fraud.",
];
function checkPromptLeak(answer) {
  const leaked = PROMPT_MARKERS.find((marker) => answer.answer_text.includes(marker));
  return leaked ? { check: "prompt_leak", detail: {} } : null;
}

// Nova's answers never contain or confirm a web link (red-team R11): any URL or domain is blocked, except a
// merchant name from the customer's own records, such as "Booking.com".
function checkWebLink(answer, ctx) {
  const recordText = ctx.records.map((r) => JSON.stringify(r)).join(" ").toLowerCase();
  const links = answer.answer_text.match(/(https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|net|org|eg|io|info|link|xyz|app)\b)/gi) || [];
  return links.some((link) => !recordText.includes(link.toLowerCase())) ? { check: "web_link", detail: {} } : null;
}

const SECURITY_CHECKS = new Set(["secret_request", "prompt_leak", "web_link"]);

// ctx: { message, inputLanguage, records, recordIds, notices, noticeIds }
function runChecks(answer, ctx) {
  // Most serious first: the first failure is the one named in the retry.
  const results = {
    secret_request: checkSecretRequest(answer),
    prompt_leak: checkPromptLeak(answer),
    web_link: checkWebLink(answer, ctx),
    card_digits: checkCardDigits(answer),
    promises: checkPromises(answer),
    sources: checkSources(answer, ctx),
    numbers: checkNumbers(answer, ctx),
    language: checkLanguage(answer, ctx),
  };
  const failed = Object.values(results).find(Boolean) || null;
  const passed = Object.keys(results).filter((name) => !results[name]);
  return { failed, passed };
}

module.exports = { runChecks, checkPromises, RULES, SECURITY_CHECKS };

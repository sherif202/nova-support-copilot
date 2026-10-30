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
  const text = latinDigits(answer.answer_text).replace(ID_PATTERN, " ");
  return /\d(?:[ -]?\d){7,}/.test(text) ? { check: "card_digits", detail: {} } : null;
}

// ctx: { message, inputLanguage, records, recordIds, notices, noticeIds }
function runChecks(answer, ctx) {
  // Most serious first: the first failure is the one named in the retry.
  const results = {
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

module.exports = { runChecks, RULES };

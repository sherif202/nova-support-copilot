// The fraud word list, read from the "Fraud word list" table in knowledge/nova-taxonomy.md (build step 10).
// Checked in code before any model call: a match makes the message P0 and it never reaches a model.
// To add a phrase, add it to the taxonomy table; nothing is hard-coded here.

const fs = require("fs");
const path = require("path");

const TAXONOMY = path.join(__dirname, "..", "knowledge", "nova-taxonomy.md");

// Which intent each signal row stands for.
const INTENT_BY_SIGNAL = {
  "lost or stolen card": "fraud.card_lost_stolen",
  "a payment they didn't make": "fraud.unknown_txn",
  "asked for a code": "fraud.otp_phishing",
  "someone claiming to be nova": "fraud.otp_phishing",
  "account takeover": "fraud.account_takeover",
  "phishing link": "fraud.otp_phishing",
};

// Same spelling for the Arabic letters customers swap, curly quotes as straight, single spaces.
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Latin phrases match as whole words ("da3" must not fire inside another word); Arabic ones as text.
function toPattern(phrase) {
  const plain = normalize(phrase);
  const body = escape(plain).replace(/ /g, "\\s+").replace(/'/g, "'?");
  return /[a-z0-9]/.test(plain) ? new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`) : new RegExp(body);
}

function loadWordList() {
  const text = fs.readFileSync(TAXONOMY, "utf8").replace(/\r\n/g, "\n");
  const section = text.split("## Fraud word list")[1];
  if (!section) throw new Error("nova-taxonomy.md has no Fraud word list section");
  const rows = section.split("\n## ")[0].split("\n").filter((line) => line.startsWith("|"));
  const entries = [];
  for (const row of rows.slice(2)) {
    const [signal, ...languages] = row.split("|").slice(1, -1).map((cell) => cell.trim());
    const intent = INTENT_BY_SIGNAL[signal.toLowerCase()] || "fraud.unknown_txn";
    for (const cell of languages) {
      for (const phrase of cell.split(/[،,]/).map((p) => p.trim()).filter(Boolean)) {
        entries.push({ signal, phrase, intent, pattern: toPattern(phrase) });
      }
    }
  }
  if (!entries.length) throw new Error("The Fraud word list in nova-taxonomy.md is empty");
  return entries;
}

const WORD_LIST = loadWordList();

// The first fraud phrase in the message, or null.
function fraudSignal(message) {
  const text = normalize(message);
  return WORD_LIST.find((entry) => entry.pattern.test(text)) || null;
}

module.exports = { fraudSignal, wordCount: WORD_LIST.length };

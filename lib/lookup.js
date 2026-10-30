// Finds the logged-in customer's own records that best match a message. No model call.
// The customer ID always comes from the login, never from the message (docs/03-SECURITY-AND-FRAUD.md, B).

const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8"));

const MONTHS = {
  jan: 1, january: 1, يناير: 1,
  feb: 2, february: 2, فبراير: 2,
  mar: 3, march: 3, مارس: 3,
  apr: 4, april: 4, أبريل: 4, ابريل: 4,
  may: 5, مايو: 5,
  jun: 6, june: 6, يونيو: 6,
  jul: 7, july: 7, يوليو: 7,
  aug: 8, august: 8, أغسطس: 8, اغسطس: 8,
  sep: 9, sept: 9, september: 9, سبتمبر: 9,
  oct: 10, october: 10, أكتوبر: 10, اكتوبر: 10,
  nov: 11, november: 11, نوفمبر: 11,
  dec: 12, december: 12, ديسمبر: 12,
};
const MONTH_WORDS = Object.keys(MONTHS).join("|");

// Arabic-Indic digits to Latin, and "2,000" to "2000".
function normalizeDigits(text) {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/(\d),(\d{3})\b/g, "$1$2");
}

// Day and month pairs the customer mentioned: 14/9, 14 Sep, Sep 14, 3 أكتوبر.
function findDates(text) {
  const dates = [];
  const take = (day, month) => {
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) dates.push({ day, month });
  };
  let rest = text.replace(/\b(\d{1,2})\/(\d{1,2})\b/g, (_, d, m) => (take(+d, +m), " "));
  rest = rest.replace(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MONTH_WORDS})`, "gi"), (_, d, m) => (take(+d, MONTHS[m.toLowerCase()]), " "));
  rest = rest.replace(new RegExp(`(${MONTH_WORDS})\\s+(\\d{1,2})\\b`, "gi"), (_, m, d) => (take(+d, MONTHS[m.toLowerCase()]), " "));
  return { dates, rest };
}

const STOP_WORDS = new Set(["the", "this", "that", "what", "why", "was", "for", "and", "you", "your", "did", "charge", "charged", "fee", "fees", "pound", "pounds", "egp", "geneh"]);

function words(text) {
  return text.toLowerCase().split(/[^a-z0-9؀-ۿ]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

// Score one record against what the message mentions.
function score(record, wanted) {
  let points = 0;
  if (record.amount_egp !== undefined && wanted.amounts.includes(Math.abs(record.amount_egp))) points += 5;
  const date = record.date || record.submitted;
  if (date) {
    const [, month, day] = date.split("-").map(Number);
    if (wanted.dates.some((d) => d.day === day && d.month === month)) points += 4;
  }
  const merchant = (record.merchant || record.transaction_merchant || "").toLowerCase();
  const merchantWords = words(merchant);
  if (wanted.words.some((w) => merchantWords.includes(w))) points += 3;
  if (wanted.intent.startsWith("dispute.") && record.dispute_id) points += 4;
  if (wanted.intent.startsWith("card.") && record.card_id) points += 4;
  if (wanted.intent.startsWith("fee.") && record.category === "Fee") points += 1;
  if (wanted.intent === "fee.overdraft" && merchant.includes("overdraft")) points += 2;
  return points;
}

// The customer's own transactions, disputes and cards, ranked; only the top 3 go to the model.
function lookup(customerId, message, intent = "") {
  const transactions = readJson("transactions.json").filter((t) => t.customer_id === customerId);
  const merchantOf = Object.fromEntries(transactions.map((t) => [t.record_id, t.merchant]));
  const disputes = readJson("disputes.json")
    .filter((d) => d.customer_id === customerId)
    .map((d) => ({ ...d, transaction_merchant: merchantOf[d.transaction] }));
  const cards = readJson("cards.json").filter((c) => c.customer_id === customerId);

  const { dates, rest } = findDates(normalizeDigits(message));
  const wanted = {
    intent,
    dates,
    amounts: (rest.match(/\d+(?:\.\d+)?/g) || []).map(Number),
    words: words(rest),
  };

  const ranked = [...transactions, ...disputes, ...cards]
    .map((record) => ({ record, points: score(record, wanted) }))
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points || String(b.record.date || b.record.submitted || "").localeCompare(String(a.record.date || a.record.submitted || "")))
    .slice(0, 3)
    .map((r) => r.record);

  const idOf = (r) => r.record_id || r.dispute_id || r.card_id;
  return { records: ranked, retrieved_ids: ranked.map(idOf) };
}

// Notices from data/service-status.json that are happening now, or start later the same Cairo day.
// Expired notices are never passed on (evalset S6). `now` is { instant: Date, day: "YYYY-MM-DD" in Cairo }.
function liveNotices(now) {
  return readJson("service-status.json")
    .filter((n) => new Date(n.end) > now.instant)
    .map((n) => {
      const started = new Date(n.start) <= now.instant;
      return { ...n, happening: started ? "now" : "later today" };
    })
    .filter((n) => n.happening === "now" || n.start.slice(0, 10) === now.day);
}

module.exports = { lookup, liveNotices };

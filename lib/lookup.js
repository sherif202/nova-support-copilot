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
  // 1.0.13: a status question points at payments that aren't simply posted; a "waiting for money" question at money on its way.
  if (wanted.intent === "txn.status" && ["pending", "declined", "reversed", "refunded"].includes(record.status) && record.amount_egp < 0) points += 3;
  if (wanted.intent === "txn.incoming" && record.amount_egp > 0 && record.status === "pending") points += 3;
  if (wanted.intent === "txn.incoming" && record.amount_egp > 0 && record.status === "posted" && record.sender) points += 1;
  return points;
}

// Status facts the answer step needs for a pending, declined, reversed or refunded payment, or for money coming
// in (1.0.13): from data/transaction-details.json. Posted payments keep their record exactly as before. The
// sender's name is shared, never their account details (TXS-6.2); card digits and terminals stay out.
const STATUS_FIELDS = ["channel", "authorised_at", "sent_at", "posted_at", "decline_code", "available_balance_egp", "used_today_egp", "hold_reason", "expected_post", "sender", "reversed_at", "refund_id", "refund_of", "retry_of", "rule"];
let detailsCache = null;
function withStatusFacts(t) {
  detailsCache ||= fs.existsSync(path.join(DATA, "transaction-details.json")) ? readJson("transaction-details.json").details : {};
  const d = detailsCache[t.record_id];
  if (!d || (t.status === "posted" && !d.sender && !d.retry_of)) return t;
  const extra = Object.fromEntries(STATUS_FIELDS.filter((k) => d[k] !== undefined).map((k) => [k, d[k]]));
  return { ...t, ...extra };
}

// The logged-in customer's own transactions, disputes and cards. Nothing else is ever read.
function customerRecords(customerId) {
  const transactions = readJson("transactions.json").filter((t) => t.customer_id === customerId).map(withStatusFacts);
  const merchantOf = Object.fromEntries(transactions.map((t) => [t.record_id, t.merchant]));
  const disputes = readJson("disputes.json")
    .filter((d) => d.customer_id === customerId)
    .map((d) => ({ ...d, transaction_merchant: merchantOf[d.transaction] }));
  const cards = readJson("cards.json").filter((c) => c.customer_id === customerId);
  return { transactions, disputes, cards };
}

const idOf = (r) => r.record_id || r.dispute_id || r.card_id;

// What the message mentions: amounts, day and month, and words that might be a merchant.
function wantedFrom(message, intent) {
  const { dates, rest } = findDates(normalizeDigits(message));
  return { intent, dates, amounts: (rest.match(/\d+(?:\.\d+)?/g) || []).map(Number), words: words(rest) };
}

// The customer's own transactions, disputes and cards, ranked; only the top 3 go to the model.
// `pinnedId` (the record picker): the record the customer tapped goes first, with its linked records, so the
// answer is about exactly that one. It is used only if it belongs to this customer.
function lookup(customerId, message, intent = "", pinnedId = null) {
  const { transactions, disputes, cards } = customerRecords(customerId);
  const wanted = wantedFrom(message, intent);
  const byId = Object.fromEntries([...transactions, ...disputes, ...cards].map((r) => [idOf(r), r]));

  // Records that belong with a match: a dispute's transaction, a fee's linked transaction,
  // and the card a card fee is for (its product name is in the fee's merchant text).
  const linked = (r) => [
    r.transaction,
    r.linked_txn,
    ...(r.record_id ? transactions.filter((x) => x.retry_of === r.record_id).map((x) => x.record_id) : []),
    ...cards.filter((c) => r.merchant && r.merchant.toLowerCase().includes(c.product.toLowerCase())).map((c) => c.card_id),
  ].filter((id) => id && byId[id]);

  const matches = [...transactions, ...disputes, ...cards]
    .map((record) => ({ record, points: score(record, wanted) }))
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points || String(b.record.date || b.record.submitted || "").localeCompare(String(a.record.date || a.record.submitted || "")))
    .map((r) => r.record);

  // Each match is followed by the records linked to it; the top 3 go to the model.
  const pinned = pinnedId && byId[pinnedId] ? byId[pinnedId] : null;
  const ordered = [];
  for (const record of [...(pinned ? [pinned] : []), ...matches]) {
    for (const id of [idOf(record), ...linked(record)]) if (!ordered.includes(id)) ordered.push(id);
  }
  const ranked = ordered.slice(0, 3).map((id) => byId[id]);

  const all_ids = [...transactions, ...disputes, ...cards].map(idOf);
  return { records: ranked, retrieved_ids: ranked.map(idOf), all_ids, pinned: pinned ? pinnedId : null };
}

// Record picker, automatic: is the question too vague to know which record it is about? Vague = no amount, no
// date and no merchant the customer's records contain, while two or more records fit the question. Then the
// copilot asks "Which one do you mean?" instead of guessing. Code only; fraud never reaches this point.
function ambiguity(customerId, message, intent) {
  const { transactions, disputes, cards } = customerRecords(customerId);
  const wanted = wantedFrom(message, intent);
  // A merchant counts only if the customer names something specific: generic banking words that appear in fee
  // descriptions ("monthly account fee", "card yearly fee") don't say which record they mean.
  const GENERIC = new Set(["account", "monthly", "yearly", "balance", "under", "card", "nova", "debit", "credit", "bank", "payment", "purchase", "transaction", "money", "000"]);
  const merchantHit = [...transactions, ...disputes].some((r) => words(r.merchant || r.transaction_merchant || "").some((w) => !GENERIC.has(w) && wanted.words.includes(w)));
  if (wanted.amounts.length || wanted.dates.length || merchantHit) return { ambiguous: false };
  const newest = (a, b) => String(b.date || b.submitted || "").localeCompare(String(a.date || a.submitted || ""));
  let kind = null, candidates = [];
  if (intent === "fee.overdraft") { kind = "transactions"; candidates = transactions.filter((t) => /overdraft/i.test(t.merchant)); }
  else if (intent === "fee.explain") { kind = "transactions"; candidates = transactions.filter((t) => t.category === "Fee"); }
  else if (intent.startsWith("dispute.")) { kind = "disputes"; candidates = disputes; }
  else if (intent === "txn.status") { kind = "transactions"; candidates = transactions.filter((t) => t.amount_egp < 0 && ["pending", "declined", "reversed", "refunded"].includes(t.status)); }
  else if (intent === "txn.incoming") { kind = "transactions"; candidates = transactions.filter((t) => t.amount_egp > 0 && t.status === "pending"); }
  // A damaged card gets the same answer (fee, delivery time) whichever card it is, so no need to ask.
  else if (intent.startsWith("card.") && intent !== "card.replace_damaged") { kind = "cards"; candidates = cards; }
  if (candidates.length < 2) return { ambiguous: false };
  return { ambiguous: true, kind, ids: candidates.slice().sort(newest).slice(0, 3).map(idOf) };
}

// Does this record belong to this customer? (A tapped record ID from the browser is checked before use.)
function ownsRecord(customerId, recordId) {
  const { transactions, disputes, cards } = customerRecords(customerId);
  return [...transactions, ...disputes, ...cards].some((r) => idOf(r) === recordId);
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

module.exports = { lookup, liveNotices, ambiguity, ownsRecord, customerRecords, findDates, normalizeDigits };

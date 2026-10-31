// Record picker (Stage 6, Human Agency): the logged-in customer's own transactions, cards and disputes as
// tap-able cards, so they can point at exactly what they mean. Built in code from data/ only, never by a model,
// in English and Arabic. The facts that tell records apart are marked "bold". Card numbers: last 4 digits only.

const { customerRecords } = require("./lookup");

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const day = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { en: `${d} ${MONTHS_EN[m - 1]}${y !== 2026 ? ` ${y}` : ""}`, ar: `${d} ${MONTHS_AR[m - 1]}${y !== 2026 ? ` ${y}` : ""}` };
};
const month = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return { en: `${MONTHS_EN[m - 1]} ${y}`, ar: `${MONTHS_AR[m - 1]} ${y}` };
};
const money = (n) => {
  const v = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return { en: `EGP ${v}`, ar: `${v} جنيه` };
};
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const TAGS = {
  Fee: { en: "Fee", ar: "رسوم" },
  Cash: { en: "ATM / cash", ar: "سحب نقدي" },
  Income: { en: "Money in", ar: "فلوس داخلة" },
  Transfer: { en: "Transfer", ar: "تحويل" },
};
const PURCHASE = { en: "Purchase", ar: "شراء" };
const STATUS = { pending: { en: "Pending", ar: "لسه معلّقة" }, disputed: { en: "Disputed", ar: "عليها اعتراض" } };

function transactionItem(t, byId) {
  const linked = t.linked_txn && byId[t.linked_txn];
  const meta = [];
  if (STATUS[t.status]) meta.push(STATUS[t.status]);
  if (linked) {
    const d = day(linked.date);
    meta.push({ en: `fee for "${linked.merchant}" on ${d.en}`, ar: `رسوم على "${linked.merchant}" يوم ${d.ar}` });
  }
  return {
    id: t.record_id,
    kind: "transaction",
    bold: [money(t.amount_egp), day(t.date)],
    title: { en: t.merchant, ar: t.merchant },
    tag: TAGS[t.category] || PURCHASE,
    meta,
    is_fee: t.category === "Fee",
    // The question a tap on this card asks, for a fee: overdraft or any other fee.
    intent: t.category === "Fee" ? (/overdraft/i.test(t.merchant) ? "fee.overdraft" : "fee.explain") : null,
  };
}

function cardItem(c) {
  const r = c.renewal || {};
  let status;
  if (c.status === "blocked") status = { en: `Blocked${c.blocked_reason ? `: ${c.blocked_reason}` : ""}${c.blocked_on ? ` on ${day(c.blocked_on).en}` : ""}`, ar: `متوقف${c.blocked_on ? ` من ${day(c.blocked_on).ar}` : ""}` };
  else if (c.status === "replacement_in_transit") status = { en: `New card on its way${r.expected_by ? `, expected by ${day(r.expected_by).en}` : ""}`, ar: `الكارت الجديد في الطريق${r.expected_by ? `، متوقع يوصل ${day(r.expected_by).ar}` : ""}` };
  else if (r.type === "expiry" && r.dispatch_date) status = { en: `Renewal card: sent ${day(r.dispatch_date).en}${r.delivered ? `, delivered ${day(r.delivered).en}` : ""}`, ar: `كارت التجديد: اتبعت ${day(r.dispatch_date).ar}${r.delivered ? `، ووصل ${day(r.delivered).ar}` : ""}` };
  else status = { en: "Active", ar: "شغال" };
  return {
    id: c.card_id,
    kind: "card",
    bold: [{ en: c.product, ar: c.product }, { en: `•••• ${c.last4}`, ar: `•••• ${c.last4}` }],
    title: status,
    tag: { en: `Expires ${month(c.expiry).en}`, ar: `بينتهي ${month(c.expiry).ar}` },
    meta: [],
    status: c.status,
    on_its_way: c.status === "replacement_in_transit" || (r.type === "expiry" && Boolean(r.dispatch_date) && !r.delivered),
  };
}

const STAGES_AR = { Submitted: "اتقدّم", "Under review": "تحت المراجعة", "Waiting for merchant": "مستنيين التاجر", Decision: "القرار", Closed: "اتقفل" };

function disputeItem(d) {
  const meta = [];
  // DSP-3: a decision is targeted within 45 days of receipt; card-network cases can take up to 90 days.
  if (d.stage !== "Closed" && d.receipt_confirmed) {
    const due = day(addDays(d.receipt_confirmed, d.card_network ? 90 : 45));
    meta.push({ en: `Decision target: ${due.en}`, ar: `القرار المتوقع: ${due.ar}` });
  }
  if (d.missing_documents && d.missing_documents.length) meta.push({ en: `Missing: ${d.missing_documents.join(", ")}`, ar: `ناقص: ${d.missing_documents.join("، ")}` });
  return {
    id: d.dispute_id,
    kind: "dispute",
    bold: [{ en: d.dispute_id, ar: d.dispute_id }, money(d.amount_egp)],
    title: { en: d.transaction_merchant || "", ar: d.transaction_merchant || "" },
    tag: { en: d.stage, ar: STAGES_AR[d.stage] || d.stage },
    meta,
  };
}

const newest = (a, b) => String(b.date || b.submitted || "").localeCompare(String(a.date || a.submitted || ""));

// One kind of record for the picker, newest first. Transactions come 5 at a time ("Show more").
function listRecords(customerId, kind, offset = 0, limit = 5) {
  const { transactions, disputes, cards } = customerRecords(customerId);
  const byId = Object.fromEntries(transactions.map((t) => [t.record_id, t]));
  let items;
  if (kind === "transactions") items = transactions.slice().sort(newest).map((t) => transactionItem(t, byId));
  else if (kind === "cards") items = cards.map(cardItem);
  else if (kind === "disputes") items = disputes.slice().sort(newest).map(disputeItem);
  else return { kind, items: [], total: 0, more: false };
  const page = kind === "transactions" ? items.slice(offset, offset + limit) : items;
  return { kind, items: page, total: items.length, more: kind === "transactions" && offset + limit < items.length };
}

// The picker cards for specific record IDs (the automatic "Which one do you mean?").
function itemsFor(customerId, ids) {
  const { transactions, disputes, cards } = customerRecords(customerId);
  const byId = Object.fromEntries(transactions.map((t) => [t.record_id, t]));
  return ids.map((id) => {
    const t = byId[id];
    if (t) return transactionItem(t, byId);
    const c = cards.find((x) => x.card_id === id);
    if (c) return cardItem(c);
    const d = disputes.find((x) => x.dispute_id === id);
    return d ? disputeItem(d) : null;
  }).filter(Boolean);
}

module.exports = { listRecords, itemsFor };

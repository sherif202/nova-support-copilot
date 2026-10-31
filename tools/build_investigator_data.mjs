// Synthetic data for the transaction investigator (1.0.13, docs/INVESTIGATOR.md). Same output every run.
//
// 1. data/transactions.json gets a few new records (pending, declined, reversed, refunded, money coming in) for
//    five demo customers the eval set never uses (C-0003, C-0005, C-0009, C-0010, C-0017), so the eval results
//    can't change. Records this script added before are replaced, never duplicated.
// 2. data/transaction-details.json holds the extra facts for every transaction (authorised and posted times,
//    channel, area, terminal or website, card last 4, decline code, hold reason, expected date, sender name).
//    Only the investigator reads it; the AI prompts see the same records as before.
//
//   node tools/build_investigator_data.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = (f) => path.join(ROOT, "data", f);
const read = (f) => JSON.parse(fs.readFileSync(file(f), "utf8"));
const cards = read("cards.json");
const lastFour = (customer) => (cards.find((c) => c.customer_id === customer && c.status === "active") || cards.find((c) => c.customer_id === customer) || {}).last4 || null;

// The new records. `d` holds the details that go to the side file.
const NEW = [
  // C-0010 Karim Zaki (English): hotel hold, online decline, InstaPay under review, a reversed trip
  { r: { record_id: "TXN-2026-10-29-0901", customer_id: "C-0010", date: "2026-10-29", merchant: "Hilton Cairo Heliopolis", amount_egp: -4200, category: "Travel", status: "pending" },
    d: { channel: "card_in_store", area: "Heliopolis, Cairo", terminal: "POS 2218", authorised_at: "2026-10-29T15:10", hold_reason: "hotel_hold", expected_post: "2026-11-12", rule: "TXS-1.2" } },
  { r: { record_id: "TXN-2026-10-30-0902", customer_id: "C-0010", date: "2026-10-30", merchant: "Amazon.eg", amount_egp: -1250, category: "Shopping", status: "declined" },
    d: { channel: "online", area: "Online", terminal: "amazon.eg", authorised_at: "2026-10-30T22:47", decline_code: "online_security_check", rule: "TXS-2.5" } },
  { r: { record_id: "TXN-2026-10-30-0903", customer_id: "C-0010", date: "2026-10-30", merchant: "InstaPay from Ahmed Hassan", amount_egp: 2000, category: "Transfer", status: "pending" },
    d: { channel: "instapay", sender: "Ahmed Hassan", sent_at: "2026-10-30T23:55", hold_reason: "new_sender_review", expected_post: "2026-10-31T12:00", rule: "TXS-4.1" } },
  { r: { record_id: "TXN-2026-10-27-0904", customer_id: "C-0010", date: "2026-10-27", merchant: "Uber", amount_egp: -180, category: "Transport", status: "reversed" },
    d: { channel: "online", area: "Alexandria", terminal: "uber.com", authorised_at: "2026-10-27T08:15", reversed_at: "2026-10-28T09:00", rule: "TXS-5.1" } },
  // C-0003 Mariam Hassan (English): ATM daily limit after an earlier withdrawal, salary on its way
  { r: { record_id: "TXN-2026-10-29-0906", customer_id: "C-0003", date: "2026-10-29", merchant: "ATM withdrawal, Nova ATM Nasr City", amount_egp: -15000, category: "Cash", status: "posted" },
    d: { channel: "atm", area: "Nasr City, Cairo", terminal: "Nova ATM 0417", authorised_at: "2026-10-29T09:05" } },
  { r: { record_id: "TXN-2026-10-29-0905", customer_id: "C-0003", date: "2026-10-29", merchant: "ATM withdrawal, Banque Misr ATM Nasr City", amount_egp: -10000, category: "Cash", status: "declined" },
    d: { channel: "atm", area: "Nasr City, Cairo", terminal: "Banque Misr ATM 2290", authorised_at: "2026-10-29T17:40", decline_code: "daily_limit", used_today_egp: 15000, rule: "TXS-2.2" } },
  { r: { record_id: "TXN-2026-11-01-0907", customer_id: "C-0003", date: "2026-11-01", merchant: "Salary payment, Delta Logistics", amount_egp: 18500, category: "Income", status: "pending" },
    d: { channel: "bank_transfer", sender: "Delta Logistics (payroll)", sent_at: "2026-10-30T11:00", hold_reason: "payroll_date", expected_post: "2026-11-01T10:00", rule: "TXS-4.3" } },
  // C-0005 Omar Farouk (Arabic): declined for balance, money in, the retry works; an international transfer
  { r: { record_id: "TXN-2026-10-30-0908", customer_id: "C-0005", date: "2026-10-30", merchant: "Carrefour Maadi", amount_egp: -1450, category: "Groceries", status: "declined" },
    d: { channel: "card_in_store", area: "Maadi, Cairo", terminal: "POS 7712", authorised_at: "2026-10-30T18:42", decline_code: "insufficient_balance", available_balance_egp: 980, rule: "TXS-2.1" } },
  { r: { record_id: "TXN-2026-10-30-0909", customer_id: "C-0005", date: "2026-10-30", merchant: "InstaPay from Mona Adel", amount_egp: 3000, category: "Transfer", status: "posted" },
    d: { channel: "instapay", sender: "Mona Adel", sent_at: "2026-10-30T20:10", posted_at: "2026-10-30T20:10" } },
  { r: { record_id: "TXN-2026-10-30-0910", customer_id: "C-0005", date: "2026-10-30", merchant: "Carrefour Maadi", amount_egp: -1450, category: "Groceries", status: "posted" },
    d: { channel: "card_in_store", area: "Maadi, Cairo", terminal: "POS 7712", authorised_at: "2026-10-30T20:31", retry_of: "TXN-2026-10-30-0908" } },
  { r: { record_id: "TXN-2026-10-28-0911", customer_id: "C-0005", date: "2026-10-28", merchant: "International transfer from Karim Fathy", amount_egp: 12000, category: "Transfer", status: "pending" },
    d: { channel: "international", sender: "Karim Fathy", sent_at: "2026-10-28T13:00", hold_reason: "international_transfer", expected_post: "2026-11-04", rule: "TXS-4.4" } },
  // C-0009 Yasmine Mostafa (Arabic): a refund on its way, a wrong-PIN decline
  { r: { record_id: "TXN-2026-10-20-0912", customer_id: "C-0009", date: "2026-10-20", merchant: "Jumia", amount_egp: -899, category: "Shopping", status: "refunded" },
    d: { channel: "online", area: "Online", terminal: "jumia.com.eg", authorised_at: "2026-10-19T21:05", posted_at: "2026-10-20T10:00", refund_id: "TXN-2026-10-28-0913", rule: "TXS-5.2" } },
  { r: { record_id: "TXN-2026-10-28-0913", customer_id: "C-0009", date: "2026-10-28", merchant: "Refund from Jumia", amount_egp: 899, category: "Transfer", status: "pending" },
    d: { channel: "refund", sender: "Jumia", sent_at: "2026-10-28T12:00", hold_reason: "merchant_refund", expected_post: "2026-11-11", refund_of: "TXN-2026-10-20-0912", rule: "TXS-5.2" } },
  { r: { record_id: "TXN-2026-10-31-0914", customer_id: "C-0009", date: "2026-10-31", merchant: "Seoudi Market Zamalek", amount_egp: -640, category: "Groceries", status: "declined" },
    d: { channel: "card_in_store", area: "Zamalek, Cairo", terminal: "POS 3305", authorised_at: "2026-10-31T11:20", decline_code: "pin_tries", rule: "TXS-2.4" } },
  // C-0017 Heba Taha (Arabic): a transfer sent after the cut-off before the weekend, a standing order
  { r: { record_id: "TXN-2026-10-29-0915", customer_id: "C-0017", date: "2026-10-29", merchant: "Bank transfer from Hany Mostafa", amount_egp: 1500, category: "Transfer", status: "pending" },
    d: { channel: "bank_transfer", sender: "Hany Mostafa", sent_at: "2026-10-29T16:20", hold_reason: "after_cutoff", expected_post: "2026-11-01", rule: "TXS-4.2" } },
  { r: { record_id: "TXN-2026-10-01-0916", customer_id: "C-0017", date: "2026-10-01", merchant: "Standing order: rent, Alexandria", amount_egp: -6000, category: "Bills", status: "posted" },
    d: { channel: "standing_order", area: "Alexandria", authorised_at: "2026-10-01T07:00" } },
];

// Details for the existing records, derived from what each record already says.
const ONLINE = /noon|amazon|jumia|talabat|careem|uber|breadfast|booking|aliexpress|netflix|spotify|apple|google|\.eg|\.com/i;
const AREAS = ["Maadi", "Zamalek", "Heliopolis", "Nasr City", "Sheikh Zayed", "New Cairo", "Dokki", "Mohandessin", "City Stars", "Mall of Egypt", "Hurghada", "Alexandria", "Smouha", "Giza", "6th of October"];
const hash = (s) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
function derived(t) {
  const h = hash(t.record_id);
  const time = `${String(8 + (h % 13)).padStart(2, "0")}:${String((h >>> 4) % 60).padStart(2, "0")}`;
  let channel = "card_in_store";
  if (t.category === "Cash") channel = "atm";
  else if (t.category === "Income") channel = "bank_transfer";
  else if (t.category === "Transfer") channel = /instapay/i.test(t.merchant) ? "instapay" : "bank_transfer";
  else if (t.category === "Fee") channel = "fee";
  else if (/standing order/i.test(t.merchant)) channel = "standing_order";
  else if (ONLINE.test(t.merchant)) channel = "online";
  const area = AREAS.find((a) => t.merchant.includes(a));
  const d = { channel, authorised_at: `${t.date}T${time}` };
  if (area) d.area = area;
  if (channel === "online") d.terminal = (t.merchant.match(/[A-Za-z]+\.(?:eg|com)/) || [`${t.merchant.toLowerCase().replace(/[^a-z]/g, "")}.com`])[0];
  if (channel === "card_in_store" || channel === "atm") d.terminal = `${channel === "atm" ? "ATM" : "POS"} ${1000 + (h % 9000)}`;
  if (t.status === "posted" && ["card_in_store", "online"].includes(channel)) d.posted_at = `${t.date}T23:59`;
  if (t.status === "pending" && ["card_in_store", "online"].includes(channel)) { d.hold_reason = /hotel|car hire|fuel/i.test(t.merchant) ? "hotel_hold" : "card_hold"; d.rule = "TXS-1.1"; }
  return d;
}

const ids = new Set(NEW.map((n) => n.r.record_id));
const transactions = read("transactions.json").filter((t) => !ids.has(t.record_id));
transactions.push(...NEW.map((n) => n.r));
fs.writeFileSync(file("transactions.json"), JSON.stringify(transactions, null, 2) + "\n");

const details = {};
for (const t of transactions) {
  const extra = (NEW.find((n) => n.r.record_id === t.record_id) || {}).d;
  details[t.record_id] = { ...derived(t), ...(extra || {}) };
  const card = ["card_in_store", "online", "atm"].includes(details[t.record_id].channel) ? lastFour(t.customer_id) : null;
  if (card) details[t.record_id].card_last4 = card;
}
fs.writeFileSync(file("transaction-details.json"), JSON.stringify({ what: "Synthetic extra facts per transaction for the transaction investigator (tools/build_investigator_data.mjs). Not read by the AI prompts.", details }, null, 1) + "\n");
console.log(`transactions ${transactions.length} (${NEW.length} investigator records), details ${Object.keys(details).length}`);

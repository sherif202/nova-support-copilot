// Regenerates data/tickets-labelled.csv so every ticket matches the customer records (Stage 7 follow-up).
// The Stage 2 generator (kit: 3-data-generator/build_tickets.py) picked customers, amounts and merchants at
// random, so many tickets asked about charges or disputes that customer doesn't have. This script keeps each
// ticket's id, intent, language, priority, queue, minutes and double labels exactly, finds the build_tickets.py
// template its message came from, and refills that template from one customer's real records:
//   fee questions     -> a fee that customer was charged (amount and day), overdraft only for fee.overdraft
//   dispute questions -> a customer with a dispute, and that dispute's merchant
//   unknown payments  -> a real purchase of that customer
//   card questions    -> a customer with a working card
// Every ticket also gets asked_at, the time the customer asked, so the shadow run pins "now" and maintenance
// answers don't depend on the wall clock. Same seed, same output.
//
//   node tools/build_linked_tickets.mjs     (reads the Stage 2 tickets from git, commit c7d86ed; SOURCE_REF to change)
//
// Label rule (owner decision, 30 Oct): an unexplained EGP 50 is the overdraft fee, so a fee question about 50 with
// no other fee named is labelled fee.overdraft, as in eval case 2 and the 1.0.2 taxonomy trap row.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));
const customers = read("customers.json").map((c) => c.customer_id);
const txns = read("transactions.json").filter((t) => !/^SYSTEM NOTE/i.test(t.merchant)); // the injection record is a red-team case, never a ticket
const disputes = read("disputes.json");
const cards = read("cards.json");

// Seeded random numbers (mulberry32), so the file is reproducible.
let seed = 4471;
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (list) => list[Math.floor(rand() * list.length)];

// --- the old file and its CSV format ---
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return { head, rows: body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) };
}
const cell = (v) => (/[",\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

const oldText = execSync(`git show ${process.env.SOURCE_REF || "c7d86ed"}:data/tickets-labelled.csv`, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 }).replace(/^﻿/, "");
const { head, rows } = parseCsv(oldText);

// --- the build_tickets.py templates for the intents whose wording carries record details ---
const T = {
  "fee.explain": [
    "eh el {a} geneh elly et5asamo mny yom {d}?", "3ayez a3raf el masareef di bta3et eh, {a} geneh", "leh et5asam {a} geneh mn 7esaby??",
    "ايه الـ {a} جنيه اللي اتخصموا مني؟", "في خصم {a} جنيه مش فاهمه، ده إيه؟", "ليه الحساب اتخصم منه رسوم {a} جنيه يوم {d}",
    "What is this {a} EGP charge on my statement?", "why did u take {a} pounds from my account", "There's a fee of {a} I don't understand, can you explain?"],
  "fee.waiver_request": ["momken tsheelo el {a} geneh di?", "رجعولي الـ {a} جنيه من فضلك", "Please waive the {a} fee, it's not fair", "refund the overdraft fee please"],
  "dispute.status": ["el e3terad bta3y 3ala {m} wesel le fein?", "الاعتراض بتاعي على {m} وصل لفين؟", "Any update on my dispute with {m}?", "will i get my money back from the {m} dispute"],
  "dispute.documents": ["do I need a police report for a {a} pound dispute"],
  "dispute.open_request": ["3ayez a3mel e3terad 3ala {m}, et5asam mny marten", "عايز أفتح اعتراض على عملية {m}", "I want to dispute a double charge from {m}"],
  "fraud.unknown_txn": ["msh ana elly 3amalt el {a} geneh di", "fi 3amalia {m} ana ma3amaltehash", "في عملية {m} أنا معملتهاش", "I don't recognise a payment to {m}"],
};
const SUFFIXES = [" ??", " pls", " 🙏", " بسرعة لو سمحت", " asap"];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => s.toLowerCase().replace(/3ayz/g, "3ayez").replace(/leeh/g, "leh");

// Which template made this message, and with which roughening (lower case, suffix)?
function findTemplate(intent, message) {
  const suffix = SUFFIXES.find((s) => message.endsWith(s)) || "";
  const core = norm(suffix ? message.slice(0, -suffix.length) : message);
  for (const tpl of T[intent] || []) {
    const parts = norm(tpl).split(/\{[adm]\}/);
    const re = new RegExp("^" + parts.map(esc).join("(.+?)") + "$");
    if (re.test(core)) return { tpl, suffix };
  }
  return null;
}

// --- record pools ---
const amount = (t) => { const a = Math.abs(t.amount_egp); return Number.isInteger(a) ? String(a) : a.toFixed(2); };
const dayOf = (t) => { const [, m, d] = t.date.split("-").map(Number); return `${d}/${m}`; };
const shortMerchant = (m) => m.replace(/\s*\((EUR|USD)\)$/, "").replace(/, .*$/, "");
const isFee = (t) => t.category === "Fee" || /yearly fee|replacement|Express card/i.test(t.merchant);
const overdraftFees = txns.filter((t) => /overdraft/i.test(t.merchant));
const otherFees = txns.filter((t) => isFee(t) && !/overdraft/i.test(t.merchant));
const purchases = txns.filter((t) => t.amount_egp < 0 && !isFee(t) && t.category !== "Transfer" && !/transfer|ATM withdrawal|cash/i.test(t.merchant));
const disputeMerchant = (d) => { const t = read("transactions.json").find((x) => x.record_id === d.transaction); return t ? shortMerchant(t.merchant) : null; };
const okCard = (c) => c.status === "active" && !(c.renewal && c.renewal.type === "expiry" && c.renewal.delivered === null);
const cardCustomers = [...new Set(cards.filter(okCard).map((c) => c.customer_id))];
const soonExpiring = [...new Set(cards.filter((c) => okCard(c) && c.expiry <= "2027-06").map((c) => c.customer_id))];

// Spread the tickets over many customers: prefer the least-used customer in a pool.
const used = new Map();
function leastUsed(list, key = (x) => x) {
  const min = Math.min(...list.map((x) => used.get(key(x)) || 0));
  const choice = pick(list.filter((x) => (used.get(key(x)) || 0) === min));
  used.set(key(choice), (used.get(key(choice)) || 0) + 1);
  return choice;
}

// --- the times the customers asked ---
const EVAL_DAY = "2026-10-30"; // the fixed eval day for everything except maintenance questions
function askedAtFor(intent, message) {
  if (intent === "service.status") {
    if (/declined abroad/i.test(message)) return "2026-10-31T02:30:00+02:00";            // during ANN-2026-10-31-01
    if (/naharda|النهارده/i.test(message)) return "2026-10-29T14:00:00+02:00";          // maintenance later that day
    return "2026-10-29T20:15:00+02:00";                                                  // during ANN-2026-10-29-01
  }
  const minutes = 8 * 60 + Math.floor(rand() * 10 * 60); // 08:00 to 18:00 Cairo
  return `${EVAL_DAY}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00+02:00`;
}

const unmatched = [];
const relabelled = [];
const out = rows.map((r) => {
  const found = findTemplate(r.intent, r.message);
  let customer, message = r.message, fill = null;
  switch (r.intent) {
    case "fee.explain": { const t = leastUsed(otherFees, (x) => x.customer_id); customer = t.customer_id; fill = { a: amount(t), d: dayOf(t) }; break; }
    case "fee.overdraft": { customer = leastUsed(overdraftFees, (x) => x.customer_id).customer_id; break; }
    case "fee.waiver_request": {
      const pool = found && /overdraft/.test(found.tpl) ? overdraftFees : otherFees;
      const t = leastUsed(pool, (x) => x.customer_id); customer = t.customer_id; fill = { a: amount(t) }; break;
    }
    case "dispute.status": case "dispute.documents": {
      const big = found && /police report/.test(found.tpl);
      const d = leastUsed(big ? disputes.filter((x) => x.amount_egp >= 5000) : disputes, (x) => x.customer_id);
      customer = d.customer_id; fill = { m: disputeMerchant(d), a: String(d.amount_egp) }; break;
    }
    case "dispute.open_request": case "fraud.unknown_txn": {
      const t = leastUsed(purchases, (x) => x.customer_id); customer = t.customer_id; fill = { a: amount(t), m: shortMerchant(t.merchant) }; break;
    }
    case "card.replace_damaged": customer = leastUsed(cardCustomers); break;
    case "card.replace_expired": customer = leastUsed(soonExpiring.length >= 5 ? soonExpiring : cardCustomers); break;
    default: customer = leastUsed(customers);
  }
  if (T[r.intent] && /\{[adm]\}|7000/.test(r.message + (found ? found.tpl : ""))) {
    if (found && fill) {
      message = found.tpl.replace("{a}", fill.a).replace("{d}", fill.d).replace("{m}", fill.m);
      if (r.message === r.message.toLowerCase() && found.tpl !== found.tpl.toLowerCase() && /[A-Za-z]/.test(found.tpl)) message = message.toLowerCase();
      if (/3ayz/.test(r.message)) message = message.replace(/3ayez/g, "3ayz");
      if (/leeh/.test(r.message)) message = message.replace(/\bleh\b/g, "leeh");
      message += found.suffix;
    } else if (!found && /\d|[A-Z][a-z]+\.?/.test(r.message) && T[r.intent].some((t) => /\{/.test(t))) unmatched.push(`${r.ticket_id} ${r.intent}: ${r.message}`);
  }
  if (r.intent === "dispute.documents" && /7000/.test(r.message)) message = r.message.replace("7000", fill.a);
  const askedAt = askedAtFor(r.intent, message);
  // Unexplained EGP 50 = overdraft (see the label rule at the top).
  if (["fee.explain", "fee.overdraft"].includes(r.intent) && /(^|[^\d.])50([^\d.]|$)/.test(message) && !/atm|statement|transfer|card|abroad|ماكينة|كشف|تحويل|كارت/i.test(message)) {
    if (r.intent !== "fee.overdraft") relabelled.push(r.ticket_id);
    r = { ...r, intent: "fee.overdraft", labeller_a_intent: "fee.overdraft" };
  }
  return { ...r, customer_id: customer, message, received_at: askedAt.slice(0, 16).replace("T", " "), asked_at: askedAt, source: "synthetic; labels simulated; linked to customer records" };
});

const cols = [...head, "asked_at"];
fs.writeFileSync(path.join(ROOT, "data", "tickets-labelled.csv"), "﻿" + [cols.join(","), ...out.map((r) => cols.map((c) => cell(r[c] ?? "")).join(","))].join("\r\n") + "\r\n");

const langs = {};
out.forEach((r) => (langs[r.language] = (langs[r.language] || 0) + 1));
const changed = out.filter((r, i) => r.message !== rows[i].message).length;
console.log(`tickets ${out.length}, messages refilled ${changed}, customers used ${new Set(out.map((r) => r.customer_id)).size}`);
console.log("languages", langs, "queues", out.reduce((a, r) => ((a[r.queue] = (a[r.queue] || 0) + 1), a), {}));
console.log(`relabelled fee.explain -> fee.overdraft (unexplained EGP 50): ${relabelled.length}${relabelled.length ? " " + relabelled.join(", ") : ""}`);
if (unmatched.length) console.log("not matched to a template (kept as written):\n  " + unmatched.join("\n  "));

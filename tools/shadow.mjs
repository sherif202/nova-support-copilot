// Lifecycle stage 7, shadow mode: run the 200 labelled contact-center tickets (data/tickets-labelled.csv)
// through the copilot. Nobody sees its answers; the script compares each route with how an agent actually
// handled the ticket and reports how many the copilot would have resolved, where it went wrong, the agent
// minutes it would have saved, and what it cost.
//
//   Start the app first:  ALLOW_TEST_NOW=true node server.js   (so each ticket is asked at its asked_at time)
//   Then:                 node tools/shadow.mjs [--limit 50]
// Costs about US$0.0003 per ticket on Claude Haiku 5.5 (about US$0.06 for all 200).
// The app's rate limit is 20 messages a minute per customer; the script paces each customer under it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.EVAL_URL || "http://localhost:3000";
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

// A small CSV reader for this file: quoted fields may hold commas.
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
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const tickets = parseCsv(fs.readFileSync(path.join(ROOT, "data", "tickets-labelled.csv"), "utf8").replace(/^﻿/, "")).slice(0, LIMIT);
const sent = new Map();
async function pace(customerId) {
  const times = (sent.get(customerId) || []).filter((t) => Date.now() - t < 60000);
  if (times.length >= 18) await new Promise((r) => setTimeout(r, 60000 - (Date.now() - times[0]) + 200));
  sent.set(customerId, [...times, Date.now()]);
}

const started = new Date();
const results = [];
console.log(`Shadow run: ${tickets.length} labelled tickets against ${BASE} ...`);
for (const t of tickets) {
  await pace(t.customer_id);
  const res = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: t.customer_id, message: t.message, testNow: t.asked_at || undefined }) });
  const r = await res.json();
  const copilotAnswered = r.action === "answer" && !r.reply_id;
  const agentSaysCopilot = t.queue === "Copilot";
  results.push({
    ticket: t.ticket_id, asked_at: t.asked_at, reason: r.reply_id || null, language: t.language, expected_intent: t.intent, expected_priority: t.priority, expected_queue: t.queue,
    intent: r.intent, priority: r.priority, action: r.action, queue: r.queue || (copilotAnswered ? "Copilot" : null),
    intent_ok: r.intent === t.intent, priority_ok: r.priority === t.priority,
    would_resolve: copilotAnswered && agentSaysCopilot && r.intent === t.intent,
    answered_out_of_scope: copilotAnswered && !agentSaysCopilot,
    fraud_missed: t.priority === "P0" && r.queue !== "Fraud",
    minutes: Number(t.resolution_minutes) || 0,
  });
  process.stdout.write(".");
}
console.log(" done.\n");

const n = results.length;
const count = (f) => results.filter(f).length;
const resolved = results.filter((x) => x.would_resolve);
const byLang = {};
for (const x of results) {
  const l = (byLang[x.language] ||= { n: 0, intent: 0, resolved: 0 });
  l.n += 1;
  if (x.intent_ok) l.intent += 1;
  if (x.would_resolve) l.resolved += 1;
}
const logText = fs.existsSync(path.join(ROOT, "logs", "messages.jsonl")) ? fs.readFileSync(path.join(ROOT, "logs", "messages.jsonl"), "utf8") : "";
const usd = logText.split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((t) => new Date(t.time) >= started).reduce((a, t) => a + (t.cost_usd || 0), 0);

const summary = {
  time: started.toISOString(),
  tickets: n,
  intent_accuracy: count((x) => x.intent_ok) / n,
  priority_accuracy: count((x) => x.priority_ok) / n,
  copilot_would_resolve: resolved.length,
  copilot_would_resolve_share: resolved.length / n,
  agent_minutes_saved: resolved.reduce((a, x) => a + x.minutes, 0),
  answered_but_agent_needed: count((x) => x.answered_out_of_scope),
  fraud_tickets: count((x) => x.expected_priority === "P0"),
  fraud_missed: count((x) => x.fraud_missed),
  by_language: byLang,
  total_usd: usd,
};
console.log(`Intent accuracy ${(summary.intent_accuracy * 100).toFixed(1)}%, priority ${(summary.priority_accuracy * 100).toFixed(1)}%`);
console.log(`Would have resolved ${resolved.length}/${n} (${(summary.copilot_would_resolve_share * 100).toFixed(1)}%), saving ${summary.agent_minutes_saved} agent minutes`);
console.log(`Answered where an agent was needed: ${summary.answered_but_agent_needed}. Fraud tickets missed: ${summary.fraud_missed}/${summary.fraud_tickets}`);
console.log(`Cost US$${usd.toFixed(4)}`);
for (const [l, v] of Object.entries(byLang)) console.log(`  ${l}: ${v.n} tickets, intent ${(v.intent / v.n * 100).toFixed(1)}%, resolved ${v.resolved}`);
const out = path.join(ROOT, "logs", `shadow-${started.toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(out, JSON.stringify({ summary, results }, null, 2));
console.log(`Saved ${path.relative(ROOT, out)}`);

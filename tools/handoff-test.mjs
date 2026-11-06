// Unnecessary-handoff test (1.0.14): does the copilot answer or clarify what it can, on phrasing it has never seen?
// "fresh" is the honest score; "dev" guided the fixes. Each follow-up pair shares one chat. Controls must reach a person.
//
//   Start the app with ALLOW_TEST_NOW=true, then: node tools/handoff-test.mjs dev|fresh|fresh2     (about US$0.02)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.EVAL_URL || "http://localhost:3000";
const NOW = "2026-10-31T13:00:00+02:00";
const which = process.argv[2] || "fresh";
const set = JSON.parse(fs.readFileSync(path.join(ROOT, "knowledge", "handoff-set.json"), "utf8"))[which];
const seen = fs.readFileSync(path.join(ROOT, "knowledge", "examples.jsonl"), "utf8") + fs.readFileSync(path.join(ROOT, "data", "tickets-labelled.csv"), "utf8");
const copied = set.filter(([, , m]) => seen.includes(m)).length;

const results = [];
let chat = 0;
for (const [kind, customerId, message] of set) {
  if (kind !== "followup-2") chat += 1;
  const r = await (await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId, message, testNow: NOW, sessionId: `${which}-${chat}` }) })).json();
  const human = r.action === "handoff";
  const ok = kind === "control-fraud" ? r.queue === "Fraud" : kind === "control-person" ? human : !human;
  results.push({ kind, customerId, message, ok, action: r.action, reply_id: r.reply_id || null, intent: r.intent, confidence: r.confidence, sources: r.sources || [], answer: r.answer_text });
  console.log(`${ok ? "ok  " : "MISS"} ${kind} ${customerId} ${r.action} ${r.reply_id || ""} ${r.intent} ${r.confidence} | ${message.slice(0, 60)}`);
}
const normal = results.filter((r) => !r.kind.startsWith("control"));
const controls = results.filter((r) => r.kind.startsWith("control"));
const needless = normal.filter((r) => !r.ok).length;
console.log(`\n${which}: unnecessary handoffs ${needless}/${normal.length} (${Math.round((needless / normal.length) * 100)}%), target 20% or less; controls ${controls.filter((r) => r.ok).length}/${controls.length}; copied from examples or tickets ${copied}`);
fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "logs", `handoff-${which}.json`), JSON.stringify(results, null, 1));

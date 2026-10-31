// Builds data/roi-sample.json, the demo data for the ROI section of the PM panel, from the archived 1.0.11
// shadow run (200 linked tickets, real token counts and costs from that run). One record per model request, in
// the same shape the turn log now writes (request-level cost attribution), with no message text.
// "verified_resolved" is the shadow run's "would have resolved": nobody clicked "Did this solve it?" in a shadow
// run, so it stands in for the customer's answer. "time" is the ticket's original Stage 2 received date (commit
// c7d86ed), so the demand trend has eight weeks to show. Everything here is synthetic.
//
//   node tools/build_roi_sample.mjs [archive folder]     (default ../nova-logs-archive/2026-10-30-v1.0.11)

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { EGP_PER_USD } = require("../lib/prices.js");
const { businessLine } = require("../lib/roi-config.js");

const ARCHIVE = path.resolve(ROOT, process.argv[2] || "../nova-logs-archive/2026-10-30-v1.0.11");
const shadowFile = fs.readdirSync(ARCHIVE).find((f) => /^shadow-.*\.json$/.test(f));
const shadow = JSON.parse(fs.readFileSync(path.join(ARCHIVE, shadowFile), "utf8"));
const turns = fs.readFileSync(path.join(ARCHIVE, "messages.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).slice(0, shadow.results.length);
const plans = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "customers.json"), "utf8")).map((c) => [c.customer_id, c.plan]));

// The Stage 2 received dates, by ticket order.
const stage2 = execSync("git show c7d86ed:data/tickets-labelled.csv", { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 })
  .replace(/^﻿/, "").split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(",")[1]);

const records = shadow.results.map((r, i) => {
  const t = turns[i];
  const steps = t.steps || [];
  return {
    request_id: t.message_id,
    conversation_id: `CONV-${String(i + 1).padStart(4, "0")}`,
    customer_id: t.customerId,
    segment: plans[t.customerId] || "unknown",
    business_line: businessLine(plans[t.customerId]),
    workflow: t.intent,
    prompt_version: `understand ${t.prompts.understand} / answer ${t.prompts.answer}`,
    model_ids: [...new Set(steps.map((s) => s.model))],
    provider: t.provider,
    deployment: t.mode || "auto",
    tokens_in: t.tokens.input + t.tokens.cache_read + t.tokens.cache_write,
    tokens_out: t.tokens.output,
    retries: steps.reduce((a, s) => a + Math.max(0, s.attempts - 1), 0),
    latency_ms: t.ms,
    cost_usd: t.cost_usd || 0,
    cost_egp: Number(((t.cost_usd || 0) * EGP_PER_USD).toFixed(5)),
    outcome: t.priority === "P0" || t.queue === "Fraud" ? "fraud" : t.action === "answer" && !t.reply_id ? "answered" : t.action === "handoff" ? "handoff" : "fixed_reply",
    verified_resolved: Boolean(r.would_resolve),
    time: new Date(`${stage2[i].replace(" ", "T")}:00+02:00`).toISOString(),
  };
});

const out = {
  what: "Synthetic demo data for the ROI section of the PM panel: the 1.0.11 shadow run, one record per request, no message text. verified_resolved = the shadow run's 'would have resolved'. time = the ticket's Stage 2 received date.",
  source: `${path.basename(ARCHIVE)}/${shadowFile}`,
  built: new Date().toISOString().slice(0, 10),
  records,
};
fs.writeFileSync(path.join(ROOT, "data", "roi-sample.json"), JSON.stringify(out, null, 1) + "\n");
const usd = records.reduce((a, r) => a + r.cost_usd, 0);
console.log(`records ${records.length}, resolved ${records.filter((r) => r.verified_resolved).length}, cost US$${usd.toFixed(4)}`);

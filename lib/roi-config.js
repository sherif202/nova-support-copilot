// ROI model settings (docs/ROI-MODEL.md). SYNTHETIC ASSUMPTIONS: none of these numbers comes from a real bank.
// Change them here; the PM panel recomputes everything on the next refresh. The exchange rate is EGP_PER_USD in
// lib/prices.js, so every EGP figure in the app uses the same rate.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// What an agent's time costs Nova, in EGP per minute (salary, seat and overhead). Assumption.
const AGENT_EGP_PER_MINUTE = 2.0;

// Running cost a month whatever the volume: hosting, monitoring, a part-time knowledge owner, quality review and
// compliance. Assumption, to be replaced by the bank's figures (the first model used EGP 5,000, which was far too low).
const FIXED_MONTHLY_EGP = 60000;

// Build, bank integration, security and compliance work, spread over 3 years. Assumption.
const BUILD_EGP = 1200000;
const BUILD_MONTHS = 36;

// The funnel, from the Nova brief: 60% of contacts are in scope; 120 agents handle the 45,000 contacts.
const IN_SCOPE_SHARE = 0.6;
const AGENTS = 120;
const AGENT_HOURS_A_MONTH = 160;

// Low, base and high cases: the share of in-scope contacts that start in chat, and the share of those chats resolved
// with no repeat contact in 7 days. Assumptions until the pilot measures them.
const SCENARIOS = [
  { name: "Low", adoption: 0.1, resolution: 0.25 },
  { name: "Base", adoption: 0.2, resolution: 0.4 },
  { name: "High", adoption: 0.35, resolution: 0.55 },
];

// Monthly contacts the projection scales to: 45,000 a month, the Nova brief's figure for the contact center.
// The sample has the same mix of in-scope and out-of-scope contacts as the 200 labelled tickets.
const MONTHLY_CONTACTS = 45000;

// The committed monthly AI budget (the "flat-fee tier"): what the bank set aside for model calls. Assumption.
const MONTHLY_AI_BUDGET_EGP = 300;

// Demand alert: weekly volume growth (last 4 weeks against the 4 before) above this, while the budget is flat.
const GROWTH_ALERT = 0.15;

// Average agent minutes per ticket, by workflow (intent), from the 200 labelled contact-center tickets
// (data/tickets-labelled.csv, column resolution_minutes): the same minutes the shadow script counts as saved.
function minutesByWorkflow() {
  const text = fs.readFileSync(path.join(ROOT, "data", "tickets-labelled.csv"), "utf8").replace(/^﻿/, "");
  // A small CSV reader: quoted fields (messages, agent notes) may hold commas.
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
  const [cols, ...body] = rows;
  const iIntent = cols.indexOf("intent"), iMinutes = cols.indexOf("resolution_minutes");
  const totals = {};
  for (const cells of body) {
    const intent = cells[iIntent], minutes = Number(cells[iMinutes]);
    if (!intent || !Number.isFinite(minutes)) continue;
    const t = (totals[intent] ||= { n: 0, minutes: 0 });
    t.n += 1;
    t.minutes += minutes;
  }
  const out = {};
  let n = 0, all = 0;
  for (const [intent, t] of Object.entries(totals)) {
    out[intent] = Number((t.minutes / t.n).toFixed(1));
    n += t.n;
    all += t.minutes;
  }
  out.default = Number((all / n).toFixed(1));
  return out;
}

// Size tiers by the AI cost of one conversation, in EGP: upper limits for S, M and L, and XL; above XL is XXL.
// Set from the sample's cost percentiles (S up to p50, M p70, L p80, XL p95), so S to L hold at least 80% of
// conversations on that data. On live data the share moves, which is what the "within S to L" tile watches.
const TIERS_EGP = { S: 0.01565, M: 0.01695, L: 0.01835, XL: 0.0324 };

// Business lines that own the cost (internal chargeback and credit budgets), by the customer's plan.
function businessLine(plan) {
  return plan === "Business Account" ? "Business banking" : "Retail banking";
}

// Credits: an internal unit, 1 credit = the AI cost of a median S conversation (recomputed from the data). Each
// business line gets a monthly budget in credits. If model prices change, only the EGP value of a credit changes;
// the budgets stay the same. Set to about the EGP 300 monthly AI budget at the sample's credit value (EGP 0.0068),
// split 70/30 by each line's share of contacts. Assumption.
const MONTHLY_CREDIT_BUDGET = { "Retail banking": 30000, "Business banking": 14000 };

module.exports = {
  AGENT_EGP_PER_MINUTE, FIXED_MONTHLY_EGP, BUILD_EGP, BUILD_MONTHS, IN_SCOPE_SHARE, AGENTS, AGENT_HOURS_A_MONTH, SCENARIOS,
  MONTHLY_CONTACTS, MONTHLY_AI_BUDGET_EGP, GROWTH_ALERT,
  TIERS_EGP, MONTHLY_CREDIT_BUDGET, minutesByWorkflow, businessLine,
};

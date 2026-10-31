// Free, deterministic checks of the transaction investigator's logic (lib/investigate.js): no app, no model.
// The same expectations as eval cases V1 to V8 (knowledge/evalset.md), at a fixed day, 31 Oct 2026.
//
//   node tools/test-investigator.mjs

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const I = require("../lib/investigate.js");
const { lookup } = require("../lib/lookup.js");
const TODAY = "2026-10-31";

const checks = [];
const check = (name, fn) => {
  let ok = false, why = "";
  try { ok = fn(); } catch (err) { why = String(err); }
  checks.push({ name, ok, why });
};

check("clues from the customer's words", () => {
  const c = I.cluesFrom("I paid about 1450 at Carrefour yesterday with my card", "C-0005");
  return c.when === "yesterday" && c.amount === "about:1450" && c.place === "Carrefour";
});
check("V1 narrowing: 3 online matches this week, all the customer's own", () => {
  const own = new Set(lookup("C-0010", "", "").all_ids);
  const r = I.find("C-0010", { when: "week", how: "online" }, TODAY);
  return r.count === 3 && r.items.some((i) => i.id === "TXN-2026-10-30-0902") && r.items.every((i) => own.has(i.id));
});
check("amount range filter: only payments over EGP 5,000", () => {
  const items = I.find("C-0003", { amount: "range:5000:10000000" }, TODAY).items;
  return items.length > 0 && items.every((i) => Number(i.bold[0].en.replace(/[^\d.]/g, "")) >= 5000);
});
check("V2 declined: rule, balance at that moment, no money taken, retry", () => {
  const d = I.detail("C-0005", "TXN-2026-10-30-0908", TODAY);
  return d.rule === "TXS-2.1" && /980/.test(d.why.en) && d.steps.some((s) => /No money was taken/.test(s.en)) && /20:31/.test(d.next.en);
});
check("V3 pending hotel hold: TXS-1.2, 12 Nov, no promise", () => {
  const d = I.detail("C-0010", "TXN-2026-10-29-0901", TODAY);
  return d.rule === "TXS-1.2" && d.expected === "2026-11-12" && /not a guarantee/.test(d.next.en) && !d.late;
});
check("late pending: the normal time has passed, a colleague traces it", () => I.detail("C-0003", "TXN-2026-09-25-0131", TODAY)?.late === true || I.detail("C-0003", lookup("C-0003", "Vodafone", "txn.status").retrieved_ids[0], TODAY).late === true);
check("V4 waiting: the pending InstaPay is found, no handoff", () => {
  const w = I.waiting("C-0010", { source: "person", sent: "yesterday" }, TODAY);
  return w.pending.some((i) => i.id === "TXN-2026-10-30-0903") && !w.suggest_handoff;
});
check("V5 waiting, nothing yet, within the normal time: no handoff", () => {
  const w = I.waiting("C-0003", { source: "abroad", sent: "today" }, TODAY);
  return !w.pending.length && !w.posted.length && w.normal.rule === "TXS-4.4" && !w.suggest_handoff;
});
check("V6 waiting, nothing, normal time passed: handoff offered", () => {
  const w = I.waiting("C-0003", { source: "person", sent: "4+" }, TODAY);
  return !w.pending.length && w.overdue && w.suggest_handoff;
});
check("salary isn't counted as 'someone sent me money'", () => I.waiting("C-0003", { source: "person", sent: "4+" }, TODAY).posted.every((i) => !/salary/i.test(i.title.en)));
check("V8 privacy: another customer's transaction is not returned", () => I.detail("C-0010", "TXN-2026-10-30-0908", TODAY) === null);
check("business days skip Friday, Saturday and holidays", () => I.addBusinessDays("2026-10-29", 1) === "2026-11-01" && I.addBusinessDays("2026-11-04", 1) === "2026-11-08");
check("sender name only: no account details in a money-in detail", () => !/IBAN|account number|\d{10,}/i.test(JSON.stringify(I.detail("C-0010", "TXN-2026-10-30-0903", TODAY))));
check("card numbers: last 4 digits only", () => !/\d{5,}/.test(JSON.stringify(I.find("C-0010", {}, TODAY).items.map((i) => i.meta))));
check("summary for the agent has every part", () => /Filters: .*Candidates checked: .*Pending or incoming found: .*Why a person:/.test(I.summary({ flow: "find", filters: { when: "week" }, candidates: ["A"], found: [], reason: "x", lookingFor: "y" })));

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? "pass" : "FAIL"}  ${c.name}${c.why ? `  (${c.why})` : ""}`);
  if (!c.ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} investigator checks pass`);
process.exit(failed ? 1 : 0);

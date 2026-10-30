// Nova Bank model check (Stage 3). Runs the 60 core eval cases through one or more models
// and reports intent accuracy, priority accuracy, fraud recall, speed, tokens and cost,
// split by language. Works before the full app is built.
//
//   node tools/model-check.mjs --runs anthropic:claude-haiku-5-5,google:gemini-2.5-flash-lite
//   node tools/model-check.mjs --runs openai:gpt-6-luna --limit 10 --answer
//   node tools/model-check.mjs --runs fake:test            (no key, no cost: checks the script)
//
// Options
//   --runs     provider:model, comma separated. Providers: anthropic, openai, google, openrouter, fake.
//              Default: MODEL_CHECK_RUNS from .env
//   --limit N  only the first N cases (start with 10 to check your keys cheaply)
//   --answer   also write an answer for P2 cases, to measure answer length and cost per language.
//              The records it needs are passed in directly, so this measures cost, not retrieval.
//   --delay ms wait between calls (use 4000 on Google's free tier)
//   --effort   low | medium | high, for providers that support it (default low)
//
// Keys are read from .env and never printed or saved. Results go to logs/model-check-<time>.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf-8");

// ---------- .env (no dependency needed) ----------
if (fs.existsSync(path.join(ROOT, ".env"))) {
  for (const line of read(".env").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ---------- options ----------
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i < 0 ? dflt : (argv[i + 1] ?? true); };
const RUNS = String(opt("runs", process.env.MODEL_CHECK_RUNS || "")).split(",").map((s) => s.trim()).filter(Boolean);
const LIMIT = Number(opt("limit", 0)) || Infinity;
const ANSWER = argv.includes("--answer");
const DELAY = Number(opt("delay", 0));
const EFFORT = String(opt("effort", "low"));
if (!RUNS.length) { console.error("Say which models to test, e.g. --runs anthropic:claude-haiku-5-5,openai:gpt-6-luna"); process.exit(1); }

// ---------- prices, US$ per million tokens (Oct 2026). Check each vendor's page. ----------
const PRICES = [
  ["claude-haiku-5-5", 0.10, 0.50], ["claude-sonnet-5-5", 2, 10], ["claude-opus-5-5", 4, 20],
  ["gpt-6.1-terra", 1, 5], ["gpt-6-luna", 0.10, 0.50],
  ["gemini-2.5-flash-lite", 0.10, 0.40], ["gemini-3.8-flash", 0.75, 3.75],
  ["test", 0, 0],
];
const EGP_PER_USD = Number(process.env.EGP_PER_USD || 50);
const price = (model) => PRICES.find(([k]) => model.toLowerCase().includes(k));

// ---------- eval cases ----------
const LANG = { "Arabic": "arabic", "English": "english", "Franco-Arabic": "franco" };
function loadCases() {
  const rows = [];
  for (const line of read("knowledge/evalset.md").split("\n")) {
    if (!/^\| \d+ \|/.test(line)) continue;
    const c = line.trim().replace(/^\||\|$/g, "").split("|").map((x) => x.trim());
    const off = c.length === 11 ? 1 : 0; // cases 23-60 carry a Customer column
    rows.push({
      id: Number(c[0]), customer: off ? c[1] : "C-0012", message: c[2 + off], language: LANG[c[3 + off]] || c[3 + off],
      intent: c[4 + off], priority: c[5 + off], action: c[6 + off], location: c[8 + off],
    });
  }
  return rows;
}
const CASES = loadCases().slice(0, LIMIT);
if (!CASES.length) { console.error("No cases found in knowledge/evalset.md"); process.exit(1); }

// ---------- records, for --answer ----------
const J = (f) => JSON.parse(read(f));
const RECORDS = {};
for (const t of J("data/transactions.json")) RECORDS[t.record_id] = t;
for (const d of J("data/disputes.json")) RECORDS[d.dispute_id] = d;
for (const k of J("data/cards.json")) RECORDS[k.card_id] = k;
for (const n of J("data/service-status.json")) RECORDS[n.notice_id] = n;
const recordsFor = (loc) => (loc.match(/TXN-[\d-]+|D-\d{4}-\d{4}|CARD-\d{4}-\d|ANN-[\d-]+/g) || []).map((id) => RECORDS[id]).filter(Boolean);

// ---------- prompts ----------
// The examples bank is Nova's own memory of real phrasing. Every model gets the same file.
const EXAMPLES = fs.existsSync(path.join(ROOT, "knowledge/examples.jsonl"))
  ? read("knowledge/examples.jsonl").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.status === "approved")
      .map((e) => `- "${e.message}" -> ${e.intent}, ${e.priority}${e.why ? ` (${e.why})` : ""}`).join("\n")
  : "(none yet)";
const UNDERSTAND_SYSTEM = `You label customer messages for Nova Bank, a bank in Egypt. Customers write in Egyptian Arabic, English, or Franco-Arabic (Arabic written in Latin letters and numbers, like "3ayez" or "et5asamo").
Use ONLY the definitions, priorities and traps in the taxonomy below, never your own categories. A higher priority always wins.
Reply with JSON only, no other text, in this shape:
{"input_language": "arabic" | "english" | "franco", "category": string, "intent": string, "priority": "P0" | "P1" | "P2" | "P3" | "P4", "confidence": number from 0 to 1}

${read("knowledge/nova-taxonomy.md")}

## Worked examples (approved, from knowledge/examples.jsonl)
${EXAMPLES}`;
const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    input_language: { type: "string", enum: ["arabic", "english", "franco"] },
    category: { type: "string" }, intent: { type: "string" },
    priority: { type: "string", enum: ["P0", "P1", "P2", "P3", "P4"] },
    confidence: { type: "number" },
  },
  required: ["input_language", "category", "intent", "priority", "confidence"],
};
const ANSWER_SYSTEM = `You are Nova Bank's support copilot. Answer the customer using ONLY the rules and the customer's records given to you. Cite every rule ID and record ID you use in square brackets. Reply in the customer's language; if they wrote Franco-Arabic, reply in Arabic script. If the answer isn't in the rules or records, say so and offer a colleague. Never promise a refund. Keep it under 120 words.

${read("knowledge/nova-policies.md")}`;

// ---------- providers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parseJSON = (t) => { try { return JSON.parse(String(t).replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); } catch { return null; } };
const clients = {};

async function call(provider, model, system, user, json) {
  if (provider === "fake") {
    await sleep(5);
    const text = json ? JSON.stringify({ input_language: "english", category: "Fees", intent: "fee.explain", priority: "P2", confidence: 0.5 }) : "Fake answer [FEE-2.3]";
    return { text, inTok: Math.round((system.length + user.length) / 4), outTok: Math.round(text.length / 4), cachedTok: 0 };
  }
  if (provider === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    clients.anthropic ??= new Anthropic(); // reads ANTHROPIC_API_KEY
    const r = await clients.anthropic.messages.create({
      model, max_tokens: 2000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      output_config: json ? { format: { type: "json_schema", schema: SCHEMA }, effort: EFFORT } : { effort: EFFORT },
    });
    const text = r.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const u = r.usage;
    return { text, inTok: u.input_tokens + (u.cache_creation_input_tokens || 0), cachedTok: u.cache_read_input_tokens || 0, outTok: u.output_tokens };
  }
  if (provider === "openai" || provider === "openrouter") {
    const { default: OpenAI } = await import("openai");
    clients[provider] ??= provider === "openai"
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" });
    const body = { model, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
    if (json) body.response_format = { type: "json_schema", json_schema: { name: "understand", strict: true, schema: SCHEMA } };
    let r;
    try { r = await clients[provider].chat.completions.create(body); }
    catch (e) {
      if (json && e.status === 400) { body.response_format = { type: "json_object" }; r = await clients[provider].chat.completions.create(body); }
      else throw e;
    }
    const u = r.usage || {};
    const cached = u.prompt_tokens_details?.cached_tokens || 0;
    return { text: r.choices[0].message.content, inTok: (u.prompt_tokens || 0) - cached, cachedTok: cached, outTok: u.completion_tokens || 0 };
  }
  if (provider === "google") {
    const { GoogleGenAI } = await import("@google/genai");
    clients.google ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const r = await clients.google.models.generateContent({
      model, contents: user,
      config: json ? { systemInstruction: system, responseMimeType: "application/json" } : { systemInstruction: system },
    });
    const u = r.usageMetadata || {};
    const cached = u.cachedContentTokenCount || 0;
    return { text: r.text, inTok: (u.promptTokenCount || 0) - cached, cachedTok: cached, outTok: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) };
  }
  throw new Error(`Unknown provider "${provider}". Use anthropic, openai, google, openrouter or fake.`);
}

async function callWithRetry(...a) {
  for (let i = 0; ; i++) {
    try { return await call(...a); }
    catch (e) {
      const s = e.status || e.code;
      if ((s === 429 || s === 529 || s >= 500) && i < 3) { await sleep(2000 * 2 ** i); continue; }
      throw e;
    }
  }
}

function explain(e, provider, model) {
  const s = e.status || e.code;
  const keyName = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", google: "GEMINI_API_KEY", openrouter: "OPENROUTER_API_KEY" }[provider];
  if (s === 401 || s === 403 || /api key not valid|api_key_invalid|incorrect api key|invalid x-api-key/i.test(e.message)) return `${provider}: the key was refused. Check ${keyName} in .env.`;
  if (s === 404) return `${provider}: model "${model}" not found. Copy the exact model ID from the vendor's models page.`;
  if (s === 429) return `${provider}: rate limit or no credit left. Try --delay 4000, or add credit.`;
  if (/connection error|ENOTFOUND|ECONNREFUSED|fetch failed/i.test(e.message)) return `${provider}: can't reach the vendor. Check your internet connection.`;
  if (/Cannot find (package|module)/.test(e.message)) return `Missing SDK. Run: npm install`;
  return `${provider}: ${String(e.message).slice(0, 200)}`;
}

// ---------- scoring ----------
const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "–");
const quant = (xs, q) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const usd = (p, r) => (p ? ((r.inTok * p[1]) + (r.cachedTok * p[1] * 0.1) + (r.outTok * p[2])) / 1e6 : NaN);

const report = { started: new Date().toISOString(), cases: CASES.length, answer_mode: ANSWER, egp_per_usd: EGP_PER_USD, runs: [] };
for (const spec of RUNS) {
  const [provider, ...rest] = spec.split(":"); const model = rest.join(":");
  const p = price(model);
  console.log(`\n▶ ${provider}:${model}  (${CASES.length} cases${ANSWER ? ", with answers" : ""})`);
  const rows = []; let fatal = null;
  for (const c of CASES) {
    try {
      const t0 = Date.now();
      const u = await callWithRetry(provider, model, UNDERSTAND_SYSTEM, c.message, true);
      const secs = (Date.now() - t0) / 1000;
      const got = parseJSON(u.text) || {};
      const row = { id: c.id, language: c.language, expected: { intent: c.intent, priority: c.priority }, got, secs,
        understand: { in: u.inTok, cached: u.cachedTok, out: u.outTok, usd: usd(p, u) } };
      if (ANSWER && c.action === "Answer") {
        const recs = recordsFor(c.location);
        const a = await callWithRetry(provider, model, ANSWER_SYSTEM, `Customer message: ${c.message}\n\nThis customer's records:\n${JSON.stringify(recs, null, 1)}`, false);
        row.answer = { text: a.text, in: a.inTok, cached: a.cachedTok, out: a.outTok, usd: usd(p, a) };
      }
      rows.push(row);
      process.stdout.write(got.intent === c.intent ? "." : "x");
    } catch (e) { fatal = explain(e, provider, model); break; }
    if (DELAY) await sleep(DELAY);
  }
  if (fatal) { console.log(`\n  Stopped: ${fatal}`); report.runs.push({ run: spec, error: fatal, rows }); continue; }

  const ok = (r, k) => r.got[k] === r.expected[k];
  const fraud = rows.filter((r) => r.expected.priority === "P0");
  const summary = {
    run: spec,
    intent: pct(rows.filter((r) => ok(r, "intent")).length, rows.length),
    priority: pct(rows.filter((r) => ok(r, "priority")).length, rows.length),
    language: pct(rows.filter((r) => r.got.input_language === r.language).length, rows.length),
    fraud_recall_model_only: `${fraud.filter((r) => r.got.priority === "P0").length}/${fraud.length}`,
    p50_s: quant(rows.map((r) => r.secs), 0.5).toFixed(2), p95_s: quant(rows.map((r) => r.secs), 0.95).toFixed(2),
    by_language: {},
  };
  for (const lang of ["arabic", "english", "franco"]) {
    const rs = rows.filter((r) => r.language === lang); if (!rs.length) continue;
    const ans = rs.filter((r) => r.answer);
    const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const uUsd = avg(rs.map((r) => r.understand.usd)), aUsd = avg(ans.map((r) => r.answer.usd));
    summary.by_language[lang] = {
      cases: rs.length, intent: pct(rs.filter((r) => ok(r, "intent")).length, rs.length),
      understand_tokens_out: Math.round(avg(rs.map((r) => r.understand.out))),
      answer_tokens_out: ans.length ? Math.round(avg(ans.map((r) => r.answer.out))) : "–",
      egp_per_message_understand: +(uUsd * EGP_PER_USD).toFixed(4),
      // one question per conversation; about 60% of conversations reach the answer step
      egp_per_conversation_est: ans.length ? +((uUsd + 0.6 * aUsd) * EGP_PER_USD).toFixed(3) : "use --answer",
    };
  }
  summary.misses = rows.filter((r) => !ok(r, "intent")).map((r) => `#${r.id} ${r.expected.intent} → ${r.got.intent || "no JSON"}`);
  report.runs.push({ ...summary, rows });

  console.log(`\n  intent ${summary.intent} · priority ${summary.priority} · language ${summary.language} · fraud (model only) ${summary.fraud_recall_model_only} · p50 ${summary.p50_s}s · p95 ${summary.p95_s}s`);
  console.table(summary.by_language);
  if (summary.misses.length) console.log("  Misses:", summary.misses.slice(0, 12).join("  |  "));
  if (!p) console.log("  (No price on file for this model, so cost shows as NaN. Add it to PRICES at the top of this script.)");
}

fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
const out = path.join("logs", `model-check-${report.started.replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(path.join(ROOT, out), JSON.stringify(report, null, 2));
console.log(`\nSaved ${out}`);
console.log("Remember: this checks the understand step (and answer length with --answer). The full bake-off, with lookup, output checks and the judge, runs after build step 14.");

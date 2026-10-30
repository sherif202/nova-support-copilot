// Nova Bank support copilot, starter version.
// Runs on your computer with Node.js only. No packages to install.
// The AI here is FAKE on purpose: every message gets the same reply.
// The build guide (BUILD-GUIDE.md) walks you through making it real with Claude Code.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// Load settings and secrets from .env (never committed, see .gitignore).
// Values already set in the environment win. Keys are never printed.
function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trim().startsWith("#")) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
loadEnv();

// Nova's prompts and fixed replies, filled from knowledge/ once at start.
const { prompts, reply, answerUserTurn, retryNote } = require("./lib/prompts");
const { runChecks } = require("./lib/checks");
const { lookup, liveNotices } = require("./lib/lookup");
const { guard, mask } = require("./lib/guard");
const { fraudSignal } = require("./lib/fraud");

const PORT = process.env.PORT || 3000;
const DATA = path.join(ROOT, "data");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(value, null, 2));
}

// Basic browser protections on every response: only load files from this server,
// never guess file types, never show the page inside another site's frame.
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function sendJson(res, status, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100000) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

// The AI client. The key comes from .env and is never printed or sent to the browser.
const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 15000, maxRetries: 1 });
const UNDERSTAND_MODEL = process.env.UNDERSTAND_MODEL || "claude-haiku-5-5";

// The JSON shape the understand prompt asks for (prompts/understand.md, section 8).
const UNDERSTAND_SCHEMA = {
  type: "object",
  properties: {
    input_language: { type: "string", enum: ["arabic", "english", "franco"] },
    category: { type: "string" },
    intent: { type: "string" },
    priority: { type: "string", enum: ["P0", "P1", "P2", "P3", "P4"] },
    confidence: { type: "number" },
    rewrite: { type: "string" },
    injection_suspected: { type: "boolean" },
    wants_person: { type: "boolean" },
  },
  required: ["input_language", "category", "intent", "priority", "confidence", "rewrite", "injection_suspected", "wants_person"],
  additionalProperties: false,
};

// The JSON shape the answer prompt asks for (prompts/answer.md, section 8).
const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    reply_language: { type: "string", enum: ["arabic", "english"] },
    answer_text: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
    action: { type: "string", enum: ["answer", "handoff"] },
    ticket_status: { type: "string", enum: ["resolved_pending_confirmation", "handed_off"] },
  },
  required: ["reply_language", "answer_text", "sources", "action", "ticket_status"],
  additionalProperties: false,
};

const ANSWER_MODEL = process.env.ANSWER_MODEL || "claude-haiku-5-5";
const ANSWER_EFFORT = process.env.ANSWER_EFFORT || "low";

// One model call. The system prompt is cached; only the messages change. Never sends temperature.
// Throws only when the call itself fails (network, timeout, API error).
async function callModel(step, { model, effort, system, messages, schema }) {
  const started = Date.now();
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    output_config: { effort, format: { type: "json_schema", schema } },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  });
  const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  const usage = response.usage;
  const ms = Date.now() - started;
  console.log(
    `[${step}] ${model} | in=${usage.input_tokens} cache_read=${usage.cache_read_input_tokens || 0} ` +
      `cache_write=${usage.cache_creation_input_tokens || 0} out=${usage.output_tokens} | ${ms} ms`
  );
  return { text, usage, ms, model };
}

// The model's JSON, or null when it is broken or missing a field.
function parseJson(text, schema) {
  try {
    const json = JSON.parse(text);
    return schema.required.every((field) => field in json) ? json : null;
  } catch {
    return null;
  }
}

// Step 1 of the copilot: label the message. The customer's message is the whole user turn.
async function understand(message) {
  const result = await callModel("understand", {
    model: UNDERSTAND_MODEL,
    effort: "low",
    system: prompts.understand.system,
    messages: [{ role: "user", content: message }],
    schema: UNDERSTAND_SCHEMA,
  });
  const label = parseJson(result.text, UNDERSTAND_SCHEMA);
  if (!label) throw new Error("understand returned broken JSON");
  console.log(`[understand] ${label.intent} ${label.priority} conf=${label.confidence}`);
  return { ...result, label };
}

// The current time in Cairo: { instant, day: "YYYY-MM-DD", text }.
// For tests only, when ALLOW_TEST_NOW=true, a request may say what "now" is, as an ISO time with its offset
// (for example 2026-10-29T20:15:00+02:00). Otherwise the real clock is always used.
function cairoNow(testNow) {
  if (testNow && process.env.ALLOW_TEST_NOW === "true") {
    const match = String(testNow).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?([+-]\d{2}:\d{2})$/);
    if (match) {
      const instant = new Date(testNow);
      const [year, month, day] = match[1].split("-").map(Number);
      const label = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
      });
      return { instant, day: match[1], text: `${label}, ${match[2]} (Cairo)` };
    }
  }
  const instant = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(instant).map((p) => [p.type, p.value])
  );
  const text = instant.toLocaleString("en-GB", {
    timeZone: "Africa/Cairo",
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) + " (Cairo)";
  return { instant, day: `${parts.year}-${parts.month}-${parts.day}`, text };
}

// Step 2: write the answer from this customer's own top 3 records and the cached policies.
// Maintenance questions also get the notices that are live now or later today, never expired ones.
// Step 12: every answer is checked in code. One retry with prompts/retry.md if a check fails or the JSON
// is broken; if the retry fails too, status is "check_failed". Never a third try.
// Returns { status: "ok" | "handoff" | "check_failed", json, attempts, checks_passed, failed_check, ... }.
async function answer(customerId, message, label, testNow) {
  const now = cairoNow(testNow);
  const found = lookup(customerId, message, label.intent);
  const notices = label.intent === "service.status" ? liveNotices(now) : [];
  const user = answerUserTurn({
    NOW_CAIRO: now.text,
    TOP_3_RECORDS: found.records.length ? found.records.map((r) => JSON.stringify(r)).join("\n") : "none",
    LIVE_NOTICES_OR_NONE: notices.length ? notices.map((n) => JSON.stringify(n)).join("\n") : "none",
    LAST_TURNS_MASKED: "none",
    INPUT_LANGUAGE: label.input_language,
    INTENT: label.intent,
    REWRITE: label.rewrite,
    MASKED_MESSAGE: message,
  });
  const ctx = {
    message,
    inputLanguage: label.input_language,
    records: found.records,
    recordIds: found.all_ids,
    notices,
    noticeIds: notices.map((n) => n.notice_id),
  };
  const meta = { retrieved_ids: found.retrieved_ids, notice_ids: ctx.noticeIds, calls: [] };
  console.log(`[answer] now=${now.text} notices=${ctx.noticeIds.join(",") || "none"} retrieved=${found.retrieved_ids.join(",") || "none"}`);

  const messages = [{ role: "user", content: user }];
  let failed = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      messages.push({ role: "user", content: retryNote(failed.check, failed.detail) });
      console.log(`[answer] retry once: ${failed.check}`);
    }
    const result = await callModel("answer", {
      model: ANSWER_MODEL,
      effort: ANSWER_EFFORT,
      system: prompts.answer.system,
      messages,
      schema: ANSWER_SCHEMA,
    });
    meta.calls.push({ usage: result.usage, ms: result.ms });
    const json = parseJson(result.text, ANSWER_SCHEMA);
    if (!json) {
      failed = { check: "broken_json", detail: {} };
    } else {
      if (json.action === "handoff") return { ...meta, status: "handoff", json, attempts: attempt, checks_passed: [] };
      // A maintenance answer always rests on DIG-8, the rule for sharing notices (build step 8b).
      if (json.sources.some((id) => id.startsWith("ANN-")) && !json.sources.includes("DIG-8")) json.sources.push("DIG-8");
      const checked = runChecks(json, ctx);
      console.log(`[answer] sources=${json.sources.join(",") || "none"} checks passed=${checked.passed.join(",")}${checked.failed ? ` FAILED=${checked.failed.check}` : ""}`);
      if (!checked.failed) return { ...meta, status: "ok", json, attempts: attempt, checks_passed: checked.passed };
      failed = checked.failed;
    }
    messages.push({ role: "assistant", content: result.text || "{}" });
  }
  return { ...meta, status: "check_failed", json: null, attempts: 2, checks_passed: [], failed_check: failed.check };
}

// The customer's card whose renewal or replacement was dispatched on or before today, with no delivery date
// and no expected date still to come. `today` is "YYYY-MM-DD" in Cairo.
function undeliveredCard(customerId, message, intent, today) {
  const { records } = lookup(customerId, message, intent);
  return records.find((r) => {
    const sent = r.card_id && r.renewal;
    if (!sent || !sent.dispatch_date || sent.dispatch_date > today || sent.delivered) return false;
    return !(sent.expected_by && sent.expected_by >= today);
  }) || null;
}

const fixedLanguage = (language) => (language === "english" ? "english" : "arabic");

const SUPERVISOR_NOTE = "Sensitive: routed to the Supervisor queue (head of agents). Queue per bank policy, to be confirmed by Compliance.";

// A fixed reply from prompts/replies.md, with a ticket so a person picks it up.
function handOff(customerId, message, base, replyId, queue, note) {
  const status = queue === "Fraud" ? "moved_to_fraud" : "moved_to_agent";
  const result = { ...base, sources: [], action: "handoff", ticket_status: status };
  const ticket = newTicket(customerId, message, result, queue, note);
  return {
    ...result,
    reply_language: fixedLanguage(base.input_language),
    answer_text: reply(replyId, base.input_language, { REF: ticket.ticket_id }),
    reply_id: replyId,
    ticket_id: ticket.ticket_id,
    queue,
  };
}

// Token use of one step, added up over its attempts, for the log.
function stepTrace(step, model, calls) {
  const sum = (field) => calls.reduce((total, call) => total + (call.usage[field] || 0), 0);
  return {
    step,
    model,
    attempts: calls.length,
    ms: calls.reduce((total, call) => total + call.ms, 0),
    input_tokens: sum("input_tokens"),
    output_tokens: sum("output_tokens"),
    cache_read_tokens: sum("cache_read_input_tokens"),
    cache_write_tokens: sum("cache_creation_input_tokens"),
  };
}

// Franco-Arabic: Latin letters with numbers standing for Arabic sounds (3ayez, fa2ed) or common Franco words.
function scriptLanguage(text) {
  if (/[؀-ۿ]/.test(text)) return "arabic";
  if (/[a-z][2357]|[2357][a-z]|\b(?:msh|mesh|ana|elly|3ayez|3ayza|eh|dah?|di|ya3ny|law|ma3|fen)\b/i.test(text)) return "franco";
  return "english";
}

// Fraud goes first, to a person: the fixed R-FRAUD reply, the Block card button and the Fraud queue.
// Never an answer model (step 10).
function fraudHandOff(customerId, message, base) {
  return { ...handOff(customerId, message, { ...base, priority: "P0" }, "R-FRAUD", "Fraud"), block_card: true };
}

// The copilot: fraud words first (no model), then understand, then route P1, P3, low confidence and
// "talk to a person" to people, and answer only P2 and P4 from sources.
// `trace` collects what the log needs (steps, retrieved IDs, checks); it is never sent to the browser.
async function copilot(customerId, message, testNow, trace) {
  const signal = fraudSignal(message);
  if (signal) {
    console.log(`[fraud] word list matched (${signal.signal}), no model call`);
    return fraudHandOff(customerId, message, {
      input_language: scriptLanguage(message),
      category: "Fraud and security",
      intent: signal.intent,
      confidence: 1,
    });
  }

  let label;
  try {
    const understood = await understand(message);
    label = understood.label;
    trace.steps.push(stepTrace("understand", UNDERSTAND_MODEL, [understood]));
    trace.injection_suspected = label.injection_suspected;
  } catch (err) {
    // A failed or broken model reply never reaches the customer as an error: a person takes over.
    console.error(`[understand] failed: ${err.message}`);
    trace.error = `understand: ${err.message}`;
    const base = { input_language: "english", category: "General", intent: "general.unknown", priority: "P4", confidence: 0 };
    return handOff(customerId, message, base, "R-MODEL-DOWN", "Agent");
  }
  const base = {
    input_language: label.input_language,
    category: label.category,
    intent: label.intent,
    priority: label.priority,
    confidence: label.confidence,
  };

  if (label.priority === "P0" || label.intent.startsWith("fraud.")) {
    console.log("[fraud] understand step said P0");
    return fraudHandOff(customerId, message, base);
  }

  // Step 11: route in code. Every handoff gets a fixed reply and a reference number.
  // A vulnerable customer (death in the family, illness, distress) always goes to a person, never an automatic
  // answer: the Supervisor queue (head of agents). The exact queue follows bank policy, to be confirmed by Compliance.
  if (label.intent === "sensitive.vulnerable") {
    return handOff(customerId, message, { ...base, priority: "P1" }, "R-PERSON", "Supervisor", SUPERVISOR_NOTE);
  }
  if (label.priority === "P1") return handOff(customerId, message, base, "R-COMPLAINT", "Complaints");
  if (label.priority === "P3") return handOff(customerId, message, base, "R-OUT-OF-SCOPE", "Agent");
  if (label.wants_person) return handOff(customerId, message, base, "R-PERSON", "Agent");
  if (!(label.confidence >= 0.7)) return handOff(customerId, message, base, "R-UNSURE", "Agent");

  // A card that was sent but has no delivery recorded (and isn't still on its way) needs a person to check the
  // delivery; the copilot can't know where it is (evalset case 41).
  if (label.intent.startsWith("card.")) {
    const lost = undeliveredCard(customerId, message, label.intent, cairoNow(testNow).day);
    if (lost) return handOff(customerId, message, base, "R-UNSURE", "Agent", `Card ${lost.card_id} sent ${lost.renewal.dispatch_date}, no delivery recorded: check the delivery.`);
  }

  let answered;
  try {
    answered = await answer(customerId, message, label, testNow);
  } catch (err) {
    console.error(`[answer] failed: ${err.message}`);
    trace.error = `answer: ${err.message}`;
    return handOff(customerId, message, base, "R-MODEL-DOWN", "Agent");
  }
  trace.steps.push(stepTrace("answer", ANSWER_MODEL, answered.calls));
  trace.retrieved_ids = answered.retrieved_ids;
  trace.notice_ids = answered.notice_ids;
  trace.checks_passed = answered.checks_passed;
  trace.failed_check = answered.failed_check || null;
  if (answered.status === "handoff") return handOff(customerId, message, base, "R-NO-SOURCE", "Agent");
  if (answered.status === "check_failed") return handOff(customerId, message, base, "R-CHECK-FAILED", "Agent");
  return {
    ...base,
    reply_language: answered.json.reply_language,
    answer_text: answered.json.answer_text,
    sources: answered.json.sources,
    action: "answer",
    ticket_status: "resolved_pending_confirmation",
  };
}

function newTicket(customerId, message, result, queue, note) {
  const tickets = readJson("tickets.json");
  const ticket = {
    ticket_id: "TCK-" + String(tickets.length + 1).padStart(4, "0"),
    created_at: new Date().toISOString(),
    customer_id: customerId,
    message,
    intent: result.intent,
    priority: result.priority,
    queue,
    status: result.ticket_status,
    ...(note ? { note } : {}),
  };
  tickets.push(ticket);
  writeJson("tickets.json", tickets);
  return ticket;
}

// ---- Step 13: the turn log (logs/messages.jsonl, masked, never committed) ----

const LOGS = path.join(ROOT, "logs");

function appendLog(file, entry) {
  fs.mkdirSync(LOGS, { recursive: true });
  fs.appendFileSync(path.join(LOGS, file), JSON.stringify(entry) + "\n");
}

let messageCounter = 0;
function newMessageId() {
  messageCounter += 1;
  return `M-${Date.now().toString(36)}-${messageCounter}`;
}

// US$ per million tokens (Anthropic price list, October 2026). Cache reads and writes are priced separately.
const PRICES = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cache_read: 0.2, cache_write: 5 },
};

function stepCost(step) {
  const price = PRICES[step.model];
  if (!price) return null;
  return (
    (step.input_tokens * price.input +
      step.output_tokens * price.output +
      step.cache_read_tokens * price.cache_read +
      step.cache_write_tokens * price.cache_write) / 1e6
  );
}

function writeTurnLog({ customerId, masked, injection_flagged, result, trace, ms }) {
  const costs = trace.steps.map(stepCost);
  const entry = {
    time: new Date().toISOString(),
    message_id: trace.message_id,
    customerId,
    message: masked,
    input_language: result.input_language,
    intent: result.intent,
    priority: result.priority,
    confidence: result.confidence,
    injection_flagged: Boolean(injection_flagged || trace.injection_suspected),
    action: result.action,
    reply_id: result.reply_id || null,
    queue: result.queue || null,
    ticket_id: result.ticket_id || null,
    sources: result.sources || [],
    retrieved_ids: trace.retrieved_ids || [],
    notice_ids: trace.notice_ids || [],
    checks_passed: trace.checks_passed || [],
    failed_check: trace.failed_check || null,
    model: trace.steps.map((s) => s.model).join("+") || "none",
    steps: trace.steps,
    attempts: Object.fromEntries(trace.steps.map((s) => [s.step, s.attempts])),
    tokens: trace.steps.reduce(
      (t, s) => ({
        input: t.input + s.input_tokens,
        output: t.output + s.output_tokens,
        cache_read: t.cache_read + s.cache_read_tokens,
        cache_write: t.cache_write + s.cache_write_tokens,
      }),
      { input: 0, output: 0, cache_read: 0, cache_write: 0 }
    ),
    cost_usd: costs.some((c) => c === null) ? null : Number(costs.reduce((a, b) => a + b, 0).toFixed(6)),
    ms,
    prompts: {
      understand: `${prompts.understand.version}#${prompts.understand.hash}`,
      answer: `${prompts.answer.version}#${prompts.answer.hash}`,
      replies: `${prompts.replies.version}#${prompts.replies.hash}`,
    },
    error: trace.error || null,
  };
  appendLog("messages.jsonl", entry);
}

// The turn that created a ticket, for the model name and message ID in a correction.
function findTurnByTicket(ticketId) {
  const file = path.join(LOGS, "messages.jsonl");
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const turn = JSON.parse(lines[i]);
    if (turn.ticket_id === ticketId) return turn;
  }
  return null;
}

// Every intent ID in the taxonomy, for the "Wrong label?" picker.
const INTENTS = [
  ...new Set(
    [...fs.readFileSync(path.join(ROOT, "knowledge", "nova-taxonomy.md"), "utf8").matchAll(/^- `([a-z]+\.[a-z_]+)`/gm)].map((m) => m[1])
  ),
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serveStatic(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.normalize(path.join(ROOT, "public", urlPath));
  if (!filePath.startsWith(path.join(ROOT, "public"))) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": MIME[path.extname(filePath)] || "text/plain" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    // List customers for the "Log in as" picker (synthetic data only)
    if (req.method === "GET" && req.url === "/api/customers") {
      const customers = readJson("customers.json").map((c) => ({
        customer_id: c.customer_id,
        name: c.name,
        plan: c.plan,
      }));
      return sendJson(res, 200, customers);
    }

    // The agent inbox reads the tickets
    if (req.method === "GET" && req.url === "/api/tickets") {
      return sendJson(res, 200, readJson("tickets.json"));
    }

    // One customer message in, one copilot reply out
    if (req.method === "POST" && req.url === "/api/chat") {
      const body = await readBody(req);
      const customerId = String(body.customerId || "");
      const message = String(body.message || "");
      const started = Date.now();
      const trace = { message_id: newMessageId(), steps: [] };
      // Step 9: junk, length and masking checks in code, before anything is sent anywhere or saved.
      const checked = guard(message);
      let result;
      if (checked.stop) {
        console.log(`[guard] ${checked.stop}, no model call`);
        result = {
          input_language: checked.language,
          reply_language: checked.language,
          category: "General",
          intent: "general.unknown",
          priority: "P4",
          confidence: 0,
          answer_text: reply(checked.stop, checked.language),
          sources: [],
          action: "answer",
          ticket_status: "resolved_pending_confirmation",
          reply_id: checked.stop,
        };
      } else if (process.env.COPILOT_ENABLED === "false") {
        // Step 13 kill switch: no model call at all. The fraud word list is plain code, so fraud still goes to Fraud.
        console.log("[kill switch] COPILOT_ENABLED=false, straight to a person");
        const base = { input_language: scriptLanguage(checked.masked), category: "General", intent: "general.unknown", priority: "P4", confidence: 0 };
        const signal = fraudSignal(checked.masked);
        result = signal
          ? fraudHandOff(customerId, checked.masked, { ...base, category: "Fraud and security", intent: signal.intent, confidence: 1 })
          : handOff(customerId, checked.masked, base, "R-OFF", "Agent");
      } else {
        if (checked.injection_flagged) console.log("[guard] injection phrase flagged");
        result = await copilot(customerId, checked.masked, body.testNow, trace);
      }
      writeTurnLog({ customerId, masked: checked.masked, injection_flagged: checked.injection_flagged, result, trace, ms: Date.now() - started });
      const { reply_id, ...forBrowser } = result;
      return sendJson(res, 200, forBrowser);
    }

    // The intents an agent can pick in "Wrong label?", from the taxonomy
    if (req.method === "GET" && req.url === "/api/intents") {
      return sendJson(res, 200, INTENTS);
    }

    // "Wrong label?" in the agent inbox: one masked line in logs/corrections.jsonl. Never changes knowledge/.
    if (req.method === "POST" && req.url === "/api/corrections") {
      const body = await readBody(req);
      const ticket = readJson("tickets.json").find((t) => t.ticket_id === String(body.ticket_id || ""));
      const agentLabel = String(body.agent_label || "");
      if (!ticket) return sendJson(res, 400, { error: "Unknown ticket." });
      if (!INTENTS.includes(agentLabel)) return sendJson(res, 400, { error: "Pick an intent from the list." });
      const turn = findTurnByTicket(ticket.ticket_id) || {};
      const correction = {
        time: new Date().toISOString(),
        message_id: turn.message_id || ticket.ticket_id,
        message: ticket.message,
        model_label: ticket.intent,
        agent_label: agentLabel,
        agent: mask(String(body.agent || "A-01")).slice(0, 20),
        reason: mask(String(body.reason || "")).slice(0, 300),
        model: turn.model || "none",
      };
      appendLog("corrections.jsonl", correction);
      return sendJson(res, 200, { saved: true });
    }

    // "Talk to a person" button
    if (req.method === "POST" && req.url === "/api/handoff") {
      const body = await readBody(req);
      const ticket = newTicket(
        String(body.customerId || ""),
        mask(String(body.message || "Customer asked for a person")).slice(0, 1000),
        { intent: "general.chitchat", priority: "P4", ticket_status: "moved_to_agent" },
        "Agent"
      );
      return sendJson(res, 200, { ticket });
    }

    return serveStatic(req, res);
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: "Something went wrong on the server." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Nova support copilot (starter, fake AI) running at http://localhost:${PORT}`);
  console.log(`Anthropic API key: ${process.env.ANTHROPIC_API_KEY ? "found in .env" : "MISSING, paste it into .env"}`);
  console.log(`Prompt understand v${prompts.understand.version} #${prompts.understand.hash} (${prompts.understand.system.length} chars)`);
  console.log(`Prompt answer     v${prompts.answer.version} #${prompts.answer.hash} (${prompts.answer.system.length} chars)`);
  console.log(`Fixed replies     v${prompts.replies.version} #${prompts.replies.hash} (${Object.keys(prompts.replies.byId).length} replies)`);
});

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
const { prompts, reply, answerUserTurn } = require("./lib/prompts");
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

// One model call that must return one JSON object. The system prompt is cached; only `user` changes.
// Never sends temperature. Throws on a failed call or broken JSON, so the caller can hand off.
async function callJson(step, { model, effort, system, user, schema }) {
  const started = Date.now();
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    output_config: { effort, format: { type: "json_schema", schema } },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  const json = JSON.parse(text);
  for (const field of schema.required) {
    if (!(field in json)) throw new Error(`${step} reply is missing ${field}`);
  }
  const usage = response.usage;
  const ms = Date.now() - started;
  console.log(
    `[${step}] ${model} | in=${usage.input_tokens} cache_read=${usage.cache_read_input_tokens || 0} ` +
      `cache_write=${usage.cache_creation_input_tokens || 0} out=${usage.output_tokens} | ${ms} ms`
  );
  return { json, usage, ms, model };
}

// Step 1 of the copilot: label the message. The customer's message is the whole user turn.
async function understand(message) {
  const result = await callJson("understand", {
    model: UNDERSTAND_MODEL,
    effort: "low",
    system: prompts.understand.system,
    user: message,
    schema: UNDERSTAND_SCHEMA,
  });
  const label = result.json;
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
  const result = await callJson("answer", {
    model: ANSWER_MODEL,
    effort: ANSWER_EFFORT,
    system: prompts.answer.system,
    user,
    schema: ANSWER_SCHEMA,
  });
  console.log(`[answer] now=${now.text} notices=${notices.map((n) => n.notice_id).join(",") || "none"}`);
  console.log(`[answer] retrieved=${found.retrieved_ids.join(",") || "none"} sources=${result.json.sources.join(",") || "none"} action=${result.json.action}`);
  return { ...result, retrieved_ids: found.retrieved_ids, notice_ids: notices.map((n) => n.notice_id) };
}

const fixedLanguage = (language) => (language === "english" ? "english" : "arabic");

// A fixed reply from prompts/replies.md, with a ticket so a person picks it up.
function handOff(customerId, message, base, replyId, queue) {
  const status = queue === "Fraud" ? "moved_to_fraud" : "moved_to_agent";
  const result = { ...base, sources: [], action: "handoff", ticket_status: status };
  const ticket = newTicket(customerId, message, result, queue);
  return {
    ...result,
    reply_language: fixedLanguage(base.input_language),
    answer_text: reply(replyId, base.input_language, { REF: ticket.ticket_id }),
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
async function copilot(customerId, message, testNow) {
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
    ({ label } = await understand(message));
  } catch (err) {
    // A failed or broken model reply never reaches the customer as an error: a person takes over.
    console.error(`[understand] failed: ${err.message}`);
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
  if (label.priority === "P1") return handOff(customerId, message, base, "R-COMPLAINT", "Complaints");
  if (label.priority === "P3") return handOff(customerId, message, base, "R-OUT-OF-SCOPE", "Agent");
  if (label.wants_person) return handOff(customerId, message, base, "R-PERSON", "Agent");
  if (!(label.confidence >= 0.7)) return handOff(customerId, message, base, "R-UNSURE", "Agent");

  let answered;
  try {
    answered = await answer(customerId, message, label, testNow);
  } catch (err) {
    console.error(`[answer] failed: ${err.message}`);
    return handOff(customerId, message, base, "R-MODEL-DOWN", "Agent");
  }
  if (answered.json.action === "handoff") {
    return handOff(customerId, message, base, "R-NO-SOURCE", "Agent");
  }
  // A maintenance answer always rests on DIG-8, the rule for sharing notices (build step 8b).
  if (answered.json.sources.some((id) => id.startsWith("ANN-")) && !answered.json.sources.includes("DIG-8")) {
    answered.json.sources.push("DIG-8");
  }
  return {
    ...base,
    reply_language: answered.json.reply_language,
    answer_text: answered.json.answer_text,
    sources: answered.json.sources,
    action: "answer",
    ticket_status: "resolved_pending_confirmation",
  };
}

function newTicket(customerId, message, result, queue) {
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
  };
  tickets.push(ticket);
  writeJson("tickets.json", tickets);
  return ticket;
}

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
      // Step 9: junk, length and masking checks in code, before anything is sent anywhere or saved.
      const checked = guard(message);
      if (checked.stop) {
        console.log(`[guard] ${checked.stop}, no model call`);
        return sendJson(res, 200, {
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
        });
      }
      if (checked.injection_flagged) console.log("[guard] injection phrase flagged");
      const result = await copilot(customerId, checked.masked, body.testNow);
      return sendJson(res, 200, result);
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

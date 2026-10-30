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
const { prompts, reply } = require("./lib/prompts");

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

// Step 1 of the copilot: label the message. The whole understand prompt is the cached system block;
// the customer's message is the only thing that changes per call.
async function understand(message) {
  const started = Date.now();
  const response = await anthropic.messages.create({
    model: UNDERSTAND_MODEL,
    max_tokens: 2048,
    output_config: { effort: "low", format: { type: "json_schema", schema: UNDERSTAND_SCHEMA } },
    system: [{ type: "text", text: prompts.understand.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: message }],
  });
  const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  const label = JSON.parse(text);
  for (const field of UNDERSTAND_SCHEMA.required) {
    if (!(field in label)) throw new Error(`Understand reply is missing ${field}`);
  }
  const usage = response.usage;
  console.log(
    `[understand] ${label.intent} ${label.priority} conf=${label.confidence} | in=${usage.input_tokens} ` +
      `cache_read=${usage.cache_read_input_tokens || 0} cache_write=${usage.cache_creation_input_tokens || 0} ` +
      `out=${usage.output_tokens} | ${Date.now() - started} ms`
  );
  return { label, usage, model: UNDERSTAND_MODEL };
}

// The copilot. Step 6: the labels are real; the answer text stays a placeholder until step 8.
async function copilot(customerId, message) {
  let label;
  try {
    ({ label } = await understand(message));
  } catch (err) {
    // A failed or broken model reply never reaches the customer as an error: a person takes over.
    console.error(`[understand] failed: ${err.message}`);
    const result = {
      input_language: "unknown",
      reply_language: "english",
      category: "General",
      intent: "general.unknown",
      priority: "P4",
      confidence: 0,
      sources: [],
      action: "handoff",
      ticket_status: "moved_to_agent",
    };
    const ticket = newTicket(customerId, message, result, "Agent");
    return { ...result, answer_text: reply("R-MODEL-DOWN", "english", { REF: ticket.ticket_id }) };
  }
  return {
    input_language: label.input_language,
    reply_language: label.input_language === "english" ? "english" : "arabic",
    category: label.category,
    intent: label.intent,
    priority: label.priority,
    confidence: label.confidence,
    answer_text: "Thanks for your message! Your request has been received and we will get back to you soon.",
    sources: [],
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
      const result = await copilot(customerId, message);
      return sendJson(res, 200, result);
    }

    // "Talk to a person" button
    if (req.method === "POST" && req.url === "/api/handoff") {
      const body = await readBody(req);
      const ticket = newTicket(
        String(body.customerId || ""),
        String(body.message || "Customer asked for a person"),
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

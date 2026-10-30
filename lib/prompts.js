// Loads Nova's prompt files (prompts/) and fills them from knowledge/ once, at server start.
// The wording lives in the files, never in code. Code only fills placeholders.
// See prompts/README.md for how a prompt is put together and what is cached.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

// "<!-- prompt: understand · version 1.0.0 · ..." -> "1.0.0"
function versionOf(text) {
  const match = text.split("\n")[0].match(/version\s+(\d+\.\d+\.\d+)/);
  return match ? match[1] : "unknown";
}

function shortHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

// Replace {{NAME}} with values[NAME]. Unknown placeholders are left alone.
function fill(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole
  );
}

const normalize = (text) => text.replace(/`/g, "").replace(/\s+/g, " ").trim().toLowerCase();

// Every table cell in knowledge/evalset.md, normalized. An example must never be one of them.
function evalCells() {
  const cells = new Set();
  for (const line of read("knowledge/evalset.md").split("\n")) {
    if (!line.startsWith("|")) continue;
    for (const cell of line.split("|").slice(1, -1)) cells.add(normalize(cell));
  }
  return cells;
}

// Approved examples only, one per line: "message -> intent, priority (why)". See docs/06-LEARNING-LOOP.md.
function approvedExamples() {
  const examples = read("knowledge/examples.jsonl")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .filter((ex) => ex.status === "approved");
  // An example that copies an eval case would let the copilot see the test answers: the server does not start
  // until a person rewrites or removes it.
  const cells = evalCells();
  const leaked = examples.filter((ex) => cells.has(normalize(ex.message))).map((ex) => ex.id);
  if (leaked.length) throw new Error(`knowledge/examples.jsonl copies an eval case: ${leaked.join(", ")}. Rewrite it with different words.`);
  return examples
    .map((ex) => `${ex.message} -> ${ex.intent}, ${ex.priority}${ex.why ? ` (${ex.why})` : ""}`)
    .join("\n");
}

// The table in replies.md: | ID | When | English | Arabic |
function parseReplies(text) {
  const replies = {};
  for (const line of text.split("\n")) {
    if (!line.startsWith("| R-")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const [id, when, english, arabic] = cells;
    replies[id] = { when, english, arabic };
  }
  return replies;
}

// The FIX_HINT table in the comment of retry.md: "check_name -> hint".
function parseFixHints(text) {
  const hints = {};
  for (const match of text.matchAll(/^([a-z_]+)\s*->\s*(.+)$/gm)) hints[match[1]] = match[2].trim();
  return hints;
}

const REQUIRED_REPLIES = [
  "R-FRAUD", "R-COMPLAINT", "R-OUT-OF-SCOPE", "R-UNSURE", "R-PERSON", "R-CHECK-FAILED", "R-NO-SOURCE",
  "R-MODEL-DOWN", "R-OFF", "R-EMPTY", "R-TOO-LONG", "R-WAIT", "R-HELLO",
];

const USER_TURN_MARKER = "\n---\n<!-- USER TURN";

function assertFilled(name, text, placeholders) {
  const left = placeholders.filter((p) => text.includes(`{{${p}}}`));
  if (left.length) throw new Error(`Prompt "${name}" still has unfilled placeholders: ${left.join(", ")}`);
}

function loadPrompts() {
  const taxonomy = read("knowledge/nova-taxonomy.md");
  const policies = read("knowledge/nova-policies.md");
  const examples = approvedExamples();

  // Understand: the whole file is the cached system prompt. The message is the user turn.
  const understandRaw = read("prompts/understand.md");
  const understandSystem = fill(understandRaw, { TAXONOMY: taxonomy, EXAMPLES: examples });
  assertFilled("understand", understandSystem, ["TAXONOMY", "EXAMPLES"]);

  // Answer: above the USER TURN line is the cached system prompt, below it the per-message template.
  const answerRaw = read("prompts/answer.md");
  const cut = answerRaw.indexOf(USER_TURN_MARKER);
  if (cut === -1) throw new Error('Prompt "answer" has no USER TURN section');
  const answerSystem = fill(answerRaw.slice(0, cut).trimEnd(), { POLICIES: policies });
  assertFilled("answer", answerSystem, ["POLICIES"]);
  const answerUserTemplate = answerRaw.slice(cut + USER_TURN_MARKER.length).replace(/^[^\n]*\n/, "");

  const retryRaw = read("prompts/retry.md");
  const repliesRaw = read("prompts/replies.md");
  const replies = parseReplies(repliesRaw);
  const missing = REQUIRED_REPLIES.filter((id) => !replies[id] || !replies[id].english || !replies[id].arabic);
  if (missing.length) throw new Error(`prompts/replies.md is missing: ${missing.join(", ")}`);

  return {
    understand: { version: versionOf(understandRaw), system: understandSystem, hash: shortHash(understandSystem) },
    answer: {
      version: versionOf(answerRaw),
      system: answerSystem,
      hash: shortHash(answerSystem),
      userTemplate: answerUserTemplate,
    },
    retry: { version: versionOf(retryRaw), template: retryRaw, fixHints: parseFixHints(retryRaw) },
    replies: { version: versionOf(repliesRaw), hash: shortHash(repliesRaw), byId: replies },
  };
}

const prompts = loadPrompts();

// Fixed reply by ID. Franco-Arabic and Arabic customers get the Arabic text.
function reply(id, language, values = {}) {
  const entry = prompts.replies.byId[id];
  if (!entry) throw new Error(`Unknown fixed reply ${id}`);
  const text = language === "arabic" || language === "franco" ? entry.arabic : entry.english;
  return fill(text, values);
}

// The per-message user turn for the answer step.
function answerUserTurn(values) {
  return fill(prompts.answer.userTemplate, values);
}

// The one retry after a failed check: names the check and fills its fix hint from retry.md.
function retryNote(failedCheck, details = {}) {
  const hint = fill(prompts.retry.fixHints[failedCheck] || "", details);
  const note = prompts.retry.template.replace(/<!--[\s\S]*?-->\n?/g, "").trim();
  return fill(note, { ...details, FAILED_CHECK: failedCheck, FIX_HINT: hint });
}

module.exports = { prompts, reply, answerUserTurn, retryNote, fill };

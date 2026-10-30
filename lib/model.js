// The model adapter (build step 14b). The only file that knows which vendor runs the copilot.
// Settings from .env: PROVIDER, UNDERSTAND_MODEL, ANSWER_MODEL, ANSWER_EFFORT (and UNDERSTAND_EFFORT),
// BACKUP_PROVIDER and BACKUP_MODEL, plus each vendor's own key. Keys are never logged.
// Every provider returns the same shape: { text, usage, ms, model, provider }, with usage in the same
// fields for all (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens).
// Never sends temperature. Every call has a 15 second timeout and max_tokens.

const TIMEOUT_MS = 15000;
const MAX_TOKENS = 4096;
// One message never makes more than this many model calls, retries included.
const MAX_CALLS_PER_MESSAGE = 4;

const clients = {};

// Claude Opus 5.5 and Sonnet 5.5 can decline a request on a safety classifier; the server-side fallback
// re-routes such a request instead of failing it. Haiku has no server-side fallback.
const USES_FALLBACK = /^claude-(opus|sonnet)-5-5/;

async function callAnthropic(model, effort, system, messages, schema) {
  const Anthropic = require("@anthropic-ai/sdk");
  clients.anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    output_config: { effort, format: { type: "json_schema", schema } },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  };
  const response = USES_FALLBACK.test(model)
    ? await clients.anthropic.beta.messages.create({ ...body, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
    : await clients.anthropic.messages.create(body);
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { text, usage: response.usage };
}

async function callOpenAI(model, effort, system, messages, schema) {
  const { default: OpenAI } = require("openai");
  clients.openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
  const body = {
    model,
    max_completion_tokens: MAX_TOKENS,
    messages: [{ role: "system", content: system }, ...messages],
    response_format: { type: "json_schema", json_schema: { name: "nova", strict: true, schema } },
  };
  const r = await clients.openai.chat.completions.create(body);
  const u = r.usage || {};
  const cached = u.prompt_tokens_details?.cached_tokens || 0;
  return {
    text: r.choices[0].message.content || "",
    usage: { input_tokens: (u.prompt_tokens || 0) - cached, output_tokens: u.completion_tokens || 0, cache_read_input_tokens: cached, cache_creation_input_tokens: 0 },
  };
}

async function callGoogle(model, effort, system, messages, schema) {
  const { GoogleGenAI } = require("@google/genai");
  clients.google ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const r = await Promise.race([
    clients.google.models.generateContent({
      model,
      contents,
      config: { systemInstruction: system, responseMimeType: "application/json", maxOutputTokens: MAX_TOKENS },
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini timed out")), TIMEOUT_MS)),
  ]);
  const u = r.usageMetadata || {};
  const cached = u.cachedContentTokenCount || 0;
  return {
    text: r.text || "",
    usage: { input_tokens: (u.promptTokenCount || 0) - cached, output_tokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), cache_read_input_tokens: cached, cache_creation_input_tokens: 0 },
  };
}

const PROVIDERS = { anthropic: callAnthropic, openai: callOpenAI, google: callGoogle };

function settings(step) {
  const effort = step === "understand" ? process.env.UNDERSTAND_EFFORT || "low" : process.env.ANSWER_EFFORT || "low";
  return {
    provider: process.env.PROVIDER || "anthropic",
    model: step === "understand" ? process.env.UNDERSTAND_MODEL || "claude-haiku-5-5" : process.env.ANSWER_MODEL || "claude-haiku-5-5",
    effort,
    backupProvider: process.env.BACKUP_PROVIDER || "",
    backupModel: process.env.BACKUP_MODEL || "",
  };
}

// A fresh budget for each customer message.
const newBudget = () => ({ calls: 0 });

async function once(provider, model, effort, system, messages, schema, budget) {
  if (budget.calls >= MAX_CALLS_PER_MESSAGE) throw new Error(`model call budget (${MAX_CALLS_PER_MESSAGE}) used up for this message`);
  const call = PROVIDERS[provider];
  if (!call) throw new Error(`Unknown PROVIDER "${provider}"`);
  budget.calls += 1;
  const started = Date.now();
  const { text, usage } = await call(model, effort, system, messages, schema);
  return { text, usage, ms: Date.now() - started, model, provider };
}

// One step (understand or answer). On a timeout or error the step gets one retry: on the backup vendor
// when BACKUP_PROVIDER is set, otherwise on the primary again.
async function callStep(step, { system, messages, schema }, budget) {
  const s = settings(step);
  try {
    return await once(s.provider, s.model, s.effort, system, messages, schema, budget);
  } catch (err) {
    if (err.message.includes("budget")) throw err;
    const useBackup = s.backupProvider && s.backupModel;
    console.error(`[${step}] ${s.provider} failed (${err.name || "error"}); one retry on ${useBackup ? "backup " + s.backupProvider : "the primary"}`);
    return useBackup
      ? await once(s.backupProvider, s.backupModel, s.effort, system, messages, schema, budget)
      : await once(s.provider, s.model, s.effort, system, messages, schema, budget);
  }
}

module.exports = { callStep, newBudget, MAX_CALLS_PER_MESSAGE };

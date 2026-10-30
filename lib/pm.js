// The PM control panel (GET /api/pm): quality, cost, volume bottlenecks and iterations, read only from what
// the app already records. No model call. Sources:
//   logs/messages.jsonl   one masked line per customer message (step 13)
//   logs/feedback.jsonl   "Did this solve it?" answers (Stage 6)
//   data/tickets.json     the agent inbox
//   logs/eval-*.json      every eval run (step 14), logs/bakeoff-*.json the bake-off runs (step 14b)
//   prompts/CHANGELOG.md  every prompt and knowledge version with its scores
// Recommendations follow the Telos pattern (github.com/ProductVoyagers/telos, Apache-2.0): each one is tied
// to a Key Result, ranked HIGH or MEDIUM, tagged with the sub-metric it moves, and recomputed on every load.

const fs = require("fs");
const path = require("path");
const { PRICES, stepCost } = require("./prices");

const ROOT = path.join(__dirname, "..");
const LOGS = path.join(ROOT, "logs");

const readJsonl = (file) => {
  const full = path.join(LOGS, file);
  if (!fs.existsSync(full)) return [];
  return fs.readFileSync(full, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
};
const readJson = (rel, fallback) => {
  const full = path.join(ROOT, rel);
  return fs.existsSync(full) ? JSON.parse(fs.readFileSync(full, "utf8")) : fallback;
};

// The Key Results everything is measured against (lifecycle plan, PRD).
const KRS = [
  { id: "KR1", name: "Verified resolution rate", target: "40% of in-scope chats (pilot hypothesis)", tag: "Resolution" },
  { id: "KR2", name: "Fraud recall", target: "100%, one miss stops the release", tag: "Safety" },
  { id: "KR3", name: "Cost per conversation", target: "under EGP 1", tag: "Cost" },
  { id: "KR4", name: "Speed", target: "p95 under 6 seconds (4 s in the bake-off rule)", tag: "Speed" },
];

const IN_SCOPE = ["fee.explain", "fee.overdraft", "dispute.status", "dispute.documents", "card.replace_damaged", "card.replace_expired", "service.status"];
const REASON = {
  "R-FRAUD": "Fraud protection", "R-COMPLAINT": "Complaint or sensitive", "R-OUT-OF-SCOPE": "Out of scope",
  "R-UNSURE": "Not sure (low confidence)", "R-PERSON": "Asked for a person", "R-CHECK-FAILED": "Failed a safety check",
  "R-NO-SOURCE": "No source in the rules", "R-MODEL-DOWN": "Model busy or down", "R-OFF": "Mode Off",
  "R-WAIT": "Rate limit", "R-EMPTY": "Empty or junk", "R-TOO-LONG": "Too long", "R-DRAFT": "Suggest only: draft",
};

const sum = (list, f) => list.reduce((a, x) => a + (f(x) || 0), 0);
const pct = (n, d) => (d ? n / d : null);
const percentile = (values, p) => {
  const s = values.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null;
};

function liveMetrics(turns, feedback, egpPerUsd) {
  const modelTurns = turns.filter((t) => t.model !== "none");
  const answered = turns.filter((t) => t.action === "answer" && t.model !== "none" && !t.reply_id);
  const handedOff = turns.filter((t) => t.action === "handoff");
  const inScope = turns.filter((t) => IN_SCOPE.includes(t.intent));
  const solved = new Set(feedback.filter((f) => f.rating === "up").map((f) => f.message_id));
  const notSolved = new Set(feedback.filter((f) => f.rating === "down").map((f) => f.message_id));
  const verified = answered.filter((t) => IN_SCOPE.includes(t.intent) && solved.has(t.message_id));
  const fraudTurns = turns.filter((t) => t.priority === "P0");
  const totalUsd = sum(turns, (t) => t.cost_usd);
  const secs = modelTurns.map((t) => t.ms / 1000);
  const answerTurns = turns.filter((t) => t.attempts && t.attempts.answer);
  return {
    messages: turns.length,
    with_ai: modelTurns.length,
    answered_by_ai: answered.length,
    handed_off: handedOff.length,
    fraud_routed: fraudTurns.filter((t) => t.queue === "Fraud").length,
    fraud_total: fraudTurns.length,
    automation_rate: pct(answered.length, turns.length),
    handoff_rate: pct(handedOff.length, turns.length),
    in_scope_messages: inScope.length,
    // North Star proxy in the demo: an in-scope AI answer the customer marked "solved". The real KR also needs
    // "no repeat contact within 7 days", which the pilot measures.
    verified_resolution_rate: pct(verified.length, inScope.length),
    solved_yes: solved.size,
    solved_no: notSolved.size,
    total_usd: totalUsd,
    total_egp: totalUsd * egpPerUsd,
    usd_per_message: pct(totalUsd, turns.length),
    usd_per_answered: pct(sum(answered, (t) => t.cost_usd), answered.length),
    egp_per_answered: pct(sum(answered, (t) => t.cost_usd), answered.length) === null ? null : pct(sum(answered, (t) => t.cost_usd), answered.length) * egpPerUsd,
    p50_seconds: percentile(secs, 0.5),
    p95_seconds: percentile(secs, 0.95),
    retry_rate: pct(answerTurns.filter((t) => t.attempts.answer > 1).length, answerTurns.length),
    cache_share: pct(sum(turns, (t) => t.tokens && t.tokens.cache_read), sum(turns, (t) => t.tokens && t.tokens.cache_read + t.tokens.input)),
  };
}

// Cost, calls and speed per model ID, from every step in the turn log.
function byModel(turns) {
  const rows = {};
  for (const t of turns) {
    for (const s of t.steps || []) {
      const r = (rows[s.model] ||= { model_id: s.model, provider: t.provider || "anthropic", steps: { understand: 0, answer: 0 }, calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, usd: 0, ms: 0, priced: Boolean(PRICES[s.model]) });
      r.steps[s.step] = (r.steps[s.step] || 0) + 1;
      r.calls += s.attempts;
      r.input_tokens += s.input_tokens;
      r.output_tokens += s.output_tokens;
      r.cache_read_tokens += s.cache_read_tokens;
      r.cache_write_tokens += s.cache_write_tokens;
      r.usd += stepCost(s) || 0;
      r.ms += s.ms;
    }
  }
  return Object.values(rows).map((r) => ({ ...r, avg_ms: r.calls ? Math.round(r.ms / r.calls) : null }));
}

// Where the volume piles up: queues (open tickets and how long they've waited), handoff reasons, intents, languages.
function bottlenecks(turns, tickets) {
  const now = Date.now();
  const open = tickets.filter((t) => !["closed", "approved", "resolved_by_customer_choice"].includes(t.status));
  const queues = {};
  for (const t of tickets) {
    const q = (queues[t.queue] ||= { queue: t.queue, total: 0, open: 0, oldest_open_minutes: 0 });
    q.total += 1;
    if (open.includes(t)) {
      q.open += 1;
      q.oldest_open_minutes = Math.max(q.oldest_open_minutes, Math.round((now - new Date(t.created_at)) / 60000));
    }
  }
  const count = (list, key) => {
    const m = {};
    for (const x of list) m[key(x)] = (m[key(x)] || 0) + 1;
    return Object.entries(m).map(([k, n]) => ({ key: k, count: n })).sort((a, b) => b.count - a.count);
  };
  const intents = {};
  for (const t of turns) {
    const r = (intents[t.intent] ||= { intent: t.intent, messages: 0, handed_off: 0, usd: 0 });
    r.messages += 1;
    if (t.action === "handoff") r.handed_off += 1;
    r.usd += t.cost_usd || 0;
  }
  return {
    queues: Object.values(queues).sort((a, b) => b.open - a.open),
    reasons: count(turns.filter((t) => t.reply_id), (t) => t.reply_id).map((r) => ({ ...r, label: REASON[r.key] || r.key })),
    intents: Object.values(intents).sort((a, b) => b.messages - a.messages),
    languages: count(turns, (t) => t.input_language || "unknown"),
  };
}

// Conversation iterations: for each customer, the messages it took to reach an outcome, and what they cost.
// An outcome is an AI answer, a handoff to a person, or a fixed reply that needs nothing more.
function conversationIterations(turns, tickets) {
  const byTicket = Object.fromEntries(tickets.map((t) => [t.ticket_id, t]));
  const open = {};
  const done = [];
  for (const t of turns) {
    const p = (open[t.customerId] ||= { customer: t.customerId, started: t.time, messages: 0, ai_calls: 0, retries: 0, usd: 0, models: new Set() });
    p.messages += 1;
    p.ai_calls += sum(t.steps || [], (s) => s.attempts);
    p.retries += (t.attempts && t.attempts.answer > 1 ? t.attempts.answer - 1 : 0);
    p.usd += t.cost_usd || 0;
    (t.steps || []).forEach((s) => p.models.add(s.model));
    const ended = t.action === "handoff" || (t.action === "answer" && !["R-WAIT", "R-EMPTY", "R-TOO-LONG"].includes(t.reply_id));
    if (ended) {
      const ticket = t.ticket_id ? byTicket[t.ticket_id] : null;
      done.push({
        customer: p.customer,
        intent: t.intent,
        messages: p.messages,
        ai_calls: p.ai_calls,
        retries: p.retries,
        usd: p.usd,
        models: [...p.models].join(", ") || "none (code only)",
        outcome: t.action === "answer" ? (t.customer_choice ? "Answered after the customer picked an option" : "Answered by AI") : `Handed off: ${t.queue || "Agent"}${ticket ? ` (${ticket.status})` : ""}`,
        ticket: t.ticket_id || null,
        time: t.time,
      });
      delete open[t.customerId];
    }
  }
  return done.reverse();
}

// Engineering iterations: every eval run on disk, and every version in the CHANGELOG.
function engineeringIterations() {
  const runs = fs.existsSync(LOGS)
    ? fs.readdirSync(LOGS).filter((f) => /^eval-.*\.json$/.test(f)).sort().map((f) => {
        const r = JSON.parse(fs.readFileSync(path.join(LOGS, f), "utf8"));
        const s = r.scores || {};
        const models = [...new Set((r.cases || []).map((c) => c.reply && c.reply.model).filter(Boolean))];
        return {
          time: r.time,
          verdict: r.verdict,
          fraud_recall: s.fraud_recall,
          harmless: s.harmless,
          security: s.security,
          intent_accuracy: s.intent_accuracy,
          grounded_answers: s.grounded_answers,
          usd: r.cost ? r.cost.total_usd : null,
          models,
        };
      })
    : [];
  const bakeoffs = fs.existsSync(LOGS)
    ? fs.readdirSync(LOGS).filter((f) => /^bakeoff-.*\.json$/.test(f)).sort().map((f) => {
        const b = JSON.parse(fs.readFileSync(path.join(LOGS, f), "utf8"));
        return { run: b.run, config: b.config, verdict: b.verdict || "P2 answer cases only", grounded: b.grounded || (b.scores && b.scores.grounded), p95_seconds: b.stats && b.stats.p95_seconds, usd: b.stats && b.stats.total_usd, models: b.stats && b.stats.models };
      })
    : [];
  const changelog = fs.readFileSync(path.join(ROOT, "prompts", "CHANGELOG.md"), "utf8").split("\n")
    .filter((l) => /^\| \d+\.\d+\.\d+ \|/.test(l))
    .map((l) => {
      const c = l.split("|").slice(1, -1).map((x) => x.trim());
      return { version: c[0], file: c[2], change: c[3], model: c[5], intent_accuracy: c[6], fraud_recall: c[7], harmless: c[8], grounded: c[9], verdict: c[11] };
    });
  return { runs, bakeoffs, changelog, eval_usd: sum(runs, (r) => r.usd), bakeoff_usd: sum(bakeoffs, (b) => b.usd) };
}

// Telos-style recommendations, recomputed from the numbers on every load.
function recommend(live, models, neck, eng) {
  const recs = [];
  const add = (impact, kr, tag, title, why, action) => recs.push({ impact, kr, tag, title, why, action });
  if (!live.messages) {
    add("MEDIUM", "KR1", "Resolution", "No live chats yet", "The panel reads the turn log, which is empty after a demo reset.", "Run the demo script or the eval, then refresh.");
  }
  if (live.fraud_total && live.fraud_routed < live.fraud_total) {
    add("HIGH", "KR2", "Safety", `${live.fraud_total - live.fraud_routed} fraud message(s) not in the Fraud queue`, "One fraud miss stops the release.", "Switch the mode to Off, read those turns, add the phrase to the fraud word list, rerun step 14.");
  }
  const fraudQueue = neck.queues.find((q) => q.queue === "Fraud");
  if (fraudQueue && fraudQueue.open) {
    add("HIGH", "KR2", "Safety", `${fraudQueue.open} fraud ticket(s) waiting, oldest ${fraudQueue.oldest_open_minutes} min`, "A customer being robbed is waiting for the Fraud team.", "Staff the Fraud queue first; it should never be the bottleneck.");
  }
  const unsure = neck.reasons.find((r) => r.key === "R-UNSURE");
  if (unsure && live.messages && unsure.count / live.messages > 0.1) {
    const top = neck.intents.filter((i) => i.handed_off).slice(0, 2).map((i) => i.intent).join(", ");
    add("HIGH", "KR1", "Resolution", `${unsure.count} handoffs because the copilot wasn't sure (${Math.round((unsure.count / live.messages) * 100)}% of messages)`, "Each one is an in-scope question a person has to answer.", `Learning loop: add reworded approved examples for the phrasings behind ${top || "these intents"}, then rerun step 14. Don't lower the 0.7 threshold: the bake-off showed labels at 0.6 to 0.69 were wrong 59% of the time.`);
  }
  const busiest = neck.queues.find((q) => q.open);
  if (busiest && busiest.queue !== "Fraud") {
    const reason = neck.reasons.filter((r) => !["R-FRAUD", "R-WAIT", "R-EMPTY", "R-TOO-LONG"].includes(r.key))[0];
    add("MEDIUM", "KR1", "Resolution", `Bottleneck: ${busiest.queue} queue has ${busiest.open} open, oldest ${busiest.oldest_open_minutes} min`, `Top handoff reason: ${reason ? reason.label : "n/a"}.`, "Check whether that reason is in scope. If it keeps growing, frame it as a new intent (lifecycle stage 9, monthly taxonomy review).");
  }
  if (live.solved_yes + live.solved_no >= 3 && live.solved_no / (live.solved_yes + live.solved_no) > 0.2) {
    add("HIGH", "KR1", "Resolution", `${live.solved_no} "not solved" answers (${Math.round((live.solved_no / (live.solved_yes + live.solved_no)) * 100)}%)`, "Answers that don't solve the problem become repeat contacts and break the North Star.", "Read those turns in the log, group them into failure types, fix the biggest one first.");
  }
  if (live.verified_resolution_rate !== null && live.in_scope_messages >= 5 && live.verified_resolution_rate < 0.4) {
    add("HIGH", "KR1", "Resolution", `Verified resolution ${Math.round(live.verified_resolution_rate * 100)}%, under the 40% target`, "Only answers the customer confirmed as solved count.", "Make sure every AI answer asks \"Did this solve it?\"; then work the top handoff reason.");
  }
  if (live.egp_per_answered !== null && live.egp_per_answered > 1) {
    add("HIGH", "KR3", "Cost", `EGP ${live.egp_per_answered.toFixed(2)} per answered message, over EGP 1`, "The business case assumes a chat costs far less than an agent contact.", "Check the model per step below; move the answer step back to the cheapest model that passed the bake-off.");
  }
  if (live.p95_seconds !== null && live.p95_seconds > 4) {
    add("MEDIUM", "KR4", "Speed", `p95 ${live.p95_seconds.toFixed(1)} s`, "The bake-off rule wants p95 under 4 s; the launch gate is 6 s.", "Each message makes two AI calls; keep answer effort low, and check cache reads are high.");
  }
  if (live.retry_rate !== null && live.retry_rate > 0.05) {
    add("MEDIUM", "KR1", "Trust", `${Math.round(live.retry_rate * 100)}% of answers needed a retry`, "Retries add cost and latency, and a second failure goes to a person.", "See which check failed in the log (failed_check) and add a \"bad, then fixed\" example to answer.md.");
  }
  const unpriced = models.filter((m) => !m.priced);
  if (unpriced.length) {
    add("MEDIUM", "KR3", "Cost", `No price for ${unpriced.map((m) => m.model_id).join(", ")}`, "Costs for this model show as zero.", "Add its prices to lib/prices.js.");
  }
  const last = eng.runs[eng.runs.length - 1];
  if (last && last.verdict !== "SHIP") {
    add("HIGH", "KR2", "Safety", `Last eval run said ${last.verdict}`, "Nothing ships until the eval says SHIP.", "Fix the failing gate and rerun step 14.");
  }
  if (!recs.length) add("MEDIUM", "KR1", "Resolution", "All Key Results on track", "No alert fired on the current numbers.", "Keep the weekly cycle: monitoring, top 3 failures, fix, eval.");
  return recs.sort((a, b) => (a.impact === b.impact ? 0 : a.impact === "HIGH" ? -1 : 1));
}

function pmReport({ mode }) {
  const turns = readJsonl("messages.jsonl");
  const feedback = readJsonl("feedback.jsonl");
  const tickets = readJson("data/tickets.json", []);
  const egpPerUsd = Number(process.env.EGP_PER_USD || 50);
  const live = liveMetrics(turns, feedback, egpPerUsd);
  const models = byModel(turns);
  const neck = bottlenecks(turns, tickets);
  const eng = engineeringIterations();
  return {
    generated_at: new Date().toISOString(),
    mode,
    egp_per_usd: egpPerUsd,
    krs: KRS,
    live,
    models,
    bottlenecks: neck,
    conversations: conversationIterations(turns, tickets).slice(0, 30),
    engineering: eng,
    baseline: readJson("docs/baseline.json", null),
    recommendations: recommend(live, models, neck, eng),
    mode_changes: readJsonl("mode.jsonl").slice(-10).reverse(),
  };
}

module.exports = { pmReport };

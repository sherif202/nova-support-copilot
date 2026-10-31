// The ROI model for the PM panel (docs/ROI-MODEL.md). Every number is a rollup of one request-level log: each
// record carries the metadata captured once at the request entry point (customer, segment, business line,
// workflow, prompt version, model IDs, deployment mode, tokens, retries, latency, cost, outcome), plus
// verified_resolved from "Did this solve your question?". User, workflow, conversation ("agent run"), prompt
// version and cost-per-successful-answer views all come from the same records, with no separate attribution logic.
// Value and the projection use the synthetic assumptions in lib/roi-config.js. No model call.

const cfg = require("./roi-config");
const { EGP_PER_USD } = require("./prices");

const IN_SCOPE = ["fee.explain", "fee.overdraft", "dispute.status", "dispute.documents", "card.replace_damaged", "card.replace_expired", "service.status", "txn.status", "txn.incoming"];
const TIER_ORDER = ["S", "M", "L", "XL", "XXL"];

const sum = (list, f) => list.reduce((a, x) => a + (f(x) || 0), 0);
const median = (values) => {
  const s = values.slice().sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const tierOf = (egp) => (egp <= cfg.TIERS_EGP.S ? "S" : egp <= cfg.TIERS_EGP.M ? "M" : egp <= cfg.TIERS_EGP.L ? "L" : egp <= cfg.TIERS_EGP.XL ? "XL" : "XXL");

// Turn log lines (logs/messages.jsonl) into request records. Lines written before the attribution fields existed
// are filled in from the older fields, so old logs still roll up. A conversation without an ID runs, per customer,
// until an outcome (an AI answer or a handoff), the same rule as the panel's "iterations" table.
function recordsFromTurns(turns, feedback, plans) {
  const solved = new Set(feedback.filter((f) => f.rating === "up").map((f) => f.message_id));
  const openConv = {};
  let n = 0;
  return turns.map((t) => {
    const customer = t.customer_id || t.customerId;
    const conversation = t.conversation_id || (openConv[customer] ||= `CONV-${customer}-${++n}`);
    const answered = t.action === "answer" && !t.reply_id && t.model !== "none";
    const outcome = t.outcome || (t.priority === "P0" || t.queue === "Fraud" ? "fraud" : answered ? "answered" : t.action === "handoff" ? "handoff" : "fixed_reply");
    if (!t.conversation_id && (t.action === "handoff" || (t.action === "answer" && !["R-WAIT", "R-EMPTY", "R-TOO-LONG"].includes(t.reply_id)))) delete openConv[customer];
    const steps = t.steps || [];
    const tokens = t.tokens || { input: 0, output: 0, cache_read: 0, cache_write: 0 };
    return {
      request_id: t.request_id || t.message_id,
      conversation_id: conversation,
      customer_id: customer,
      segment: t.segment || plans[customer] || "unknown",
      business_line: t.business_line || cfg.businessLine(plans[customer]),
      workflow: t.workflow || t.intent || "unknown",
      prompt_version: t.prompt_version || (t.prompts ? `understand ${t.prompts.understand} / answer ${t.prompts.answer}` : "unknown"),
      model_ids: t.model_ids || [...new Set(steps.map((s) => s.model))],
      deployment: t.deployment || t.mode || "auto",
      tokens_in: tokens.input + tokens.cache_read + tokens.cache_write,
      tokens_out: tokens.output,
      retries: t.retries ?? sum(steps, (s) => Math.max(0, s.attempts - 1)),
      latency_ms: t.latency_ms ?? t.ms,
      cost_usd: t.cost_usd || 0,
      cost_egp: (t.cost_usd || 0) * EGP_PER_USD,
      outcome,
      verified_resolved: answered && solved.has(t.message_id),
      time: t.time,
    };
  });
}

// One row per conversation: what it cost, whether it was resolved, and the agent time that saved.
function conversationsOf(records, minutes) {
  const byId = {};
  for (const r of records) {
    const c = (byId[r.conversation_id] ||= { id: r.conversation_id, customer_id: r.customer_id, business_line: r.business_line, segment: r.segment, requests: 0, retries: 0, cost_egp: 0, resolved: false, start: r.time });
    c.requests += 1;
    c.retries += r.retries || 0;
    c.cost_egp += r.cost_egp;
    c.resolved = c.resolved || r.verified_resolved;
    c.workflow = r.workflow;
    c.outcome = r.outcome;
    c.end = r.time;
  }
  return Object.values(byId).map((c) => {
    const m = minutes[c.workflow] ?? minutes.default;
    return { ...c, agent_minutes: m, value_egp: c.resolved ? m * cfg.AGENT_EGP_PER_MINUTE : 0, tier: tierOf(c.cost_egp) };
  });
}

function workloadAdvice(w, medianCost) {
  if (w.cost_egp === 0) return { action: "Route only", why: "Handled in code before any AI call (fraud goes straight to a person): no AI cost." };
  if (!IN_SCOPE.includes(w.workflow) && w.resolved) return { action: "Keep", why: "General question, answered from Nova's facts when they cover it; the rest go to a person." };
  if (!IN_SCOPE.includes(w.workflow)) return { action: "Route only", why: "Out of scope or a person's job: the AI only labels and routes it, so the cost is the understanding step. Keep." };
  if (w.conversations >= 3 && w.resolved === 0) return { action: "Sunset", why: "Pays for an answer attempt and never resolves: stop answering it with AI and send it straight to a person, or fix its knowledge first." };
  if (w.resolution_rate < 0.5) return { action: "Re-price / review", why: "Most still go to a person after the AI cost: close the knowledge gap, or charge the cost to the owning business line." };
  if (w.cost_per_conversation > medianCost) return { action: "Optimise", why: "Resolves well but costs more than the median: check retries, caching and whether a cheaper model passes the eval." };
  return { action: "Keep", why: "Resolves well at a low cost." };
}

// Monday of the week, as YYYY-MM-DD.
const weekOf = (iso) => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

function roiReport(records, { source }) {
  const minutes = cfg.minutesByWorkflow();
  const convs = conversationsOf(records, minutes);
  const n = convs.length;
  const resolved = convs.filter((c) => c.resolved);
  const aiCost = sum(convs, (c) => c.cost_egp);
  const value = sum(convs, (c) => c.value_egp);
  const avgCost = n ? aiCost / n : 0;
  const avgValue = n ? value / n : 0;

  // ROI: on this data set with a full month's fixed cost, and projected to the monthly volume in the config.
  const monthlyValue = cfg.MONTHLY_CONTACTS * avgValue;
  const monthlyAi = cfg.MONTHLY_CONTACTS * avgCost;
  const netPerConversation = avgValue - avgCost;
  const roi = {
    conversations: n,
    resolved: resolved.length,
    resolution_rate: n ? resolved.length / n : null,
    value_egp: value,
    ai_cost_egp: aiCost,
    agent_minutes_saved: sum(resolved, (c) => c.agent_minutes),
    cost_per_successful_answer_egp: resolved.length ? aiCost / resolved.length : null,
    data_set_roi: n ? (value - aiCost - cfg.FIXED_MONTHLY_EGP) / (aiCost + cfg.FIXED_MONTHLY_EGP) : null,
    monthly: {
      contacts: cfg.MONTHLY_CONTACTS,
      value_egp: monthlyValue,
      ai_cost_egp: monthlyAi,
      fixed_egp: cfg.FIXED_MONTHLY_EGP,
      roi: n ? (monthlyValue - monthlyAi - cfg.FIXED_MONTHLY_EGP) / (monthlyAi + cfg.FIXED_MONTHLY_EGP) : null,
    },
    payback_conversations: netPerConversation > 0 ? Math.ceil(cfg.FIXED_MONTHLY_EGP / netPerConversation) : null,
  };

  // Size tiers: S to L should cover at least 80% of conversations; XL and XXL are reviewed and charged back.
  const tiers = TIER_ORDER.map((t) => {
    const list = convs.filter((c) => c.tier === t);
    return { tier: t, limit_egp: cfg.TIERS_EGP[t] ?? null, conversations: list.length, share: n ? list.length / n : 0, cost_egp: sum(list, (c) => c.cost_egp) };
  });
  const withinSL = n ? convs.filter((c) => ["S", "M", "L"].includes(c.tier)).length / n : null;
  const big = convs.filter((c) => ["XL", "XXL"].includes(c.tier));
  const lines = [...new Set(convs.map((c) => c.business_line))].sort();
  const chargeback = lines.map((line) => {
    const list = big.filter((c) => c.business_line === line);
    return { business_line: line, conversations: list.length, cost_egp: sum(list, (c) => c.cost_egp), above_l_egp: sum(list, (c) => c.cost_egp - cfg.TIERS_EGP.L) };
  });

  // What to track: customers, workloads, demands.
  const customers = Object.values(convs.reduce((m, c) => {
    const r = (m[c.customer_id] ||= { customer_id: c.customer_id, business_line: c.business_line, conversations: 0, resolved: 0, cost_egp: 0, value_egp: 0, costs: [] });
    r.conversations += 1;
    r.resolved += c.resolved ? 1 : 0;
    r.cost_egp += c.cost_egp;
    r.value_egp += c.value_egp;
    r.costs.push(c.cost_egp);
    return m;
  }, {})).map(({ costs, ...r }) => {
    const mean = r.cost_egp / r.conversations;
    const spread = costs.length > 1 ? Math.sqrt(sum(costs, (x) => (x - mean) ** 2) / costs.length) / (mean || 1) : 0;
    return { ...r, margin_egp: r.value_egp - r.cost_egp, cost_variation: spread, negative: r.value_egp < r.cost_egp };
  }).sort((a, b) => a.margin_egp - b.margin_egp);

  const workflowNames = [...new Set(convs.map((c) => c.workflow))];
  // "Optimise" compares in-scope workflows with each other: the median cost per conversation across them.
  const inScopeCosts = workflowNames.filter((wf) => IN_SCOPE.includes(wf)).map((wf) => {
    const list = convs.filter((c) => c.workflow === wf);
    return sum(list, (c) => c.cost_egp) / list.length;
  });
  const medianCost = median(inScopeCosts) || 0;
  const workloads = workflowNames.map((wf) => {
    const list = convs.filter((c) => c.workflow === wf);
    const w = {
      workflow: wf,
      in_scope: IN_SCOPE.includes(wf),
      conversations: list.length,
      resolved: list.filter((c) => c.resolved).length,
      cost_egp: sum(list, (c) => c.cost_egp),
      value_egp: sum(list, (c) => c.value_egp),
      agent_minutes: minutes[wf] ?? minutes.default,
    };
    w.resolution_rate = w.conversations ? w.resolved / w.conversations : 0;
    w.cost_per_conversation = w.conversations ? w.cost_egp / w.conversations : 0;
    w.cost_share = aiCost ? w.cost_egp / aiCost : 0;
    return { ...w, ...workloadAdvice(w, medianCost) };
  }).sort((a, b) => b.cost_egp - a.cost_egp);

  const weeks = Object.entries(convs.reduce((m, c) => ((m[weekOf(c.start)] = (m[weekOf(c.start)] || 0) + 1), m), {}))
    .sort(([a], [b]) => (a < b ? -1 : 1)).map(([week, conversations]) => ({ week, conversations }));
  // Growth: the last 4 complete weeks against the 4 before (the newest week is usually partial, so it is left out).
  const full = weeks.slice(0, -1);
  const last4 = sum(full.slice(-4), (w) => w.conversations), prev4 = sum(full.slice(-8, -4), (w) => w.conversations);
  const growth = prev4 ? last4 / prev4 - 1 : null;
  const projectedAi = monthlyAi * (1 + Math.max(0, growth || 0));
  const demands = {
    weeks,
    growth,
    monthly_budget_egp: cfg.MONTHLY_AI_BUDGET_EGP,
    projected_monthly_ai_egp: projectedAi,
    headroom_egp: cfg.MONTHLY_AI_BUDGET_EGP - projectedAi,
    alert: projectedAi > cfg.MONTHLY_AI_BUDGET_EGP ? "over" : growth !== null && growth > cfg.GROWTH_ALERT ? "growth" : null,
  };

  // Credits: 1 credit = the AI cost of a median S conversation that called a model.
  const creditEgp = median(convs.filter((c) => c.tier === "S" && c.cost_egp > 0).map((c) => c.cost_egp));
  const credits = {
    credit_egp: creditEgp,
    lines: lines.map((line) => {
      const list = convs.filter((c) => c.business_line === line);
      const share = n ? list.length / n : 0;
      const lineAvg = list.length ? sum(list, (c) => c.cost_egp) / list.length : 0;
      const monthlyCredits = creditEgp ? (cfg.MONTHLY_CONTACTS * share * lineAvg) / creditEgp : null;
      const budget = cfg.MONTHLY_CREDIT_BUDGET[line] ?? null;
      return { business_line: line, share, data_set_credits: creditEgp ? sum(list, (c) => c.cost_egp) / creditEgp : null, monthly_credits: monthlyCredits, monthly_budget: budget, use: budget && monthlyCredits !== null ? monthlyCredits / budget : null };
    }),
  };

  // Rollups from the same records.
  const promptVersions = Object.values(records.reduce((m, r) => {
    const v = (m[r.prompt_version] ||= { prompt_version: r.prompt_version, requests: 0, cost_egp: 0, resolved: 0 });
    v.requests += 1;
    v.cost_egp += r.cost_egp;
    v.resolved += r.verified_resolved ? 1 : 0;
    return m;
  }, {})).map((v) => ({ ...v, cost_per_successful_answer_egp: v.resolved ? v.cost_egp / v.resolved : null }));
  const runs = convs.slice().sort((a, b) => b.cost_egp - a.cost_egp).slice(0, 8)
    .map((c) => ({ id: c.id, customer_id: c.customer_id, workflow: c.workflow, requests: c.requests, retries: c.retries, cost_egp: c.cost_egp, tier: c.tier, outcome: c.outcome, long_loop: c.requests >= 4 || c.retries >= 2 }));

  return {
    source,
    assumptions: {
      agent_egp_per_minute: cfg.AGENT_EGP_PER_MINUTE, fixed_monthly_egp: cfg.FIXED_MONTHLY_EGP, monthly_contacts: cfg.MONTHLY_CONTACTS,
      monthly_ai_budget_egp: cfg.MONTHLY_AI_BUDGET_EGP, egp_per_usd: EGP_PER_USD, tiers_egp: cfg.TIERS_EGP,
    },
    roi, tiers, within_s_to_l: withinSL, chargeback, customers, workloads, demands, credits, prompt_versions: promptVersions, runs,
  };
}

// ROI and cost findings for the panel's automatic recommendations (same Telos format as lib/pm.js).
function roiRecommendations(r) {
  const recs = [];
  const add = (impact, kr, tag, title, why, action) => recs.push({ impact, kr, tag, title: r.source === "sample" ? `${title} (sample data)` : title, why, action });
  if (!r.roi.conversations) return recs;
  const pctOf = (x) => `${Math.round(x * 100)}%`;
  if (r.roi.monthly.roi !== null && r.roi.monthly.roi < 0) {
    add("HIGH", "KR3", "ROI", `Projected ROI ${pctOf(r.roi.monthly.roi)} at ${r.roi.monthly.contacts.toLocaleString("en-US")} contacts a month`, "The value of resolved conversations doesn't cover the AI and fixed costs.", `Raise the resolution rate on the top workflows, or cut the fixed cost. Payback needs ${r.roi.payback_conversations ?? "more"} conversations a month.`);
  }
  if (r.within_s_to_l !== null && r.within_s_to_l < 0.8) {
    add("HIGH", "KR3", "Cost", `Only ${pctOf(r.within_s_to_l)} of conversations within S to L (target 80%)`, "Too many conversations cost more than the L limit, so a flat budget won't hold.", "Read the XL and XXL conversations below: long loops and retries first. Charge the rest to the owning business line.");
  }
  const sunset = r.workloads.filter((w) => w.action === "Sunset");
  if (sunset.length) add("MEDIUM", "KR1", "Workload", `${sunset.length} workflow(s) never resolve: ${sunset.map((w) => w.workflow).join(", ")}`, "They pay for an answer attempt and still go to a person.", "Send them straight to a person, or fix their knowledge and rerun the eval.");
  const negative = r.customers.filter((c) => c.negative && c.cost_egp > 0);
  if (negative.length) add("MEDIUM", "KR3", "Margin", `${negative.length} customer(s) cost more than they save`, "No resolved conversation, so the AI cost has no value against it. Usually out-of-scope or high-variance questions.", "Check whether they ask about something in scope that the knowledge base lacks.");
  if (r.demands.alert === "over") add("HIGH", "KR3", "Demand", `Projected AI spend EGP ${Math.round(r.demands.projected_monthly_ai_egp)} a month, over the EGP ${r.demands.monthly_budget_egp} budget`, "Growth in a flat budget silently eats the margin.", "Raise the committed budget tier, or cut cost per conversation (caching, a cheaper model) before volume grows further.");
  else if (r.demands.alert === "growth") add("MEDIUM", "KR3", "Demand", `Volume grew ${pctOf(r.demands.growth)} in the last 4 weeks with a flat budget`, "Margin shrinks if growth continues at this cost per conversation.", "Watch the projected spend against the budget weekly.");
  for (const l of r.credits.lines.filter((x) => x.use !== null && x.use > 0.8)) {
    add(l.use > 1 ? "HIGH" : "MEDIUM", "KR3", "Credits", `${l.business_line} would use ${pctOf(l.use)} of its monthly credits`, "Credits keep budgets fixed while model prices change.", l.use > 1 ? "Agree a bigger credit budget with the business line, or reduce its XL and XXL conversations." : "Review its XL and XXL conversations before the month ends.");
  }
  const loops = r.runs.filter((x) => x.long_loop);
  if (loops.length) add("MEDIUM", "KR4", "Cost", `${loops.length} long or retrying conversation(s) among the most expensive`, "Long-tail loops and retries drive cost and waiting time.", "Read them in the turn log; add a \"bad, then fixed\" example for the failing check.");
  return recs;
}

module.exports = { roiReport, roiRecommendations, recordsFromTurns };
